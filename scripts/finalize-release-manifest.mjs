import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  inventory,
  json,
  repository,
  signerWorkflow,
  sha256,
  verifyManifestFiles,
} from "./release-manifest.mjs";

const root = resolve("release-artifacts");
const metadata = json(
  resolve(root, process.env.RELEASE_VERSION, "metadata.json"),
);
const manifest = {
  schemaVersion: 1,
  status: "ACCEPTED",
  repository,
  gitSha: metadata.commit,
  version: metadata.version,
  sourceState: metadata.sourceState,
  buildEnvironment: "github-hosted-ubuntu-24.04-linux-amd64",
  builtAt: metadata.provenance.buildTimestamp,
  sourceRun: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`,
  signing: {
    method: "github-oidc-sigstore-attestation",
    issuer: "https://token.actions.githubusercontent.com",
    workflow: signerWorkflow,
  },
  archiveMalware: "security/archive.malware.json",
  images: json(resolve(root, "security/images.json")),
  files: Object.fromEntries(
    inventory(root)
      .filter((file) => !file.startsWith("release-manifest."))
      .map((file) => [file, sha256(readFileSync(resolve(root, file)))]),
  ),
};
verifyManifestFiles(manifest, root, {
  gitSha: process.env.GITHUB_SHA,
  version: process.env.RELEASE_VERSION,
});
writeFileSync(
  resolve(root, "release-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
