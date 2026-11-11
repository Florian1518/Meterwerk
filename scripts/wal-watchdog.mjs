import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const classifications = new Set([
  "UPLOAD_OR_VERIFICATION_FAILURE",
  "STALE_PIPELINE",
  "WAL_GAP",
  "CIPHERTEXT_HASH_MISMATCH",
  "PLAINTEXT_HASH_MISMATCH",
  "STARTUP_WAL_GATE_PENDING",
  "ARCHIVE_FAILURE",
  "PIPELINE_FAILURE",
  "WATCHDOG_INFRASTRUCTURE_FAILURE",
  "NOTIFICATION_DELIVERY_FAILED",
]);

export function classifyObservation(observation, now, maxAgeMs) {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0)
    return {
      status: "FAILED",
      classification: "WATCHDOG_INFRASTRUCTURE_FAILURE",
    };
  if (!observation || observation.infrastructureOk !== true)
    return {
      status: "FAILED",
      classification: "WATCHDOG_INFRASTRUCTURE_FAILURE",
    };
  if (observation.status === "FAILED") {
    const classification = classifications.has(observation.code)
      ? observation.code
      : "PIPELINE_FAILURE";
    return { status: "FAILED", classification };
  }
  if (observation.status === "PENDING") {
    if (!Number.isFinite(observation.checkedAt) || observation.checkedAt > now)
      return {
        status: "FAILED",
        classification: "WATCHDOG_INFRASTRUCTURE_FAILURE",
      };
    if (now - observation.checkedAt > maxAgeMs)
      return { status: "FAILED", classification: "STALE_PIPELINE" };
    return { status: "PENDING", classification: null };
  }
  if (observation.status !== "PASSED")
    return { status: "FAILED", classification: "PIPELINE_FAILURE" };
  if (
    !Number.isFinite(observation.checkedAt) ||
    observation.checkedAt > now ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0
  )
    return {
      status: "FAILED",
      classification: "WATCHDOG_INFRASTRUCTURE_FAILURE",
    };
  if (now - observation.checkedAt > maxAgeMs)
    return { status: "FAILED", classification: "STALE_PIPELINE" };
  return { status: "PASSED", classification: null };
}

function safeContext(value) {
  return String(value ?? "")
    .replace(
      /\b(authorization|password|secret|token|api[_ -]?key|customer(?:[_ -]?id)?|tenant(?:[_ -]?id)?|email|phone)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .replace(/\bcustomer\b[^,;.\r\n]*/gi, "customer=[REDACTED]")
    .replace(/\btenant\b[^,;.\r\n]*/gi, "tenant=[REDACTED]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://[REDACTED]@")
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 240);
}

export function createNotification({
  timestamp,
  environment = "synthetic",
  classification,
  context,
  correlationId,
}) {
  if (environment !== "synthetic") throw new Error("NON_SYNTHETIC_ENVIRONMENT");
  if (!classifications.has(classification))
    throw new Error("INVALID_CLASSIFICATION");
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(correlationId ?? ""))
    throw new Error("INVALID_CORRELATION_ID");
  if (!Number.isFinite(Date.parse(timestamp)))
    throw new Error("INVALID_TIMESTAMP");
  return {
    timestamp,
    environment,
    classification,
    context: safeContext(context),
    correlationId,
  };
}

export async function dispatchNotification(url, payload, options = {}) {
  const target = new URL(url);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw new Error("INVALID_NOTIFICATION_ENDPOINT");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3000;
  const dispatchAt = new Date().toISOString();
  const response = await fetchImpl(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error("NOTIFICATION_DELIVERY_FAILED");
  let receipt;
  try {
    receipt = await response.json();
  } catch {
    throw new Error("NOTIFICATION_RECEIPT_INVALID");
  }
  if (
    receipt.accepted !== true ||
    receipt.correlationId !== payload.correlationId ||
    !Number.isFinite(Date.parse(receipt.receivedAt))
  )
    throw new Error("NOTIFICATION_RECEIPT_INVALID");
  return {
    dispatchAt,
    receiptAt: receipt.receivedAt,
    receiverId: receipt.receiverId,
  };
}

export function appendAudit(path, record) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

export function recordAcknowledgement(path, { incidentId, actor, timestamp }) {
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(incidentId ?? ""))
    throw new Error("INVALID_INCIDENT_ID");
  if (!/^[A-Za-z0-9-]{1,80}$/.test(actor ?? ""))
    throw new Error("INVALID_OPERATOR");
  if (!Number.isFinite(Date.parse(timestamp)))
    throw new Error("INVALID_TIMESTAMP");
  const record = { type: "ACKNOWLEDGED", incidentId, actor, timestamp };
  appendAudit(path, record);
  return record;
}

async function latestOffsiteRun({ repository, token, fetchImpl = fetch }) {
  const url = `https://api.github.com/repos/${repository}/actions/workflows/wal-offsite.yml/runs?event=workflow_dispatch&per_page=1`;
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("WATCHDOG_INFRASTRUCTURE_FAILURE");
  const body = await response.json();
  const run = body.workflow_runs?.[0];
  if (!run || !Number.isSafeInteger(run.id) || !run.updated_at)
    throw new Error("WATCHDOG_INFRASTRUCTURE_FAILURE");
  return {
    infrastructureOk: true,
    status:
      run.status === "in_progress"
        ? "PENDING"
        : run.conclusion === "success"
          ? "PASSED"
          : "FAILED",
    code:
      run.status === "in_progress" || run.conclusion === "success"
        ? undefined
        : "PIPELINE_FAILURE",
    checkedAt: Date.parse(run.updated_at),
    sourceRunId: String(run.id),
    sourceRunStatus: run.status,
    sourceConclusion: run.conclusion,
    sourceUpdatedAt: run.updated_at,
  };
}

async function main() {
  const output =
    process.env.WAL_WATCHDOG_STATE_FILE ?? "artifacts/wal-watchdog/state.json";
  const audit =
    process.env.WAL_WATCHDOG_AUDIT_FILE ?? "artifacts/wal-watchdog/audit.jsonl";
  const maxAgeMs = Number(process.env.WAL_WATCHDOG_MAX_AGE_MS ?? 900000);
  mkdirSync(dirname(output), { recursive: true });
  const now = Date.now();
  let observation;
  try {
    observation = await latestOffsiteRun({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
  } catch {
    observation = { infrastructureOk: false };
  }
  const result = classifyObservation(observation, now, maxAgeMs);
  const state = {
    ...result,
    checkedAt: now,
    sourceRunId: observation.sourceRunId ?? null,
    sourceRunUpdatedAt: observation.sourceUpdatedAt ?? null,
  };
  writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  if (result.status === "FAILED") {
    const url = process.env.WAL_ALERT_WEBHOOK_URL;
    if (!url) throw new Error("NOTIFICATION_ROUTE_UNCONFIGURED");
    const correlationId = `walwatch:${observation.sourceRunId ?? `infra-${now}`}`;
    const payload = createNotification({
      timestamp: new Date(now).toISOString(),
      classification: result.classification,
      context: `Offsite workflow status=${observation.sourceRunStatus ?? "unavailable"}; conclusion=${observation.sourceConclusion ?? "unavailable"}; updated=${observation.sourceUpdatedAt ?? "unavailable"}`,
      correlationId,
    });
    try {
      const delivery = await dispatchNotification(url, payload);
      appendAudit(audit, { type: "ALERT", ...payload, ...delivery });
      console.log(JSON.stringify({ ...state, notification: delivery }));
    } catch (error) {
      appendAudit(audit, {
        type: "NOTIFICATION_DELIVERY_FAILED",
        ...payload,
        dispatchAttemptAt: new Date().toISOString(),
        code: "NOTIFICATION_DELIVERY_FAILED",
      });
      throw error;
    }
    return;
  }
  console.log(JSON.stringify(state));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "WATCHDOG_INFRASTRUCTURE_FAILURE",
    );
    process.exitCode = 1;
  });
}
