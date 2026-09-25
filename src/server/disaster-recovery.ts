import "server-only";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, requirePlatform } from "./policy";

const environments = new Set(["development", "test", "staging", "production"]);
export type BackupStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "DELETED";
export function nextBackupStatus(from: BackupStatus, to: BackupStatus) {
  const allowed: Record<BackupStatus, BackupStatus[]> = {
    PENDING: ["RUNNING", "FAILED"],
    RUNNING: ["SUCCEEDED", "FAILED"],
    SUCCEEDED: ["EXPIRED", "DELETED"],
    FAILED: ["DELETED"],
    EXPIRED: ["DELETED"],
    DELETED: [],
  };
  if (!allowed[from].includes(to))
    throw new AccessError(409, "Ungültiger Backup-Statuswechsel.");
  return to;
}
export function restoreChecksPassed(checks: Record<string, boolean>) {
  const required = [
    "databaseReachable",
    "tenantData",
    "rolesConsistent",
    "criticalForeignKeys",
    "schemaCompatible",
  ];
  return required.every((key) => checks[key] === true);
}
export function publicBackupMetadata(row: {
  id: string;
  status: string;
  environment: string;
  sizeBytes?: bigint | null;
  sha256?: string | null;
  storageReference: string;
}) {
  return {
    id: row.id,
    status: row.status,
    environment: row.environment,
    sizeBytes: row.sizeBytes?.toString() ?? null,
    sha256: row.sha256 ?? null,
    storageReference: row.storageReference,
  };
}

export function assertBackupEnvironment(environment: string) {
  if (!environments.has(environment))
    throw new AccessError(400, "Ungültige Backup-Umgebung.");
  return environment;
}
export function assertRestoreDatabase(name: string) {
  if (!/^meterwerk_restore_[a-z0-9_]{1,32}$/.test(name))
    throw new AccessError(
      400,
      "Restore-Ziel muss eine isolierte meterwerk_restore_-Datenbank sein.",
    );
  return name;
}

export async function registerBackup(input: {
  type: string;
  environment: string;
  startedAt: Date;
  completedAt?: Date;
  status: BackupStatus;
  appVersion: string;
  gitCommit: string;
  migrationVersion: string;
  sizeBytes?: bigint;
  sha256?: string;
  storageReference: string;
  retentionExpiresAt?: Date;
  errorReason?: string;
}) {
  const actor = await requireActor();
  requirePlatform(actor);
  assertBackupEnvironment(input.environment);
  if (
    input.storageReference.includes("\0") ||
    input.storageReference.includes("..")
  )
    throw new AccessError(400, "Ungültige Storage-Referenz.");
  const row = await db.backupRecord.create({
    data: { ...input, errorReason: input.errorReason?.slice(0, 500) },
  });
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: row.id,
      action: "recovery.backup.registered",
      details: { status: row.status, environment: row.environment },
    },
  });
  return { ...row, sizeBytes: row.sizeBytes?.toString() ?? null };
}

export async function verifyBackupFile(
  file: string,
  expectedSha256: string,
  expectedSize?: number,
) {
  const info = await stat(file);
  if (
    !info.isFile() ||
    (expectedSize !== undefined && info.size !== expectedSize)
  )
    return { valid: false, reason: "size-or-file-invalid" };
  const bytes = await readFile(file);
  if (bytes.subarray(0, 5).toString() !== "PGDMP")
    return { valid: false, reason: "unsupported-backup-format" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return sha256 === expectedSha256
    ? { valid: true, sha256, sizeBytes: info.size }
    : {
        valid: false,
        reason: "checksum-mismatch",
        sha256,
        sizeBytes: info.size,
      };
}

export async function listRecoveryMetadata() {
  const actor = await requireActor();
  requirePlatform(actor);
  const [backups, restore] = await Promise.all([
    db.backupRecord.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        environment: true,
        startedAt: true,
        completedAt: true,
        status: true,
        appVersion: true,
        gitCommit: true,
        migrationVersion: true,
        sizeBytes: true,
        sha256: true,
        retentionExpiresAt: true,
        errorReason: true,
      },
    }),
    db.restoreTestRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        backupId: true,
        targetDatabase: true,
        status: true,
        startedAt: true,
        completedAt: true,
        checks: true,
        errorReason: true,
      },
    }),
  ]);
  return {
    latestSuccessful: backups.find((b) => b.status === "SUCCEEDED") ?? null,
    backups: backups.map((b) => ({
      ...b,
      sizeBytes: b.sizeBytes?.toString() ?? null,
    })),
    lastRestoreTest: restore,
  };
}

export async function beginRestoreTest(
  backupId: string,
  targetDatabase: string,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  assertRestoreDatabase(targetDatabase);
  const backup = await db.backupRecord.findUnique({
    where: { id: backupId },
    select: { id: true, status: true, environment: true },
  });
  if (!backup || backup.status !== "SUCCEEDED")
    throw new AccessError(404, "Kein erfolgreiches Backup gefunden.");
  const run = await db.restoreTestRun.create({
    data: {
      backupId,
      targetDatabase,
      status: "TESTING",
      startedAt: new Date(),
    },
  });
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: run.id,
      action: "recovery.restore-test.started",
      details: { backupId, targetDatabase },
    },
  });
  return run;
}

export async function recordRecoveryEvent(
  action:
    | "backup.failed"
    | "backup.stale"
    | "backup.checksum.invalid"
    | "restore-test.failed"
    | "storage.unreachable",
  entityId: string,
  details: Record<string, string> = {},
) {
  const prior = await db.auditEvent.findFirst({
    where: {
      action: `recovery.${action}`,
      entityId,
      createdAt: { gte: new Date(Date.now() - 3600000) },
    },
    select: { id: true },
  });
  if (prior) return { deduplicated: true, id: prior.id };
  const event = await db.auditEvent.create({
    data: {
      actorId: "system",
      entityId,
      action: `recovery.${action}`,
      details,
    },
  });
  return { deduplicated: false, id: event.id };
}

export type RetentionPolicy = {
  daily: number;
  weekly: number;
  monthly: number;
};
export function retentionKeep(
  date: Date,
  now: Date,
  policy: RetentionPolicy,
  kept: { daily: number; weekly: number; monthly: number },
) {
  const age = now.getTime() - date.getTime();
  if (age < 7 * 86400000)
    return kept.daily < policy.daily ? "KEEP" : "EXPIRE_CANDIDATE";
  if (date.getUTCDay() === 0)
    return kept.weekly < policy.weekly ? "KEEP" : "EXPIRE_CANDIDATE";
  if (date.getUTCDate() === 1)
    return kept.monthly < policy.monthly ? "KEEP" : "EXPIRE_CANDIDATE";
  return "EXPIRE_CANDIDATE";
}
export function backupRetry(attempt: number, now = new Date()) {
  return {
    attempts: attempt + 1,
    nextRetryAt: new Date(
      now.getTime() + Math.min(3600000, 1000 * 2 ** Math.max(0, attempt)),
    ),
  };
}
export function consistencyStatus(input: {
  references: number;
  objects: number;
  checksumFailures: number;
  unknown: number;
}) {
  if (input.checksumFailures > 0 || input.objects < input.references)
    return "INCONSISTENT" as const;
  if (input.unknown > 0 || input.objects > input.references)
    return "WARNING" as const;
  return "CONSISTENT" as const;
}
export function assertPitrTarget(
  environment: string,
  approved: boolean,
  target: string,
) {
  assertBackupEnvironment(environment);
  assertRestoreDatabase(target);
  if (environment === "production" || !approved)
    throw new AccessError(
      403,
      "PITR benötigt ein ausdrücklich freigegebenes Restore-Testziel.",
    );
  return true;
}
export async function recoveryDashboard() {
  const actor = await requireActor();
  requirePlatform(actor);
  const [schedule, latest, restore] = await Promise.all([
    db.backupSchedule.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        environment: true,
        nextRunAt: true,
        status: true,
        lastSuccessfulAt: true,
        lastError: true,
      },
    }),
    db.backupRecord.findFirst({
      where: { status: "SUCCEEDED" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, status: true, sha256: true },
    }),
    db.restoreTestRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: { status: true, completedAt: true, errorReason: true },
    }),
  ]);
  const age = latest?.completedAt
    ? Date.now() - latest.completedAt.getTime()
    : null;
  return {
    status: !latest
      ? "CRITICAL"
      : age !== null && age > 36 * 3600000
        ? "DEGRADED"
        : "HEALTHY",
    schedule,
    latestBackup: latest
      ? { completedAt: latest.completedAt, ageMs: age }
      : null,
    lastRestoreTest: restore,
    pitrReadiness: "CONFIGURED_TEST_ONLY",
    storage: "UNKNOWN",
    consistency: "UNKNOWN",
  };
}

export async function ensureBackupSchedule(input: {
  environment: string;
  cron: string;
  nextRunAt: Date;
  dailyKeep?: number;
  weeklyKeep?: number;
  monthlyKeep?: number;
}) {
  const actor = await requireActor();
  requirePlatform(actor);
  assertBackupEnvironment(input.environment);
  return db.backupSchedule.upsert({
    where: { environment: input.environment },
    create: { ...input },
    update: {
      cron: input.cron,
      nextRunAt: input.nextRunAt,
      dailyKeep: input.dailyKeep ?? 7,
      weeklyKeep: input.weeklyKeep ?? 4,
      monthlyKeep: input.monthlyKeep ?? 12,
      enabled: true,
    },
  });
}
export async function claimDueBackupSchedule(now = new Date()) {
  const schedule = await db.backupSchedule.findFirst({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: { nextRunAt: "asc" },
  });
  if (!schedule) return null;
  const claimed = await db.backupSchedule.updateMany({
    where: {
      id: schedule.id,
      enabled: true,
      nextRunAt: schedule.nextRunAt,
      status: { not: "RUNNING" },
    },
    data: { status: "RUNNING", lastStartedAt: now, attempts: { increment: 1 } },
  });
  return claimed.count ? schedule : null;
}

export type DrResult = "PASSED" | "FAILED" | "UNKNOWN";
export function evaluateRecoveryTarget(
  targetSeconds: number | null | undefined,
  observedSeconds: number | null | undefined,
): DrResult {
  if (targetSeconds == null || observedSeconds == null) return "UNKNOWN";
  return observedSeconds <= targetSeconds ? "PASSED" : "FAILED";
}
export function assertDrillEnvironment(environment: string) {
  if (!(["test", "staging"] as string[]).includes(environment))
    throw new AccessError(
      403,
      "DR-Übungen sind nur in TEST oder STAGING erlaubt.",
    );
  return environment;
}
export const failureScenarioCatalog = [
  "web-app",
  "postgresql",
  "mqtt",
  "rules-worker",
  "device-worker",
  "notification-worker",
  "report-worker",
  "backup-worker",
  "object-storage",
  "multi-worker",
  "database-and-web",
  "storage-database-inconsistency",
  "failed-deployment",
  "corrupt-configuration",
  "secret-rotation",
] as const;
export function drillStatusFor(
  findings: number,
  checksPassed: boolean,
): "PASSED" | "PASSED_WITH_FINDINGS" | "FAILED" {
  if (!checksPassed) return "FAILED";
  return findings > 0 ? "PASSED_WITH_FINDINGS" : "PASSED";
}
export function rtoSeconds(
  start: Date | null | undefined,
  end: Date | null | undefined,
) {
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export async function startDrDrill(input: {
  type: string;
  environment: string;
  plannedAt?: Date;
  ownerId?: string;
  nextDrillAt?: Date;
}) {
  const actor = await requireActor();
  requirePlatform(actor);
  assertDrillEnvironment(input.environment);
  const drill = await db.drDrill.create({
    data: { ...input, status: "RUNNING", performedAt: new Date() },
  });
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: drill.id,
      action: "recovery.drill.started",
      details: { type: input.type, environment: input.environment },
    },
  });
  return drill;
}
export async function completeDrDrill(input: {
  id: string;
  checksPassed: boolean;
  findings?: number;
  incidentStartedAt?: Date;
  recoveryStartedAt?: Date;
  rpoTargetSeconds?: number;
  rpoObservedSeconds?: number;
  rtoTargetSeconds?: number;
  completedAt?: Date;
}) {
  const actor = await requireActor();
  requirePlatform(actor);
  const rpoStatus = evaluateRecoveryTarget(
    input.rpoTargetSeconds,
    input.rpoObservedSeconds,
  );
  const rtoObserved = rtoSeconds(
    input.recoveryStartedAt,
    input.completedAt ?? new Date(),
  );
  const rtoStatus = evaluateRecoveryTarget(input.rtoTargetSeconds, rtoObserved);
  const status = drillStatusFor(
    input.findings ?? 0,
    input.checksPassed && rpoStatus !== "FAILED" && rtoStatus !== "FAILED",
  );
  const drill = await db.drDrill.update({
    where: { id: input.id },
    data: {
      status,
      completedAt: input.completedAt ?? new Date(),
      incidentStartedAt: input.incidentStartedAt,
      recoveryStartedAt: input.recoveryStartedAt,
      rpoTargetSeconds: input.rpoTargetSeconds,
      rpoObservedSeconds: input.rpoObservedSeconds,
      rtoTargetSeconds: input.rtoTargetSeconds,
      rtoObservedSeconds: rtoObserved,
      rpoStatus,
      rtoStatus,
    },
  });
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: drill.id,
      action: "recovery.drill.completed",
      details: { status, rpoStatus, rtoStatus },
    },
  });
  return drill;
}
export async function createDrFinding(input: {
  drillId: string;
  severity: string;
  component: string;
  description: string;
  action: string;
  ownerId?: string;
  dueAt?: Date;
}) {
  const actor = await requireActor();
  requirePlatform(actor);
  const finding = await db.drFinding.create({ data: input });
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: finding.id,
      action: "recovery.finding.created",
      details: { severity: input.severity, component: input.component },
    },
  });
  return finding;
}
export async function updateDrFinding(
  id: string,
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ACCEPTED",
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const finding = await db.drFinding.update({
    where: { id },
    data: { status },
  });
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: id,
      action: "recovery.finding.updated",
      details: { status },
    },
  });
  return finding;
}
