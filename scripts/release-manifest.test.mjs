import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureSourceState, verifySourceState } from "./source-state.mjs";
import {
  imageReference,
  inventory,
  parseManifest,
  roles,
  sha256,
  signerWorkflow,
  verifyManifestFiles,
  vulnerabilitySummary,
  verifyMalware,
} from "./release-manifest.mjs";

const gitSha = "a".repeat(40);
const version = "1.0.0-rc.7";
const expected = { gitSha, version };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "meterwerk-release-test-"));
  const sourceState = {
    schemaVersion: 1,
    commit: gitSha,
    tree: "b".repeat(40),
    capturedAt: "2026-10-30T00:00:00Z",
    workingTree: "clean",
    statusEntries: 0,
    statusSha256: sha256(""),
    command: "git status --porcelain=v1 --untracked-files=all",
  };
  const manifest = {
    schemaVersion: 1,
    status: "ACCEPTED",
    repository: "Florian1518/Meterwerk",
    gitSha,
    version,
    sourceState,
    buildEnvironment: "github-hosted-ubuntu-24.04-linux-amd64",
    builtAt: "2026-10-30T01:00:00Z",
    sourceRun:
      "https://github.com/Florian1518/Meterwerk/actions/runs/123/attempts/1",
    signing: {
      method: "github-oidc-sigstore-attestation",
      issuer: "https://token.actions.githubusercontent.com",
      workflow: signerWorkflow,
    },
    images: {},
    archiveMalware: "archive-malware.json",
    files: {},
  };
  const put = (file, value) => {
    mkdirSync(resolve(root, file, ".."), { recursive: true });
    writeFileSync(
      resolve(root, file),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const malware = (subject) => ({
    scanner: "ClamAV",
    version: "ClamAV 1.5.4/123/date",
    definitionsSha256: "c".repeat(64),
    status: "PASSED",
    exitCode: 0,
    scannedFiles: 10,
    subject,
  });
  put(`${version}/metadata.json`, { commit: gitSha, version, sourceState });
  put(`${version}/web-build.tar`, "test archive bytes");
  put(
    manifest.archiveMalware,
    malware(`sha256:${sha256("test archive bytes")}`),
  );
  for (const [index, role] of roles.entries()) {
    const digest = `sha256:${String(index + 1).repeat(64)}`;
    const reference = imageReference(role, digest);
    const image = {
      digest,
      reference,
      sbom: `${role}.cdx.json`,
      sourceSbom: `${role}.syft.json`,
      vulnerabilities: `${role}.grype.json`,
      malware: `${role}.malware.json`,
      provenance: `${role}.provenance.json`,
      sbomAttestation: `${role}.attestation.json`,
    };
    manifest.images[role] = image;
    put(image.sbom, {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      components: [
        { name: "test-package", version: "1.0.0", "bom-ref": "pkg:test" },
      ],
      metadata: {
        properties: [{ name: "meterwerk.image.reference", value: reference }],
      },
    });
    put(image.sourceSbom, {
      source: { metadata: { repoDigests: [reference] } },
      descriptor: { name: "syft", version: "1.55.0" },
    });
    put(image.vulnerabilities, {
      source: { target: { repoDigests: [reference] } },
      descriptor: { name: "grype", version: "0.121.0" },
      matches: [],
    });
    put(image.malware, malware(reference));
    put(image.provenance, { verificationMaterial: { fixture: true } });
    put(image.sbomAttestation, { verificationMaterial: { fixture: true } });
  }
  const rehash = () => {
    manifest.files = Object.fromEntries(
      inventory(root).map((file) => [
        file,
        sha256(readFileSync(resolve(root, file))),
      ]),
    );
  };
  rehash();
  return {
    root,
    manifest,
    put,
    rehash,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("complete manifest and evidence parse; cryptographic verification is a separate mandatory CLI gate", () => {
  const f = fixture();
  try {
    assert.equal(parseManifest(f.manifest, expected).gitSha, gitSha);
    assert.equal(verifyManifestFiles(f.manifest, f.root, expected).web.High, 0);
  } finally {
    f.close();
  }
});
for (const [name, mutate] of [
  [
    "wrong SHA",
    (f) => {
      f.manifest.gitSha = "d".repeat(40);
    },
  ],
  [
    "wrong version",
    (f) => {
      f.manifest.version = "2.0.0";
    },
  ],
  [
    "mutable tag",
    (f) => {
      f.manifest.images.web.reference =
        "ghcr.io/florian1518/meterwerk-web:latest";
    },
  ],
  [
    "wrong digest",
    (f) => {
      f.manifest.images.web.digest = `sha256:${"9".repeat(64)}`;
    },
  ],
  [
    "missing SBOM",
    (f) => {
      delete f.manifest.images.web.sbom;
    },
  ],
  [
    "wrong SBOM association despite recomputed checksum",
    (f) => {
      f.put(f.manifest.images.web.sourceSbom, {
        source: {
          metadata: { repoDigests: [f.manifest.images.worker.reference] },
        },
        descriptor: { name: "syft", version: "1.55.0" },
      });
      f.rehash();
    },
  ],
  [
    "missing vulnerability evidence",
    (f) => {
      delete f.manifest.images.worker.vulnerabilities;
    },
  ],
  [
    "missing malware evidence",
    (f) => {
      delete f.manifest.images.migrations.malware;
    },
  ],
  [
    "missing provenance",
    (f) => {
      delete f.manifest.images.web.provenance;
    },
  ],
  [
    "wrong workflow",
    (f) => {
      f.manifest.signing.workflow = "foreign/repo/.github/workflows/build.yml";
    },
  ],
  [
    "wrong issuer",
    (f) => {
      f.manifest.signing.issuer = "https://example.invalid";
    },
  ],
  [
    "tampered release archive",
    (f) => {
      f.put(`${version}/web-build.tar`, "tampered");
    },
  ],
  [
    "path escape",
    (f) => {
      f.manifest.files["../secret"] = "a".repeat(64);
    },
  ],
  [
    "dirty source",
    (f) => {
      f.manifest.sourceState.workingTree = "dirty";
      f.manifest.sourceState.statusEntries = 1;
    },
  ],
  [
    "forged clean source",
    (f) => {
      f.manifest.sourceState.statusEntries = 1;
    },
  ],
])
  test(`rejects ${name}`, () => {
    const f = fixture();
    try {
      mutate(f);
      assert.throws(() => verifyManifestFiles(f.manifest, f.root, expected));
    } finally {
      f.close();
    }
  });

test("CVE policy rejects High, Critical, Unknown, ignored findings and a foreign digest", () => {
  const reference = imageReference("web", `sha256:${"1".repeat(64)}`);
  const report = {
    descriptor: { name: "grype", version: "0.121.0" },
    source: { target: { repoDigests: [reference] } },
    matches: [],
  };
  for (const severity of ["Critical", "High", "Unknown"])
    assert.throws(() =>
      vulnerabilitySummary(
        { ...report, matches: [{ vulnerability: { severity } }] },
        reference,
      ),
    );
  assert.equal(
    vulnerabilitySummary(
      { ...report, matches: [{ vulnerability: { severity: "Medium" } }] },
      reference,
    ).Medium,
    1,
  );
  assert.throws(() =>
    vulnerabilitySummary({ ...report, ignoredMatches: [{}] }, reference),
  );
  assert.throws(() =>
    vulnerabilitySummary(
      report,
      imageReference("worker", `sha256:${"2".repeat(64)}`),
    ),
  );
});

test("malware errors, empty scans and missing definitions never pass", () => {
  for (const report of [
    { exitCode: 2 },
    { exitCode: 0, scannedFiles: 0 },
    {
      scanner: "ClamAV",
      version: "ClamAV 1.5.4/123/date",
      status: "PASSED",
      exitCode: 0,
      scannedFiles: 10,
      subject: "test",
    },
  ])
    assert.throws(() => verifyMalware(report, "test"));
});

test("real source capture distinguishes clean, tracked changes and untracked source; generated ignored output does not dirty source", () => {
  const dir = mkdtempSync(join(tmpdir(), "meterwerk-source-test-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" });
  try {
    git("init");
    writeFileSync(join(dir, ".gitignore"), "generated/\n");
    writeFileSync(join(dir, "source.txt"), "original\n");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "fixture",
    );
    const clean = captureSourceState(dir);
    verifySourceState(clean, clean.commit);
    mkdirSync(join(dir, "generated"));
    writeFileSync(join(dir, "generated/evidence.json"), "{}");
    assert.equal(captureSourceState(dir).workingTree, "clean");
    writeFileSync(join(dir, "source.txt"), "changed\n");
    const dirty = captureSourceState(dir);
    assert.equal(dirty.workingTree, "dirty");
    assert.throws(() => verifySourceState(dirty, clean.commit));
    writeFileSync(join(dir, "source.txt"), "original\n");
    writeFileSync(join(dir, "new-source.txt"), "new\n");
    assert.equal(captureSourceState(dir).workingTree, "dirty");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
