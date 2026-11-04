import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [root, expectedSha] = process.argv.slice(2);
assert.ok(root && /^[a-f0-9]{40}$/.test(expectedSha ?? ""));
const read = (name) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const full = read("offsite-full.json");
const security = read("offsite-security.json");
const versions = read("offsite-versions.json");
const wal = read("meterwerk-pitr-evidence/offsite-wal.json");
const pitr = read("meterwerk-pitr-evidence/positive-pitr.json");
const missing = read("meterwerk-pitr-evidence/missing-wal.json");
const incomplete = read("meterwerk-pitr-evidence/incomplete-base.json");
const restore = read("recovery-evidence.json");
const host = read("offsite-host-loss.json");

assert.equal(full.status, "PASSED");
assert.equal(full.sourceSha, expectedSha);
assert.equal(full.security.privateBucketValidation, "PASSED");
assert.equal(full.security.versioning, "Enabled");
assert.equal(full.security.website, "disabled");
assert.equal(full.security.publicAccessBlock, "all-enabled");
assert.equal(full.localCopiesRemoved, true);
assert.equal(full.offsiteOnlyDownload, true);
assert.equal(full.corruptExternalObject, "EXPECTED_FAILURE_CONFIRMED");
assert.ok(full.objects.length >= 2);
for (const object of full.objects) {
  assert.ok(object.version && object.version !== "null");
  assert.equal(object.sse, "AES256");
  assert.match(object.sha256, /^[a-f0-9]{64}$/);
}
assert.equal(versions.status, "PASSED");
assert.notEqual(versions.versions[0].version, versions.versions[1].version);
assert.equal(versions.olderVersionRetrieved, true);
assert.equal(versions.anonymousDenied, "AccessDenied");
assert.equal(wal.status, "PASSED");
assert.equal(wal.offsiteOnlyDownload, true);
assert.equal(wal.localCopiesRemoved, true);
assert.equal(wal.targetValidated, true);
assert.equal(pitr.result, "PASSED");
assert.equal(pitr.recoveryResult, "TARGET_REACHED");
assert.equal(pitr.baselineCount, 1);
assert.equal(pitr.preErrorCount, 1);
assert.equal(pitr.postTargetErrorCount, 0);
assert.equal(missing.result, "EXPECTED_FAILURE_CONFIRMED");
assert.equal(incomplete.result, "EXPECTED_FAILURE_CONFIRMED");
assert.equal(restore.status, "PASSED");
assert.equal(restore.checks.noSchemaDrift, true);
assert.equal(restore.checks.applicationReadiness, true);
assert.equal(full.restoreVerifier, "PASSED");
assert.equal(host.status, "PASSED");
assert.equal(host.sourceSha, expectedSha);
assert.equal(host.emptyTargetVerified, true);
assert.equal(host.offsiteOnlyRestore, true);
assert.equal(host.databaseVerified, true);
assert.equal(host.appReady, true);
assert.equal(host.mqttWorkerSubscribed, true);
assert.ok(Number.isFinite(host.durationSeconds) && host.durationSeconds > 0);
for (const step of ["start", "imagesReady", "configurationReady", "databaseReady",
  "downloadAndHashComplete", "ageDecryptionComplete", "databaseRestored",
  "appStartup", "appReady", "mqttWorkerReady", "restoreVerifierPassed", "end"])
  assert.ok(Number.isFinite(host.marks[step]), `host-loss phase missing: ${step}`);
assert.ok(host.marks.end > host.marks.start);
console.log("Offsite, versioning, PITR, negative recovery and empty-host evidence PASSED");
