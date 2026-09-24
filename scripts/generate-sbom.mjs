import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = process.env.RELEASE_VERSION ?? pkg.version;
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const packages = { ...pkg.dependencies, ...pkg.devDependencies };
const components = Object.entries(packages).map(([name, versionRange]) => ({
  type: "library",
  "bom-ref": name,
  name,
  version: versionRange,
}));
mkdirSync("release-artifacts", { recursive: true });
writeFileSync(
  `release-artifacts/sbom-${version}.cdx.json`,
  JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      metadata: {
        component: { type: "application", name: pkg.name, version },
        properties: [{ name: "git.commit", value: commit }],
      },
      components,
    },
    null,
    2,
  ),
);
