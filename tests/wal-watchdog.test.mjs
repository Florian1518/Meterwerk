import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  health,
  ship,
  tick,
  watchdog,
  WalFailure,
} from "../scripts/wal-offsite.mjs";
import {
  appendAudit,
  classifyObservation as classifyWatchdog,
  createNotification as makeNotification,
  dispatchNotification as deliver,
  recordAcknowledgement,
} from "../scripts/wal-watchdog.mjs";

const receiverScript = resolve("scripts/synthetic-webhook-receiver.mjs");
const temp = mkdtempSync(join(tmpdir(), "meterwerk-independent-watchdog-"));
const receiverLog = join(temp, "receiver.jsonl");
const readyFile = join(temp, "receiver.port");
const auditFile = join(temp, "audit.jsonl");
const receiver = spawn(process.execPath, [receiverScript], {
  env: {
    ...process.env,
    SYNTHETIC_RECEIVER_LOG: receiverLog,
    SYNTHETIC_RECEIVER_READY_FILE: readyFile,
    SYNTHETIC_RECEIVER_PORT: "0",
  },
  stdio: "ignore",
});

async function receiverUrl() {
  const deadline = Date.now() + 5000;
  while (!existsSync(readyFile) && Date.now() < deadline) await delay(20);
  assert.ok(existsSync(readyFile), "synthetic receiver starts independently");
  return `http://127.0.0.1:${readFileSync(readyFile, "utf8").trim()}/alerts`;
}

const first = "000000010000000000000001";
const last = "000000010000000000000002";
const rangePlan = {
  first,
  segmentSize: 16777216,
  failedCountBefore: 0,
  maxAgeMs: 120000,
};
const sample = () => ({
  expectedLast: last,
  lastArchivedWal: last,
  failedCount: 0,
  observedAt: Date.now(),
  lastArchiveAt: Date.now(),
});
const verified = (wal) => ({
  status: "VERIFIED",
  wal,
  plainSha256: "a".repeat(64),
  object: { sha256: "b".repeat(64), version: "synthetic", sse: "AES256" },
  verifiedAt: Date.now(),
});

function inject(code, directory) {
  if (code === "UPLOAD_OR_VERIFICATION_FAILURE") {
    return () =>
      tick(
        rangePlan,
        {},
        {
          sample,
          now: Date.now,
          ship: () => {
            throw new WalFailure(code);
          },
        },
      );
  }
  if (code === "STALE_PIPELINE")
    return () =>
      watchdog(
        { status: "PASSED", checkedAt: Date.now() - 120001 },
        Date.now(),
        120000,
      );
  if (code === "WAL_GAP")
    return () =>
      health(
        rangePlan,
        sample(),
        { [last]: verified(last) },
        Date.now(),
        120000,
      );
  if (code === "CIPHERTEXT_HASH_MISMATCH") {
    const source = join(directory, "synthetic.wal");
    writeFileSync(source, "synthetic-wal");
    return () =>
      ship(
        source,
        first,
        readFileSync(source).length,
        (cipher, returned) => {
          copyFileSync(cipher, returned);
          writeFileSync(returned, "tampered-ciphertext");
          return {
            sha256: createHash("sha256")
              .update(readFileSync(cipher))
              .digest("hex"),
            version: "synthetic",
            sse: "AES256",
          };
        },
        (_input, output) =>
          writeFileSync(output, "age-encryption.org/v1\nsynthetic"),
        (_input, output) => writeFileSync(output, "synthetic-wal"),
      );
  }
  if (code === "STARTUP_WAL_GATE_PENDING")
    return () => {
      throw new WalFailure("STARTUP_WAL_GATE_PENDING");
    };
  throw new Error("UNKNOWN_SYNTHETIC_SCENARIO");
}

test("independent watchdog classifies pipeline observations and fails closed on infrastructure errors", () => {
  assert.deepEqual(
    classifyWatchdog({ infrastructureOk: false }, Date.now(), 900000),
    {
      status: "FAILED",
      classification: "WATCHDOG_INFRASTRUCTURE_FAILURE",
    },
  );
  assert.deepEqual(
    classifyWatchdog(
      { infrastructureOk: true, status: "FAILED", code: "WAL_GAP" },
      Date.now(),
      900000,
    ),
    {
      status: "FAILED",
      classification: "WAL_GAP",
    },
  );
  assert.deepEqual(
    classifyWatchdog(
      { infrastructureOk: true, status: "PENDING", checkedAt: Date.now() },
      Date.now(),
      900000,
    ),
    {
      status: "PENDING",
      classification: null,
    },
  );
  assert.equal(
    classifyWatchdog(
      {
        infrastructureOk: true,
        status: "PASSED",
        checkedAt: Date.now() - 900001,
      },
      Date.now(),
      900000,
    ).classification,
    "STALE_PIPELINE",
  );
});

test("notification payload is allowlisted and redacts credential-like context", () => {
  const payload = makeNotification({
    timestamp: new Date().toISOString(),
    classification: "PIPELINE_FAILURE",
    context:
      "pipeline failed; token=do-not-send password:also-secret email=person@example.invalid customerId=c-998 tenantId=t-123",
    correlationId: "walwatch:synthetic-123",
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    "classification",
    "context",
    "correlationId",
    "environment",
    "timestamp",
  ]);
  assert.equal(payload.context.includes("do-not-send"), false);
  assert.equal(payload.context.includes("also-secret"), false);
  assert.equal(payload.context.includes("person@example.invalid"), false);
  assert.equal(payload.context.includes("c-998"), false);
  assert.equal(payload.context.includes("t-123"), false);
  assert.throws(
    () => makeNotification({ ...payload, environment: "production" }),
    /NON_SYNTHETIC_ENVIRONMENT/,
  );
});

test("acknowledgement rejects missing operator identity", () => {
  assert.throws(
    () =>
      recordAcknowledgement(auditFile, {
        incidentId: "walwatch:manual-1",
        actor: "",
        timestamp: new Date().toISOString(),
      }),
    /INVALID_OPERATOR/,
  );
  assert.equal(
    classifyWatchdog(
      { infrastructureOk: true, status: "FAILED", code: "PIPELINE_FAILURE" },
      Date.now(),
      900000,
    ).status,
    "FAILED",
  );
});

test("watchdog workflow has an independent five-minute schedule and read-only source access", () => {
  const workflow = readFileSync(
    resolve(".github/workflows/wal-independent-watchdog.yml"),
    "utf8",
  );
  assert.match(workflow, /cron: "2-59\/5 \* \* \* \*"/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /timeout-minutes: 8/);
  assert.match(workflow, /node scripts\/wal-watchdog\.mjs/);
  assert.doesNotMatch(workflow, /needs:\s*ci/i);
  assert.doesNotMatch(
    workflow,
    /PRODUCTION|STAGING_RECOVERY|IONOS_S3_ACCESS_KEY/,
  );
});

test("five synthetic incidents deliver notifications and recover without clearing alert history", async (t) => {
  t.after(() => {
    receiver.kill("SIGTERM");
    rmSync(temp, { recursive: true, force: true });
  });
  const url = await receiverUrl();
  const cases = [
    ["WAL upload failure", "UPLOAD_OR_VERIFICATION_FAILURE"],
    ["stale pipeline", "STALE_PIPELINE"],
    ["WAL continuity gap", "WAL_GAP"],
    ["integrity/hash mismatch", "CIPHERTEXT_HASH_MISMATCH"],
    ["startup WAL gate failure", "STARTUP_WAL_GATE_PENDING"],
  ];
  const evidence = [];
  const history = [];
  for (const [name, expected] of cases) {
    const scenarioDir = mkdtempSync(join(temp, "scenario-"));
    const injectedAt = new Date().toISOString();
    const firstFailureAt = new Date().toISOString();
    const pollAt = new Date().toISOString();
    const started = performance.now();
    let observed;
    try {
      inject(expected, scenarioDir)();
      observed = { classification: "FALSE_HEALTHY", status: "PASSED" };
    } catch (error) {
      observed = {
        classification: error instanceof Error ? error.message : "UNKNOWN",
        status: "FAILED",
      };
    }
    const detectionLatencyMs = Number((performance.now() - started).toFixed(3));
    const detectedAt = new Date().toISOString();
    assert.equal(observed.status, "FAILED", `${name} must fail closed`);
    assert.equal(
      observed.classification,
      expected,
      `${name} exact classification`,
    );
    const payload = makeNotification({
      timestamp: detectedAt,
      environment: "synthetic",
      classification: observed.classification,
      context: `${name}: isolated synthetic condition detected`,
      correlationId: `walwatch:${expected}:synthetic-1`,
    });
    const delivery = await deliver(url, payload);
    const notificationLatencyMs =
      Date.parse(delivery.receiptAt) - Date.parse(delivery.dispatchAt);
    const incidentToNotificationMs =
      Date.parse(delivery.receiptAt) - Date.parse(injectedAt);
    const event = {
      type: "ALERT",
      ...payload,
      dispatchAt: delivery.dispatchAt,
      receiptAt: delivery.receiptAt,
    };
    history.push(event);
    appendAudit(auditFile, event);

    const recoveryActionAt = new Date().toISOString();
    await delay(10);
    const healthy = classifyWatchdog(
      { infrastructureOk: true, status: "PASSED", checkedAt: Date.now() },
      Date.now(),
      900000,
    );
    assert.equal(healthy.status, "PASSED");
    const healthyAgainAt = new Date().toISOString();
    assert.equal(
      history.some((prior) => prior.correlationId === payload.correlationId),
      true,
    );
    appendAudit(auditFile, {
      type: "RECOVERY",
      correlationId: payload.correlationId,
      recoveryActionAt,
      healthyAgainAt,
    });
    const persisted = readFileSync(auditFile, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const alertIndex = persisted.findIndex(
      (entry) =>
        entry.type === "ALERT" && entry.correlationId === payload.correlationId,
    );
    const recoveryIndex = persisted.findIndex(
      (entry) =>
        entry.type === "RECOVERY" &&
        entry.correlationId === payload.correlationId,
    );
    assert.ok(alertIndex >= 0 && recoveryIndex > alertIndex);
    assert.equal(
      persisted.some(
        (entry) =>
          entry.type === "CLEAR" &&
          entry.correlationId === payload.correlationId,
      ),
      false,
    );
    const ackRecord = null;
    evidence.push({
      incident: name,
      incidentInjectionAt: injectedAt,
      firstFailingObservationAt: firstFailureAt,
      watchdogPollingAt: pollAt,
      detectionAt: detectedAt,
      notificationDispatchAt: delivery.dispatchAt,
      notificationReceiptAt: delivery.receiptAt,
      acknowledgementAt: null,
      acknowledgementStatus: "PENDING_NO_HUMAN_ACK",
      recoveryActionAt,
      healthyAgainAt,
      detectionLatencyMs,
      notificationDeliveryLatencyMs: notificationLatencyMs,
      incidentToNotificationLatencyMs: incidentToNotificationMs,
      acknowledgementLatencyMs: ackRecord,
      recoveryDurationMs:
        Date.parse(healthyAgainAt) - Date.parse(recoveryActionAt),
      incidentToHealthyMs: Date.parse(healthyAgainAt) - Date.parse(injectedAt),
      classification: observed.classification,
      failClosed: true,
      falseHealthyBeforeRecovery: false,
      alertHistoryPreserved: history.some(
        (prior) => prior.correlationId === payload.correlationId,
      ),
    });
    rmSync(scenarioDir, { recursive: true, force: true });
  }

  const received = readFileSync(receiverLog, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(received.length, cases.length);
  assert.equal(evidence.length, cases.length);
  assert.equal(
    evidence.every((entry) => entry.alertHistoryPreserved && entry.failClosed),
    true,
  );
  assert.equal(
    evidence.every((entry) => entry.acknowledgementAt === null),
    true,
  );
  const output = process.env.WAL_WATCHDOG_EVIDENCE_FILE;
  if (output) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(
      output,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scope:
            "synthetic watchdog, child-process receiver; acknowledgement intentionally absent",
          incidents: evidence,
          audit: readFileSync(auditFile, "utf8")
            .trim()
            .split(/\r?\n/)
            .map((line) => JSON.parse(line)),
        },
        null,
        2,
      )}\n`,
    );
  }
});
