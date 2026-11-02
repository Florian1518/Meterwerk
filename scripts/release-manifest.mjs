import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { verifySourceState } from "./source-state.mjs";
import { verifyImageSbom } from "./image-sbom-policy.mjs";

export const roles = ["web", "worker", "migrations"];
export const repository = "Florian1518/Meterwerk";
export const signerWorkflow = `${repository}/.github/workflows/publish-images.yml`;
export const digestPattern = /^sha256:[a-f0-9]{64}$/;
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const json = (path) => JSON.parse(readFileSync(path, "utf8"));

export function imageReference(role, digest) {
  assert(roles.includes(role));
  assert.match(digest, digestPattern);
  return `ghcr.io/florian1518/meterwerk-${role}@${digest}`;
}

export function contained(root, file) {
  assert.equal(typeof file, "string");
  assert(
    !isAbsolute(file) &&
      !file.includes("\\") &&
      !file.split("/").includes(".."),
  );
  const path = resolve(root, file);
  assert(relative(root, path) && !relative(root, path).startsWith(".."));
  assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  return path;
}

export function inventory(root, dir = root) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = resolve(dir, name);
      const stat = lstatSync(path);
      assert(!stat.isSymbolicLink(), "Evidence cannot contain symlinks");
      return stat.isDirectory()
        ? inventory(root, path)
        : [relative(root, path).replaceAll("\\", "/")];
    });
}

export function parseManifest(manifest, expected) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.repository, repository);
  assert.match(manifest.gitSha, /^[a-f0-9]{40}$/);
  assert.equal(manifest.gitSha, expected.gitSha);
  assert.equal(manifest.version, expected.version);
  assert.match(manifest.version, /^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
  verifySourceState(manifest.sourceState, manifest.gitSha);
  assert(Number.isFinite(Date.parse(manifest.builtAt)));
  assert(
    Date.parse(manifest.sourceState.capturedAt) <= Date.parse(manifest.builtAt),
  );
  assert.equal(
    manifest.buildEnvironment,
    "github-hosted-ubuntu-24.04-linux-amd64",
  );
  assert.equal(
    manifest.signing.issuer,
    "https://token.actions.githubusercontent.com",
  );
  assert.equal(manifest.signing.workflow, signerWorkflow);
  assert.equal(manifest.signing.method, "github-oidc-sigstore-attestation");
  assert.match(
    manifest.sourceRun,
    /^https:\/\/github\.com\/Florian1518\/Meterwerk\/actions\/runs\/\d+\/attempts\/\d+$/,
  );
  assert.deepEqual(Object.keys(manifest.images).sort(), [...roles].sort());
  for (const role of roles) {
    const image = manifest.images[role];
    assert.equal(image.reference, imageReference(role, image.digest));
    for (const key of [
      "sbom",
      "sourceSbom",
      "vulnerabilities",
      "malware",
      "provenance",
      "sbomAttestation",
    ])
      assert.equal(typeof image[key], "string", `${role}: missing ${key}`);
  }
  assert.equal(manifest.status, "ACCEPTED");
  assert.equal(typeof manifest.archiveMalware, "string");
  assert(manifest.files && Object.keys(manifest.files).length > 0);
  return manifest;
}

export function vulnerabilitySummary(report, reference) {
  assert(Array.isArray(report.matches), "Missing vulnerability matches");
  assert.equal(report.descriptor?.name, "grype");
  assert.equal(report.descriptor?.version, "0.121.0");
  assert.equal(report.descriptor?.db?.status?.error ?? null, null);
  assert(
    report.source?.target?.repoDigests?.includes(reference),
    "Scan is not bound to final digest",
  );
  const counts = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    Negligible: 0,
    Unknown: 0,
  };
  for (const match of report.matches) {
    const severity = match.vulnerability?.severity;
    assert(Object.hasOwn(counts, severity), "Unknown severity encoding");
    counts[severity]++;
  }
  assert.equal(
    counts.Critical + counts.High + counts.Unknown,
    0,
    "Unreviewed Critical/High/Unknown vulnerabilities block release",
  );
  assert.equal(
    report.ignoredMatches?.length ?? 0,
    0,
    "Unreviewed vulnerability exceptions are forbidden",
  );
  return counts;
}

export function verifyMalware(report, subject) {
  assert.equal(report.scanner, "ClamAV");
  assert.match(report.version, /^ClamAV 1\.5\.4\//);
  assert.match(report.definitionsSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.subject, subject);
  assert.equal(report.exitCode, 0);
  assert.equal(report.status, "PASSED");
  assert(report.scannedFiles > 0);
}

export function verifyManifestFiles(manifest, root, expected) {
  parseManifest(manifest, expected);
  assert.deepEqual(
    inventory(root)
      .filter(
        (file) =>
          !["release-manifest.json", "release-manifest.sigstore.json"].includes(
            file,
          ),
      )
      .sort(),
    Object.keys(manifest.files).sort(),
    "Unbound or missing release files",
  );
  for (const [file, checksum] of Object.entries(manifest.files)) {
    assert.match(checksum, /^[a-f0-9]{64}$/);
    const bytes = readFileSync(contained(root, file));
    for (const forbidden of [
      "ci-only-synthetic-session-secret",
      "ci-only-synthetic-mfa-key-32-bytes",
      "ci-only-synthetic-demo-password",
    ])
      assert(
        !bytes.includes(Buffer.from(forbidden)),
        "Forbidden credential material in release evidence",
      );
    assert.doesNotMatch(
      bytes.toString("utf8"),
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
      "Private key marker in release evidence",
    );
    assert.equal(sha256(bytes), checksum, `Tampered evidence: ${file}`);
  }
  const read = (file) => {
    assert(Object.hasOwn(manifest.files, file), `Unbound evidence: ${file}`);
    return json(contained(root, file));
  };
  const metadata = read(`${manifest.version}/metadata.json`);
  assert.equal(metadata.commit, manifest.gitSha);
  assert.equal(metadata.version, manifest.version);
  assert.deepEqual(metadata.sourceState, manifest.sourceState);
  const archive = `${manifest.version}/web-build.tar`;
  assert(Object.hasOwn(manifest.files, archive));
  verifyMalware(
    read(manifest.archiveMalware),
    `sha256:${manifest.files[archive]}`,
  );
  const summaries = {};
  for (const role of roles) {
    const image = manifest.images[role];
    const source = read(image.sourceSbom);
    assert(
      source.source?.metadata?.repoDigests?.includes(image.reference),
      "SBOM belongs to another digest",
    );
    assert.equal(source.descriptor?.name, "syft");
    assert.equal(source.descriptor?.version, "1.55.0");
    const bom = read(image.sbom);
    verifyImageSbom(bom);
    assert(
      bom.metadata?.properties?.some(
        (p) =>
          p.name === "meterwerk.image.reference" && p.value === image.reference,
      ),
    );
    summaries[role] = vulnerabilitySummary(
      read(image.vulnerabilities),
      image.reference,
    );
    verifyMalware(read(image.malware), image.reference);
    for (const field of ["provenance", "sbomAttestation"])
      assert(
        read(image[field]).verificationMaterial,
        "Missing Sigstore verification material",
      );
  }
  return summaries;
}
