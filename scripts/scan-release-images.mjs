import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  roles,
  imageReference,
  sha256,
  json,
  vulnerabilitySummary,
} from "./release-manifest.mjs";

const root = resolve("release-artifacts");
const evidence = resolve(root, "security");
mkdirSync(evidence, { recursive: true });
const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
const save = (file, value) =>
  writeFileSync(resolve(evidence, file), JSON.stringify(value, null, 2) + "\n");
const scanner =
  "clamav/clamav:1.5.4@sha256:bda39705e291105049c3936e2803ac90b955172af8030f94f05dce1252df6c6d";
const definitions = resolve(
  process.env.RUNNER_TEMP,
  "meterwerk-clamav-definitions",
);
mkdirSync(definitions, { recursive: true });
run("docker", [
  "run",
  "--rm",
  "--user",
  "0",
  "-v",
  `${definitions}:/var/lib/clamav`,
  "--entrypoint",
  "freshclam",
  scanner,
  "--stdout",
  "--user=root",
]);
const version = run("docker", [
  "run",
  "--rm",
  "--network",
  "none",
  "-v",
  `${definitions}:/var/lib/clamav:ro`,
  "--entrypoint",
  "clamscan",
  scanner,
  "--version",
]).trim();
assert.match(version, /^ClamAV 1\.5\.4\//);
const definitionsSha256 = sha256(
  run("docker", [
    "run",
    "--rm",
    "--network",
    "none",
    "-v",
    `${definitions}:/var/lib/clamav:ro`,
    "--entrypoint",
    "sh",
    scanner,
    "-ec",
    "sha256sum /var/lib/clamav/*.c[lv]d",
  ]),
);
function malware(path, subject, file) {
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      `${definitions}:/var/lib/clamav:ro`,
      "-v",
      `${path}:/scan:ro`,
      "--entrypoint",
      "clamscan",
      scanner,
      "--recursive",
      "--infected",
      "--alert-exceeds-max=yes",
      "--max-filesize=2000M",
      "--max-scansize=4000M",
      "--max-files=1000000",
      "--max-recursion=100",
      "/scan",
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  const scannedFiles = Number(
    /Scanned files:\s+(\d+)/.exec(result.stdout ?? "")?.[1] ?? 0,
  );
  save(file, {
    scanner: "ClamAV",
    scannerImage: scanner,
    version,
    definitionsSha256,
    scannedAt: new Date().toISOString(),
    subject,
    scannedFiles,
    exitCode: result.status,
    status: result.status === 0 && scannedFiles > 0 ? "PASSED" : "FAILED",
  });
  if (result.status !== 0) {
    const diagnostics = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      .split(/\r?\n/)
      .filter((line) =>
        /(?:^|\s)(?:ERROR|WARNING):|LibClamAV Error:/i.test(line),
      )
      .map((line) => line.replaceAll(path, "[scan target]").slice(0, 240))
      .slice(0, 10);
    throw new Error(
      `Malware scanner failed for ${file}; exit=${result.status}; ${diagnostics.join(" | ") || "scanner returned a non-passing status"}`,
    );
  }
  assert(scannedFiles > 0, "Malware scanner did not scan any files");
}

const images = {};
let securityFailure = false;
for (const role of roles) {
  const name = `ghcr.io/florian1518/meterwerk-${role}`;
  const inspect = JSON.parse(
    run("docker", ["image", "inspect", `${name}:${process.env.GITHUB_SHA}`]),
  )[0];
  const reference = inspect.RepoDigests.find((value) =>
    value.startsWith(name + "@"),
  );
  assert(reference, "Published registry digest is missing");
  const digest = reference.split("@")[1];
  assert.equal(reference, imageReference(role, digest));
  run("docker", ["pull", reference]);
  const final = JSON.parse(run("docker", ["image", "inspect", reference]))[0];
  assert.equal(
    final.Id,
    inspect.Id,
    "Published image differs from runtime-tested image",
  );
  assert.equal(
    final.Config.Labels["org.opencontainers.image.revision"],
    process.env.GITHUB_SHA,
  );
  assert.equal(
    final.Config.Labels["org.opencontainers.image.version"],
    process.env.RELEASE_VERSION,
  );
  const sourceFile = resolve(evidence, `${role}.syft.json`);
  run("syft", [`registry:${reference}`, "-o", `syft-json=${sourceFile}`]);
  const source = json(sourceFile);
  assert(
    source.source?.metadata?.repoDigests?.includes(reference),
    "Syft did not record final registry digest",
  );
  const bom = JSON.parse(
    run("syft", ["convert", sourceFile, "-o", "cyclonedx-json"]),
  );
  bom.metadata.properties ??= [];
  bom.metadata.properties.push({
    name: "meterwerk.image.reference",
    value: reference,
  });
  save(`${role}.cdx.json`, bom);
  const scanFile = resolve(evidence, `${role}.grype.json`);
  run("grype", [`registry:${reference}`, "-o", "json", "--file", scanFile]);
  try {
    vulnerabilitySummary(json(scanFile), reference);
  } catch {
    securityFailure = true;
  }
  const container = run("docker", ["create", reference]).trim();
  const exported = resolve(process.env.RUNNER_TEMP, `${role}-filesystem`);
  mkdirSync(exported, { recursive: true });
  try {
    // Copy, but never execute, the final merged root filesystem. ClamAV then
    // examines files directly instead of treating the Docker export as an archive.
    run("docker", ["cp", `${container}:/`, exported]);
  } finally {
    run("docker", ["rm", container]);
  }
  malware(exported, reference, `${role}.malware.json`);
  images[role] = {
    digest,
    reference,
    sbom: `security/${role}.cdx.json`,
    sourceSbom: `security/${role}.syft.json`,
    vulnerabilities: `security/${role}.grype.json`,
    malware: `security/${role}.malware.json`,
    provenance: `security/${role}.provenance.sigstore.json`,
    sbomAttestation: `security/${role}.sbom.sigstore.json`,
  };
  appendFileSync(process.env.GITHUB_OUTPUT, `${role}_digest=${digest}\n`);
}
const versionRoot = resolve(root, process.env.RELEASE_VERSION);
const archiveDigest = sha256(
  readFileSync(resolve(versionRoot, "web-build.tar")),
);
malware(versionRoot, `sha256:${archiveDigest}`, "archive.malware.json");
save("images.json", images);
assert(
  !securityFailure,
  "Image CVE policy blocked release; inspect archived Grype reports",
);
