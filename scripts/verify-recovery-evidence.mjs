import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  classifyMissingWal,
  classifyIncompleteBackup,
} from "./recovery-negative-result.mjs";

const [file, hostLossFile, negativeDirectory] = process.argv.slice(2);
if (!file || !hostLossFile || !negativeDirectory)
  throw new Error("Recovery and host-loss evidence files are required");
const [evidence, hostLoss] = await Promise.all([
  readFile(file, "utf8").then(JSON.parse),
  readFile(hostLossFile, "utf8").then(JSON.parse),
]);
const required = [
  "databaseReachable",
  "coreSchema",
  "migrationHistory",
  "tenantDataReadable",
  "coreTablesReadable",
  "foreignKeysValidated",
  "tenantIntegrity",
  "noSchemaDrift",
  "noPendingMigrations",
  "applicationReadiness",
];
if (
  evidence?.status !== "PASSED" ||
  !/^meterwerk_restore_[a-z0-9_]{1,32}$/.test(evidence.database ?? "") ||
  !/^[a-f0-9]{40}$/.test(evidence.sourceSha ?? "") ||
  !evidence.migrationVersion ||
  !Number.isFinite(Date.parse(evidence.verifiedAt ?? "")) ||
  required.some((key) => evidence.checks?.[key] !== true)
)
  throw new Error("Recovery evidence missing, incomplete or failed");
if (
  /password|secret|token|credential|postgres(?:ql)?:\/\/[^\s]*@/i.test(
    JSON.stringify(evidence),
  )
)
  throw new Error("Recovery evidence contains a forbidden secret field");
if (
  hostLoss?.status !== "PASSED" ||
  hostLoss?.scenario !== "synthetic-host-loss" ||
  hostLoss?.data !== "synthetic-only" ||
  [
    "postgresRestore",
    "webReadiness",
    "mqttService",
    "ingestionWorkerSubscribed",
  ].some((key) => hostLoss.checks?.[key] !== true)
)
  throw new Error("Synthetic host-loss evidence missing, incomplete or failed");
if (
  /password|secret|token|credential|postgres(?:ql)?:\/\/[^\s]*@/i.test(
    JSON.stringify(hostLoss),
  )
)
  throw new Error("Host-loss evidence contains a forbidden secret field");
for (const [name, classify] of [
  ["missing-wal", classifyMissingWal],
  ["incomplete-base", classifyIncompleteBackup],
]) {
  const negative = JSON.parse(
    await readFile(join(negativeDirectory, `${name}.json`), "utf8"),
  );
  if (
    negative.result !== "EXPECTED_FAILURE_CONFIRMED" ||
    classify(negative) !== "EXPECTED_FAILURE_CONFIRMED"
  )
    throw new Error(`Negative recovery evidence missing or failed: ${name}`);
  if (
    /password|secret|token|credential|postgres(?:ql)?:\/\/[^\s]*@/i.test(
      JSON.stringify(negative),
    )
  )
    throw new Error(
      "Negative recovery evidence contains a forbidden secret field",
    );
}
console.log("Recovery evidence complete and secret-free");
