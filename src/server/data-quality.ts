import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { db } from "./db";
import { AccessError, requireManage, tenantScope, type Actor } from "./policy";
import { analyzeMeterQuality, type QualityIssue } from "@/lib/data-quality";
import type {
  DataQualityIssueType,
  DataQualityStatus,
  Prisma,
  Quality,
} from "@/generated/prisma/client";

const issueTypes = [
  "MISSING_READINGS",
  "DUPLICATE_READINGS",
  "TIMESTAMP_OUT_OF_RANGE",
  "NEGATIVE_CONSUMPTION",
  "UNUSUAL_JUMP",
  "COUNTER_ROLLBACK",
  "UNIT_MISMATCH",
  "ORPHANED_ASSIGNMENT",
  "DATA_GAP",
] as const;
const filterSchema = z.object({
  from: z
    .union([
      z.string().datetime({ offset: true }),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ])
    .optional(),
  to: z
    .union([
      z.string().datetime({ offset: true }),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ])
    .optional(),
  meter: z.string().trim().max(100).optional(),
  type: z.enum(issueTypes).optional(),
  status: z.enum(["OK", "WARNING", "ERROR"]).optional(),
});
export type DataQualityFilter = z.input<typeof filterSchema>;
const range = (input: unknown) => {
  const filter = filterSchema.parse(input);
  const dateValue = (value: string, endExclusive: boolean) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
    const date = new Date(`${value}T00:00:00.000Z`);
    return new Date(date.getTime() + (endExclusive ? 86_400_000 : 0));
  };
  const to = filter.to ? dateValue(filter.to, true) : new Date();
  const from = filter.from
    ? dateValue(filter.from, false)
    : new Date(to.getTime() - 30 * 86_400_000);
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()))
    throw new AccessError(400, "Ungültiges Datum im Prüfzeitraum.");
  if (from >= to)
    throw new AccessError(
      400,
      "Der Zeitraum muss chronologisch aufsteigend sein.",
    );
  if (to.getTime() - from.getTime() > 366 * 86_400_000)
    throw new AccessError(
      400,
      "Der Prüfzeitraum darf höchstens 366 Tage umfassen.",
    );
  return { ...filter, from, to };
};

function meterWhere(tenantId: string, query?: string) {
  return {
    tenantId,
    ...(query
      ? {
          OR: [
            { id: query },
            { serialNumber: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function scanDataQuality(
  actor: Actor,
  requested: string | null,
  input: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const filter = range(input);
  const meters = await db.meter.findMany({
    where: meterWhere(tenantId, filter.meter),
    orderBy: { serialNumber: "asc" },
    take: 5000,
    select: {
      id: true,
      serialNumber: true,
      type: true,
      measurementUnit: true,
      installedAt: true,
      status: true,
    },
  });
  const readings = meters.length
    ? await db.reading.findMany({
        where: {
          tenantId,
          meterId: { in: meters.map((meter) => meter.id) },
          timestamp: { gte: filter.from, lt: filter.to },
        },
        orderBy: [{ meterId: "asc" }, { timestamp: "asc" }],
        take: 100_000,
        select: {
          id: true,
          meterId: true,
          timestamp: true,
          registerValue: true,
          consumption: true,
          measurementUnit: true,
          deviceId: true,
          device: { select: { meterId: true } },
        },
      })
    : [];
  const grouped = new Map<string, typeof readings>();
  for (const reading of readings)
    grouped.set(reading.meterId, [
      ...(grouped.get(reading.meterId) ?? []),
      reading,
    ]);
  const candidates: {
    meterId: string;
    issue: QualityIssue;
    fingerprint: string;
  }[] = [];
  for (const meter of meters) {
    const candidatesForMeter = analyzeMeterQuality(
      meter,
      (grouped.get(meter.id) ?? []).map((reading) => ({
        id: reading.id,
        timestamp: reading.timestamp,
        registerValue: reading.registerValue.toString(),
        consumption: reading.consumption.toString(),
        measurementUnit: reading.measurementUnit,
        deviceId: reading.deviceId,
        deviceMeterId: reading.device?.meterId ?? null,
      })),
      filter.from,
      filter.to,
    );
    for (const issue of candidatesForMeter) {
      if (filter.type && filter.type !== issue.type) continue;
      const fingerprint = createHash("sha256")
        .update(`${meter.id}|${issue.type}|${issue.key}`)
        .digest("hex");
      candidates.push({ meterId: meter.id, issue, fingerprint });
    }
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const candidate of candidates) {
      await tx.dataQualityFinding.upsert({
        where: {
          tenantId_fingerprint: {
            tenantId,
            fingerprint: candidate.fingerprint,
          },
        },
        create: {
          tenantId,
          meterId: candidate.meterId,
          readingId: candidate.issue.readingId,
          type: candidate.issue.type as DataQualityIssueType,
          status: candidate.issue.status as DataQualityStatus,
          fingerprint: candidate.fingerprint,
          description: candidate.issue.description,
          details: candidate.issue.details as Prisma.InputJsonValue,
          windowFrom: filter.from,
          windowTo: filter.to,
          detectedAt: now,
          lastSeenAt: now,
        },
        update: {
          readingId: candidate.issue.readingId,
          status: candidate.issue.status as DataQualityStatus,
          description: candidate.issue.description,
          details: candidate.issue.details as Prisma.InputJsonValue,
          windowFrom: filter.from,
          windowTo: filter.to,
          lastSeenAt: now,
          resolvedAt: null,
        },
      });
    }
    const active = await tx.dataQualityFinding.findMany({
      where: {
        tenantId,
        meterId: { in: meters.map((meter) => meter.id) },
        windowFrom: filter.from,
        windowTo: filter.to,
        resolvedAt: null,
        ...(filter.type ? { type: filter.type } : {}),
      },
      select: { id: true, fingerprint: true },
    });
    const detected = new Set(
      candidates.map((candidate) => candidate.fingerprint),
    );
    const staleIds = active
      .filter((finding) => !detected.has(finding.fingerprint))
      .map((finding) => finding.id);
    if (staleIds.length)
      await tx.dataQualityFinding.updateMany({
        where: { tenantId, id: { in: staleIds }, resolvedAt: null },
        data: { resolvedAt: now },
      });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "data_quality.scan",
        entityId: `${filter.from.toISOString()}/${filter.to.toISOString()}`,
      },
    });
  });
  const activeCount = await db.dataQualityFinding.count({
    where: {
      tenantId,
      meterId: { in: meters.map((meter) => meter.id) },
      resolvedAt: null,
      windowFrom: filter.from,
      windowTo: filter.to,
    },
  });
  return {
    scannedMeters: meters.length,
    scannedReadings: readings.length,
    findings: candidates.length,
    activeFindings: activeCount,
    from: filter.from.toISOString(),
    to: filter.to.toISOString(),
  };
}

export async function getDataQuality(
  actor: Actor,
  requested: string | null,
  input: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const filter = range(input);
  const meters = await db.meter.findMany({
    where: meterWhere(tenantId, filter.meter),
    orderBy: { serialNumber: "asc" },
    take: 5000,
    select: {
      id: true,
      serialNumber: true,
      type: true,
      measurementUnit: true,
      status: true,
    },
  });
  const meterIds = meters.map((meter) => meter.id);
  const baseWhere = {
    tenantId,
    meterId: { in: meterIds },
    resolvedAt: null,
    windowFrom: { lte: filter.to },
    windowTo: { gte: filter.from },
  };
  const [allFindings, findings] = await Promise.all([
    db.dataQualityFinding.findMany({
      where: baseWhere,
      select: { meterId: true, status: true },
    }),
    db.dataQualityFinding.findMany({
      where: {
        ...baseWhere,
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.status && filter.status !== "OK"
          ? { status: filter.status }
          : filter.status === "OK"
            ? { id: "__no-ok-findings__" }
            : {}),
      },
      orderBy: [{ status: "desc" }, { detectedAt: "desc" }],
      take: 1000,
      include: {
        meter: {
          select: {
            id: true,
            serialNumber: true,
            type: true,
            measurementUnit: true,
          },
        },
        reading: {
          select: {
            id: true,
            timestamp: true,
            registerValue: true,
            meterValue: true,
            consumption: true,
            measurementUnit: true,
            quality: true,
          },
        },
      },
    }),
  ]);
  const severity = new Map<string, DataQualityStatus>();
  for (const finding of allFindings) {
    const current = severity.get(finding.meterId);
    if (finding.status === "ERROR" || !current)
      severity.set(finding.meterId, finding.status);
    else if (current !== "ERROR") severity.set(finding.meterId, "WARNING");
  }
  const meterStatuses = meters.map((meter) => ({
    ...meter,
    status: severity.get(meter.id) ?? "OK",
  }));
  return {
    filters: {
      from:
        (input as DataQualityFilter)?.from ??
        filter.from.toISOString().slice(0, 10),
      to:
        (input as DataQualityFilter)?.to ??
        filter.to.toISOString().slice(0, 10),
      fromUtc: filter.from.toISOString(),
      toUtc: filter.to.toISOString(),
      meter: filter.meter ?? "",
      type: filter.type ?? "",
      status: filter.status ?? "",
    },
    meters: meterStatuses.filter(
      (meter) => !filter.status || meter.status === filter.status,
    ),
    findings: findings.map((finding) => ({
      id: finding.id,
      type: finding.type,
      status: finding.status,
      description: finding.description,
      details: finding.details,
      meter: finding.meter,
      reading: finding.reading
        ? {
            ...finding.reading,
            timestamp: finding.reading.timestamp.toISOString(),
            registerValue: finding.reading.registerValue.toString(),
            meterValue: finding.reading.meterValue?.toString() ?? null,
            consumption: finding.reading.consumption.toString(),
          }
        : null,
      detectedAt: finding.detectedAt.toISOString(),
      lastSeenAt: finding.lastSeenAt.toISOString(),
    })),
  };
}

const decimalField = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => {
    try {
      const parsed = new Decimal(normalizeDecimalInput(value));
      return (
        parsed.isFinite() &&
        parsed.decimalPlaces() <= 6 &&
        parsed.precision() <= 20
      );
    } catch {
      return false;
    }
  }, "Gültige Zahl mit höchstens sechs Nachkommastellen erforderlich.");
const optionalTimestamp = z.string().datetime({ offset: true }).optional();
const reason = z
  .string()
  .trim()
  .min(10, "Bitte begründen Sie die Korrektur mit mindestens zehn Zeichen.")
  .max(1000);
const correctionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("MARK_INVALID"), reason }),
  z
    .object({
      action: z.literal("CORRECT"),
      reason,
      timestamp: optionalTimestamp,
      registerValue: decimalField.optional(),
      meterValue: decimalField.nullable().optional(),
      consumption: decimalField.optional(),
      measurementUnit: z.string().trim().min(1).max(40).optional(),
      quality: z.enum(["VALID", "ESTIMATED", "SUSPECT"]).optional(),
    })
    .refine(
      (value) =>
        Boolean(
          value.timestamp ||
          value.registerValue ||
          value.meterValue !== undefined ||
          value.consumption ||
          value.measurementUnit ||
          value.quality,
        ),
      "Mindestens ein Wert muss geändert werden.",
    ),
  z.object({
    action: z.literal("REPLACE"),
    reason,
    timestamp: z.string().datetime({ offset: true }),
    registerValue: decimalField,
    meterValue: decimalField.nullable().optional(),
    consumption: decimalField,
    measurementUnit: z.string().trim().min(1).max(40),
  }),
]);

function decimalValue(value: string) {
  const decimal = new Decimal(normalizeDecimalInput(value));
  return decimal.toFixed(6);
}

function normalizeDecimalInput(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  if (normalized.includes(","))
    return normalized.replace(/\./g, "").replace(",", ".");
  return normalized;
}
function serializableReading(reading: {
  id: string;
  meterId: string;
  deviceId: string | null;
  messageId: string | null;
  timestamp: Date;
  registerValue: Decimal;
  meterValue: Decimal | null;
  consumption: Decimal;
  measurementUnit: string;
  source: string;
  quality: Quality;
  receivedAt: Date;
  measurements: {
    metric: string;
    rawValue: Decimal;
    rawUnit: string;
    value: Decimal;
    unit: string;
    quality: Quality;
  }[];
}) {
  return {
    id: reading.id,
    meterId: reading.meterId,
    deviceId: reading.deviceId,
    messageId: reading.messageId,
    timestamp: reading.timestamp.toISOString(),
    registerValue: reading.registerValue.toString(),
    meterValue: reading.meterValue?.toString() ?? null,
    consumption: reading.consumption.toString(),
    measurementUnit: reading.measurementUnit,
    source: reading.source,
    quality: reading.quality,
    receivedAt: reading.receivedAt.toISOString(),
    measurements: reading.measurements.map((item) => ({
      metric: item.metric,
      rawValue: item.rawValue.toString(),
      rawUnit: item.rawUnit,
      value: item.value.toString(),
      unit: item.unit,
      quality: item.quality,
    })),
  };
}

export async function correctReading(
  actor: Actor,
  readingId: string,
  requested: string | null,
  input: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const id = z.string().min(1).max(160).parse(readingId);
  const value = correctionSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    const reading = await tx.reading.findFirst({
      where: { id, tenantId },
      include: {
        meter: {
          select: {
            id: true,
            type: true,
            measurementUnit: true,
            installedAt: true,
          },
        },
        measurements: {
          select: {
            metric: true,
            rawValue: true,
            rawUnit: true,
            value: true,
            unit: true,
            quality: true,
          },
        },
      },
    });
    if (!reading) throw new AccessError(404, "Messwert nicht gefunden.");
    const beforeData = serializableReading(reading);
    const update: Prisma.ReadingUpdateInput = {};
    if (value.action === "MARK_INVALID") update.quality = "INVALID";
    if (value.action === "CORRECT" || value.action === "REPLACE") {
      const timestamp = value.timestamp
        ? new Date(value.timestamp)
        : reading.timestamp;
      const registerValue = value.registerValue
        ? decimalValue(value.registerValue)
        : reading.registerValue.toString();
      const consumption = value.consumption
        ? decimalValue(value.consumption)
        : reading.consumption.toString();
      const meterValue =
        value.meterValue === undefined
          ? (reading.meterValue?.toString() ?? null)
          : value.meterValue === null
            ? null
            : decimalValue(value.meterValue);
      const measurementUnit = value.measurementUnit ?? reading.measurementUnit;
      if (
        timestamp < reading.meter.installedAt ||
        timestamp > new Date(Date.now() + 5 * 60_000)
      )
        throw new AccessError(
          400,
          "Zeitstempel liegt außerhalb des plausiblen Installationszeitraums.",
        );
      if (measurementUnit !== reading.meter.measurementUnit)
        throw new AccessError(
          400,
          `Einheit muss ${reading.meter.measurementUnit} sein.`,
        );
      if (new Decimal(registerValue).isNegative())
        throw new AccessError(400, "Zählerstände dürfen nicht negativ sein.");
      if (
        reading.meter.type !== "ELECTRICITY" &&
        new Decimal(consumption).isNegative()
      )
        throw new AccessError(
          400,
          "Negativer Verbrauch ist für dieses Medium unzulässig.",
        );
      const duplicate = await tx.reading.findFirst({
        where: {
          tenantId,
          id: { not: reading.id },
          meterId: reading.meterId,
          timestamp,
          source: reading.source,
        },
        select: { id: true },
      });
      if (duplicate)
        throw new AccessError(
          409,
          "Für diesen Zähler, Zeitpunkt und Ursprung existiert bereits ein Messwert.",
        );
      update.timestamp = timestamp;
      update.registerValue = registerValue;
      update.meterValue = meterValue;
      update.consumption = consumption;
      update.measurementUnit = measurementUnit;
      if (value.action === "REPLACE") update.quality = "ESTIMATED";
      else if (value.quality) update.quality = value.quality;
    }
    const updated = await tx.reading.update({
      where: { id: reading.id },
      data: update,
      include: {
        measurements: {
          select: {
            metric: true,
            rawValue: true,
            rawUnit: true,
            value: true,
            unit: true,
            quality: true,
          },
        },
      },
    });
    const afterData = serializableReading({
      ...updated,
      meterId: reading.meterId,
      measurements: updated.measurements,
    });
    const correction = await tx.dataQualityCorrection.create({
      data: {
        tenantId,
        readingId: reading.id,
        actorId: actor.id,
        action: value.action,
        reason: value.reason,
        beforeData: beforeData as Prisma.InputJsonValue,
        afterData: afterData as Prisma.InputJsonValue,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: `data_quality.${value.action.toLowerCase()}`,
        entityId: correction.id,
      },
    });
    return {
      id: correction.id,
      readingId: reading.id,
      action: correction.action,
      reason: correction.reason,
      beforeData,
      afterData,
      createdAt: correction.createdAt.toISOString(),
    };
  });
}

export async function readingCorrectionHistory(
  actor: Actor,
  readingId: string,
  requested: string | null,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const id = z.string().min(1).max(160).parse(readingId);
  const reading = await db.reading.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!reading) throw new AccessError(404, "Messwert nicht gefunden.");
  const rows = await db.dataQualityCorrection.findMany({
    where: { tenantId, readingId: id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actorId,
    reason: row.reason,
    beforeData: row.beforeData,
    afterData: row.afterData,
    createdAt: row.createdAt.toISOString(),
  }));
}
