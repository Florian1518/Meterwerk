import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  cpSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, dirname, isAbsolute } from "node:path";
import { buildWorkerBundles } from "./build-worker-bundles.mjs";
import { copyArgon2Runtime } from "./copy-argon2-runtime.mjs";
const version = process.env.RELEASE_VERSION ?? "0.1.0";
if (!/^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))
  throw new Error("Invalid release version");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const output = resolve("release-artifacts", version);
const sbom = JSON.parse(
  readFileSync(`release-artifacts/sbom-${version}.cdx.json`, "utf8"),
);
const lockfileSha256 = createHash("sha256")
  .update(readFileSync("pnpm-lock.yaml"))
  .digest("hex");
const auditPath = resolve("docs/acceptance/DEPENDENCY-AUDIT-4932F00.json");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
if (
  sbom.metadata.component.version !== version ||
  sbom.metadata.properties.find((p) => p.name === "git.commit")?.value !==
    commit ||
  sbom.metadata.properties.find((p) => p.name === "pnpm.lockfile.sha256")
    ?.value !== lockfileSha256
)
  throw new Error(
    "SBOM version, commit or lockfile does not match artifact input",
  );
if (
  audit.status !== "PASSED" ||
  audit.exitCode !== 0 ||
  audit.lockfile.sha256 !== lockfileSha256 ||
  ["critical", "high", "moderate", "low", "info"].some(
    (severity) => audit.advisories[severity] !== 0,
  )
)
  throw new Error(
    "Dependency audit provenance does not match current lockfile",
  );
const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
if (!buildId) throw new Error("Completed Next production build required");
mkdirSync(output, { recursive: true });
copyFileSync(
  `release-artifacts/sbom-${version}.cdx.json`,
  resolve(output, "sbom.cdx.json"),
);
copyFileSync(auditPath, resolve(output, "dependency-audit.json"));
await buildWorkerBundles(resolve(output, "worker"));
const standalone = resolve(".next/standalone");
// Next's traced runtime preserves transitive dependencies of relocated packages.
// Static/public files are explicitly excluded from Next's automatic copy.
cpSync(".next/static", resolve(standalone, ".next/static"), {
  recursive: true,
});
cpSync("public", resolve(standalone, "public"), { recursive: true });
cpSync("prisma", resolve(standalone, "prisma"), { recursive: true });
// Optional N-API dependencies can be omitted by Next's standalone tracer.
await copyArgon2Runtime(standalone);
copyFileSync("prisma.config.ts", resolve(standalone, "prisma.config.ts"));
mkdirSync(resolve(standalone, "scripts"), { recursive: true });
copyFileSync(
  "scripts/verify-migration-baseline.mjs",
  resolve(standalone, "scripts/verify-migration-baseline.mjs"),
);
copyFileSync("pnpm-lock.yaml", resolve(standalone, "pnpm-lock.yaml"));
copyFileSync("pnpm-workspace.yaml", resolve(standalone, "pnpm-workspace.yaml"));
copyFileSync("scripts/start-standalone.mjs", resolve(standalone, "start.mjs"));
const portable = (path) => path.replaceAll("\\", "/");
const contained = (root, path) => {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};
const links = [];
const archiveFiles = [];
function traceFiles(directory) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    const local = portable(relative(standalone, path));
    if (
      /(^|\/)(\.env(?:\..*)?|\.local|\.git)(\/|$)|(^|\/)\.next\/(cache|dev)(\/|$)|\.(pem|key|p12|pfx)$/.test(
        local,
      )
    )
      continue;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      let target = resolve(dirname(path), readlinkSync(path));
      if (!contained(standalone, target)) {
        if (!contained(resolve("."), target))
          throw new Error("Trace points outside workspace");
        target = resolve(standalone, relative(resolve("."), target));
      }
      if (!contained(standalone, target) || !statSync(target).isDirectory())
        throw new Error("Unresolved traced directory link");
      links.push({
        path: local,
        target: portable(relative(dirname(path), target)),
      });
    } else if (stat.isDirectory()) traceFiles(path);
    else if (stat.isFile()) archiveFiles.push(local);
    else throw new Error("Unsupported artifact file type");
  }
}
traceFiles(standalone);
writeFileSync(
  resolve(standalone, "runtime-links.json"),
  JSON.stringify(links, null, 2),
);
if (!archiveFiles.includes("runtime-links.json"))
  archiveFiles.push("runtime-links.json");
const archiveList = resolve("release-artifacts", `web-files-${version}.txt`);
writeFileSync(archiveList, archiveFiles.sort().join("\n") + "\n");
execFileSync(
  "tar",
  [
    "-cf",
    resolve(output, "web-build.tar"),
    "--exclude=.env",
    "--exclude=.env.*",
    "--exclude=*.pem",
    "--exclude=*.key",
    "--exclude=.next/cache",
    "-C",
    standalone,
    "--no-recursion",
    "-T",
    archiveList,
  ],
  { stdio: "inherit" },
);
writeFileSync(
  resolve(output, "metadata.json"),
  JSON.stringify(
    {
      version,
      commit,
      builtAt: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "production",
      workingTree: execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim()
        ? "dirty"
        : "clean",
      packageVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
      targetVersion: "1.0.0",
      buildId,
      platform: process.platform,
      architecture: process.arch,
      provenance: {
        gitSha: commit,
        buildTimestamp: process.env.BUILD_TIMESTAMP ?? new Date().toISOString(),
        lockfile: { file: "pnpm-lock.yaml", sha256: lockfileSha256 },
        dependencyAudit: {
          file: "dependency-audit.json",
          gitSha: audit.gitSha,
          exitCode: audit.exitCode,
          advisories: audit.advisories,
        },
        sbom: {
          file: "sbom.cdx.json",
          components: sbom.components.length,
          dependencyNodes: sbom.dependencies.length,
        },
        artifactVerifier: {
          command: "node scripts/verify-release-artifact.mjs",
          status: "NOT_RUN",
          exitCode: null,
        },
        platform: `${process.platform}-${process.arch}`,
      },
      signing: "SIGNING_PREPARED_NOT_VERIFIED",
      images: "NOT_EXECUTED",
      staging: "EXTERNAL_VALIDATION_PENDING",
      limitations:
        "Next standalone web runtime for the recorded platform; node start.mjs restores contained directory links and starts server.js. Not a container or release approval. Worker bundles require Node with --conditions=react-server and separately installed dependencies; migrations require Prisma CLI from the lockfile.",
    },
    null,
    2,
  ),
);
console.log(`Release metadata written to ${output}`);
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const checksums = files(output)
  .filter((path) => !path.endsWith("checksums.sha256"))
  .map(
    (path) =>
      `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${path.slice(output.length + 1).replaceAll("\\", "/")}`,
  );
writeFileSync(resolve(output, "checksums.sha256"), checksums.join("\n") + "\n");
