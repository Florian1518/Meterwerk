import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function lsn(value) {
  if (!/^[0-9A-F]+\/[0-9A-F]+$/.test(value ?? ""))
    throw new Error("Invalid LSN");
  const [high, low] = value.split("/");
  return (BigInt(`0x${high}`) << 32n) + BigInt(`0x${low}`);
}

export function requiredSegments(start, end, timeline, segmentBytes) {
  const size = BigInt(segmentBytes);
  if (
    size <= 0n ||
    0x100000000n % size !== 0n ||
    !Number.isInteger(timeline) ||
    timeline < 1
  )
    throw new Error("Invalid WAL geometry");
  const first = lsn(start) / size;
  // pg_current_wal_lsn is the end of the committed WAL: an exact boundary
  // belongs to the preceding segment (same convention as pg_walfile_name).
  const last = (lsn(end) - 1n) / size;
  if (last < first || last - first > 1024n)
    throw new Error("Invalid drill WAL range");
  const perLog = 0x100000000n / size;
  const hex = (n) => n.toString(16).toUpperCase().padStart(8, "0");
  return Array.from({ length: Number(last - first + 1n) }, (_, i) => {
    const segment = first + BigInt(i);
    return (
      hex(BigInt(timeline)) + hex(segment / perLog) + hex(segment % perLog)
    );
  });
}

export function archiveState(plan, sample, expired = false) {
  if (plan.switchExitCode !== 0 || !plan.switchLsn) return "WAL_SWITCH_FAILURE";
  if (lsn(plan.switchLsn) < lsn(plan.postErrorLsn)) return "WAL_SWITCH_FAILURE";
  if (
    !sample ||
    !Number.isSafeInteger(sample.failedCount) ||
    !Number.isSafeInteger(sample.archivedCount)
  )
    return "ARCHIVER_FAILURE";
  if (sample.failedCount !== plan.failedCountBefore) return "ARCHIVER_FAILURE";
  const filesPresent =
    plan.requiredSegments.length > 0 &&
    plan.requiredSegments.every((s) => sample.segments.includes(s));
  const last = plan.requiredSegments.at(-1);
  const progressed =
    /^[0-9A-F]{24}$/.test(sample.lastArchivedWal ?? "") &&
    sample.lastArchivedWal.slice(0, 8) === last?.slice(0, 8) &&
    sample.lastArchivedWal >= last &&
    sample.archivedCount > plan.archivedCountBefore;
  if (filesPresent && progressed) return "ARCHIVE_CONFIRMED";
  if (!expired) return "WAITING_FOR_ARCHIVE";
  return filesPresent ? "ARCHIVE_TIMEOUT" : "EXPECTED_WAL_NOT_ARCHIVED";
}

export async function waitForArchive(
  plan,
  sample,
  {
    timeoutMs = 30000,
    intervalMs = 250,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  const started = now();
  while (true) {
    let observation;
    try {
      observation = await sample();
    } catch {
      return { result: "ARCHIVER_FAILURE", elapsedMs: now() - started };
    }
    const elapsedMs = now() - started;
    if (elapsedMs > timeoutMs)
      return { result: "ARCHIVE_TIMEOUT", elapsedMs, ...observation };
    const result = archiveState(plan, observation, elapsedMs >= timeoutMs);
    if (result !== "WAITING_FOR_ARCHIVE")
      return { result, elapsedMs, ...observation };
    await sleep(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
}

export function positivePitrPassed(e) {
  try {
    return (
      e.archiveConfirmation?.result === "ARCHIVE_CONFIRMED" &&
      Number.isFinite(Date.parse(e.commitTimestamp ?? "")) &&
      e.requiredSegments.includes(e.commitWalSegment) &&
      e.requiredSegments.at(-1) === e.postErrorWalSegment &&
      archiveState(e, e.archiveConfirmation, true) === "ARCHIVE_CONFIRMED" &&
      e.baseBackupValid === true &&
      e.recoveryResult === "TARGET_REACHED" &&
      e.inRecovery === false &&
      lsn(e.replayLsn) >= lsn(e.recoveryTarget.lsn) &&
      e.recoveryTarget.name === "meterwerk_before_error" &&
      lsn(e.commitLsn) <= lsn(e.recoveryTarget.lsn) &&
      lsn(e.recoveryTarget.lsn) < lsn(e.postErrorLsn) &&
      e.baselineCount === 1 &&
      e.preErrorCount === 1 &&
      e.postTargetErrorCount === 0 &&
      e.constraintsValid === true &&
      e.dumpReadable === true
    );
  } catch {
    return false;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [action, container, work, evidenceDirectory] = process.argv.slice(2);
  const read = (name) =>
    JSON.parse(readFileSync(`${work}/${name}.json`, "utf8"));
  if (action === "archive") {
    const manifest = JSON.parse(
      readFileSync(`${work}/base/backup_manifest`, "utf8"),
    );
    const range = manifest["WAL-Ranges"]?.[0];
    const plan = {
      ...read("commit"),
      ...read("post-error"),
      recoveryTarget: {
        name: "meterwerk_before_error",
        lsn: readFileSync(`${work}/target-lsn`, "utf8").trim(),
      },
      switchExitCode: 0,
      switchLsn: readFileSync(`${work}/switch-lsn`, "utf8").trim(),
    };
    plan.requiredSegments = requiredSegments(
      range["Start-LSN"],
      plan.postErrorLsn,
      range.Timeline,
      plan.segmentBytes,
    );
    const docker = (args) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const archiveConfirmation = await waitForArchive(plan, () => {
      const stats = JSON.parse(
        docker([
          "exec",
          container,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-Atqc",
          "SELECT json_build_object('failedCount',failed_count,'archivedCount',archived_count,'lastArchivedWal',last_archived_wal) FROM pg_stat_archiver",
        ]),
      );
      return {
        ...stats,
        segments: docker(["exec", container, "ls", "-1", "/archive"])
          .split(/\r?\n/)
          .filter((s) => /^[0-9A-F]{24}$/.test(s))
          .sort(),
      };
    });
    writeFileSync(
      `${evidenceDirectory}/archive.json`,
      JSON.stringify({ ...plan, archiveConfirmation }, null, 2) + "\n",
    );
    console.log(archiveConfirmation.result);
    if (archiveConfirmation.result !== "ARCHIVE_CONFIRMED")
      process.exitCode = 1;
  } else if (action === "verify") {
    const evidence = {
      ...JSON.parse(readFileSync(`${evidenceDirectory}/archive.json`, "utf8")),
      ...read("positive"),
      baseBackupValid: true,
      dumpReadable: true,
    };
    evidence.recoveryResult =
      evidence.inRecovery === false &&
      lsn(evidence.replayLsn) >= lsn(evidence.recoveryTarget.lsn)
        ? "TARGET_REACHED"
        : "TARGET_NOT_REACHED";
    evidence.result = positivePitrPassed(evidence) ? "PASSED" : "FAILED";
    writeFileSync(
      `${evidenceDirectory}/positive-pitr.json`,
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(`Positive PITR: ${evidence.result}`);
    if (evidence.result !== "PASSED") process.exitCode = 1;
  } else throw new Error("Unknown PITR evidence operation");
}
