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
  naturalWarmup?: {
    status?: unknown;
    segment?: unknown;
    naturalSwitch?: unknown;
    preSwitchOffset?: unknown;
    archiveConfirmedAt?: unknown;
    receipt?: StartupWalEvidence["receipt"];
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
    const warmup = evidence.naturalWarmup;
    const warmupSegment =
      typeof warmup?.segment === "string" &&
      /^[0-9A-F]{24}$/.test(warmup.segment);
    const warmupReceipt = warmup?.receipt;
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
      receipt.object.sse === "AES256" &&
      warmup?.status === "PASSED" &&
      warmup.naturalSwitch === true &&
      Number.isInteger(warmup.preSwitchOffset) &&
      Number(warmup.preSwitchOffset) >= 0 &&
      Number.isFinite(warmup.archiveConfirmedAt) &&
      warmupSegment &&
      typeof evidence.segment === "string" &&
      typeof warmup.segment === "string" &&
      evidence.segment.slice(0, 8) === warmup.segment.slice(0, 8) &&
      BigInt(`0x${warmup.segment.slice(8)}`) ===
        BigInt(`0x${evidence.segment.slice(8)}`) + 1n &&
      warmupReceipt?.status === "VERIFIED" &&
      warmupReceipt.wal === warmup.segment &&
      typeof warmupReceipt.plainSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(warmupReceipt.plainSha256) &&
      warmupReceipt.object?.key ===
        `phase3-acceptance/${evidence.runId}/startup-wal/${warmup.segment}.age` &&
      typeof warmupReceipt.object.version === "string" &&
      warmupReceipt.object.version.length > 0 &&
      typeof warmupReceipt.object.bytes === "number" &&
      Number.isInteger(warmupReceipt.object.bytes) &&
      warmupReceipt.object.bytes > 0 &&
      typeof warmupReceipt.object.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(warmupReceipt.object.sha256) &&
      warmupReceipt.object.sse === "AES256"
    );
  } catch {
    return false;
  }
}
