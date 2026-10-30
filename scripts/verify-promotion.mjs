import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import {
  json,
  roles,
  repository,
  signerWorkflow,
  verifyManifestFiles,
} from "./release-manifest.mjs";

// Expected SHA/version must come from the caller's approved release, never from
// untrusted manifest fields. This command produces a plan only; it cannot deploy.
const [directory, expectedSha, expectedVersion, output] = process.argv.slice(2);
assert(
  directory && expectedSha && expectedVersion,
  "Usage: verify-promotion.mjs DIR EXPECTED_SHA EXPECTED_VERSION [OUTPUT_ENV]",
);
const root = resolve(directory);
const manifestPath = resolve(root, "release-manifest.json");
const manifest = json(manifestPath);
const summaries = verifyManifestFiles(manifest, root, {
  gitSha: expectedSha,
  version: expectedVersion,
});
function verify(subject, predicateType, bundle) {
  const args = [
    "attestation",
    "verify",
    subject,
    "--repo",
    repository,
    "--signer-workflow",
    signerWorkflow,
    "--source-digest",
    expectedSha,
    "--cert-oidc-issuer",
    "https://token.actions.githubusercontent.com",
    "--deny-self-hosted-runners",
    "--predicate-type",
    predicateType,
    "--format",
    "json",
  ];
  if (bundle) args.push("--bundle", resolve(root, bundle));
  const result = execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  assert(JSON.parse(result).length > 0, "No verified attestation");
}
verify(
  manifestPath,
  "https://slsa.dev/provenance/v1",
  "release-manifest.sigstore.json",
);
for (const role of roles) {
  const image = manifest.images[role];
  verify(
    `oci://${image.reference}`,
    "https://slsa.dev/provenance/v1",
    image.provenance,
  );
  verify(
    `oci://${image.reference}`,
    "https://cyclonedx.org/bom",
    image.sbomAttestation,
  );
}
verify(
  resolve(root, manifest.version, "web-build.tar"),
  "https://slsa.dev/provenance/v1",
  "security/archive.provenance.sigstore.json",
);
if (output)
  writeFileSync(
    resolve(output),
    roles
      .map(
        (role) =>
          `METERWERK_${role.toUpperCase()}_IMAGE=${manifest.images[role].reference}`,
      )
      .join("\n") + "\n",
  );
console.log(
  JSON.stringify(
    {
      status: "PASSED",
      gitSha: expectedSha,
      version: expectedVersion,
      images: summaries,
      deployment: "NOT_EXECUTED",
    },
    null,
    2,
  ),
);
