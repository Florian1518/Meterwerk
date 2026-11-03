import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const exitCodes = {
  EXPECTED_FAILURE_CONFIRMED: 0,
  UNEXPECTED_FAILURE: 1,
  UNEXPECTED_SUCCESS: 2,
  INFRASTRUCTURE_FAILURE: 3,
};

export function classifyMissingWal(e) {
  if (
    e.infrastructureOk !== true ||
    e.oomKilled !== false ||
    e.containerError !== "" ||
    /METERWERK_RESTORE_INFRASTRUCTURE_FAILURE/.test(e.restoreLog ?? "")
  )
    return "INFRASTRUCTURE_FAILURE";
  if (e.recovery === "promoted") return "UNEXPECTED_SUCCESS";
  if (!/^[0-9A-F]{24}$/.test(e.expectedSegment ?? ""))
    return "UNEXPECTED_FAILURE";
  const lines = (e.restoreLog ?? "").split(/\r?\n/);
  const requested = `METERWERK_WAL_REQUEST=${e.expectedSegment}`;
  const sentinel = `METERWERK_EXPECTED_MISSING_WAL=${e.expectedSegment}`;
  if (
    !lines.includes(requested) ||
    !lines.includes(sentinel) ||
    lines.some((line) =>
      line.startsWith("METERWERK_UNEXPECTED_MISSING_WAL="),
    ) ||
    !e.postgresLog?.includes(sentinel)
  )
    return "UNEXPECTED_FAILURE";
  if (e.recovery === "in_recovery" && e.running === true)
    return "EXPECTED_FAILURE_CONFIRMED";
  if (
    e.recovery === "stopped" &&
    e.running === false &&
    e.exitCode === 1 &&
    /recovery ended before configured recovery target was reached/.test(
      e.postgresLog,
    )
  )
    return "EXPECTED_FAILURE_CONFIRMED";
  return "UNEXPECTED_FAILURE";
}

export function classifyIncompleteBackup(e) {
  if (
    e.infrastructureOk !== true ||
    e.verifierExecuted !== true ||
    [125, 126, 127, 137].includes(e.exitCode)
  )
    return "INFRASTRUCTURE_FAILURE";
  if (e.exitCode === 0) return "UNEXPECTED_SUCCESS";
  if (
    e.validBackupExitCode !== 0 ||
    e.manifestContainsFile !== true ||
    e.removedFile !== "global/pg_control" ||
    e.exitCode !== 1
  )
    return "UNEXPECTED_FAILURE";
  const errors = (e.verifierLog ?? "")
    .split(/\r?\n/)
    .filter((line) => line.includes("error:"));
  return errors.length === 1 &&
    errors[0].includes(
      '"global/pg_control" is present in the manifest but not on disk',
    )
    ? "EXPECTED_FAILURE_CONFIRMED"
    : "UNEXPECTED_FAILURE";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [kind, input, output] = process.argv.slice(2);
  const evidence = JSON.parse(readFileSync(input, "utf8"));
  const result =
    kind === "missing-wal"
      ? classifyMissingWal(evidence)
      : kind === "incomplete-base"
        ? classifyIncompleteBackup(evidence)
        : "UNEXPECTED_FAILURE";
  // Only bounded synthetic drill logs are passed by the harness.
  writeFileSync(
    output,
    JSON.stringify({ scenario: kind, ...evidence, result }, null, 2) + "\n",
  );
  console.log(`${kind}: ${result}`);
  process.exitCode = exitCodes[result];
}
