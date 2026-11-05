import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const [fullPath, hostPath, verifierPath, sourceSha] = process.argv.slice(2);
assert.ok(fullPath && hostPath && verifierPath);
assert.match(sourceSha ?? "", /^[a-f0-9]{40}$/);
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const source = read(fullPath);
const host = read(hostPath);
const verifier = read(verifierPath);
assert.equal(source.status, "PASSED");
assert.equal(source.sourceSha, sourceSha);
assert.equal(source.localCopiesRemoved, true);
assert.equal(source.offsiteOnlyDownload, true);
assert.ok(source.objects.length >= 2);
for (const object of source.objects) {
  assert.match(object.sha256, /^[a-f0-9]{64}$/);
  assert.ok(object.version && object.version !== "null");
}
assert.equal(host.status, "PASSED");
assert.equal(host.sourceSha, sourceSha);
assert.equal(host.emptyTargetVerified, true);
assert.equal(host.imagesLoaded, true);
assert.equal(host.offsiteOnlyRestore, true);
assert.equal(host.databaseVerified, true);
assert.equal(host.appReady, true);
assert.equal(host.mqttWorkerSubscribed, true);
assert.ok(Number.isFinite(host.durationSeconds) && host.durationSeconds > 0);
for (const mark of [
  "start",
  "imagesReady",
  "configurationReady",
  "databaseReady",
  "downloadAndHashComplete",
  "ageDecryptionComplete",
  "databaseRestored",
  "mqttReady",
  "appReady",
  "mqttWorkerReady",
  "restoreVerifierPassed",
  "end",
]) {
  assert.ok(
    Number.isFinite(host.marks[mark]),
    `Missing host-loss mark: ${mark}`,
  );
}
assert.equal(verifier.status, "PASSED");
for (const check of [
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
]) {
  assert.equal(
    verifier.checks?.[check],
    true,
    `Restore verifier failed: ${check}`,
  );
}
console.log(`HOST_LOSS_DURATION_SECONDS=${host.durationSeconds}`);
console.log("HOST_LOSS_RESULT=PASSED");
