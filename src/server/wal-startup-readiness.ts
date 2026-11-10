import { readFileSync } from "node:fs";

type StartupWalEvidence = {
  status?: unknown;
  runId?: unknown;
  segment?: unknown;
  recoveryComplete?: unknown;
  switchCount?: unknown;
  archiveConfirmed?: unknown;
  receipt?: {
    status?: unknown;
    wal?: unknown;
    plainSha256?: unknown;
    object?: {
      key?: unknown;
      version?: unknown;
      bytes?: unknown;
      sha256?: unknown;
      sse?: unknown;
    };
  };
};

export function startupWalGateRequired(
  configured = process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED,
  archiveMode: string,
) {
  return configured === "true" || archiveMode === "on";
}

export function startupWalGateReady(
  path = process.env.METERWERK_WAL_STARTUP_GATE_FILE,
) {
  if (!path) return false;
  try {
    const evidence = JSON.parse(
      readFileSync(path, "utf8"),
    ) as StartupWalEvidence;
    const segment =
      typeof evidence.segment === "string" &&
      /^[0-9A-F]{24}$/.test(evidence.segment);
    const receipt = evidence.receipt;
    return (
      evidence.status === "PASSED" &&
      evidence.recoveryComplete === true &&
      evidence.switchCount === 1 &&
      evidence.archiveConfirmed === true &&
      segment &&
      receipt?.status === "VERIFIED" &&
      receipt.wal === evidence.segment &&
      typeof receipt.plainSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(receipt.plainSha256) &&
      receipt.object?.key ===
        `phase3-acceptance/${evidence.runId}/startup-wal/${evidence.segment}.age` &&
      typeof receipt.object.version === "string" &&
      receipt.object.version.length > 0 &&
      typeof receipt.object.bytes === "number" &&
      Number.isInteger(receipt.object.bytes) &&
      receipt.object.bytes > 0 &&
      typeof receipt.object.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(receipt.object.sha256) &&
      receipt.object.sse === "AES256"
    );
  } catch {
    return false;
  }
}
