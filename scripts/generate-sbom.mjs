import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";
const require = createRequire(realpathSync("node_modules/eslint/package.json"));
const yaml = require("js-yaml");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = process.env.RELEASE_VERSION ?? pkg.version;
if (!/^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))
  throw new Error("Invalid release version");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const lockText = readFileSync("pnpm-lock.yaml", "utf8");
const documents = yaml.loadAll(lockText);
const lock = documents.find((doc) => doc?.importers?.["."]?.dependencies?.next);
if (!lock?.packages || !lock.snapshots)
  throw new Error("Application lockfile missing");
const ref = (name, version) =>
  `pkg:npm/${name.startsWith("@") ? "%40" + name.slice(1) : name}@${version}`;
const split = (key) => {
  const at = key.lastIndexOf("@");
  return [key.slice(0, at), key.slice(at + 1)];
};
const direct = new Set(
  Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }),
);
const components = Object.keys(lock.packages)
  .sort()
  .map((key) => {
    const [name, version] = split(key);
    if (!/^\d+\./.test(version)) throw new Error(`Unresolved package ${key}`);
    return {
      type: "library",
      "bom-ref": ref(name, version),
      name,
      version,
      purl: ref(name, version),
      properties: [
        {
          name: "meterwerk.dependency",
          value: direct.has(name) ? "direct" : "transitive",
        },
      ],
    };
  });
const known = new Set(components.map((c) => c["bom-ref"]));
const edges = new Map();
const applicationRef = ref(pkg.name, version);
const rootDependencies = new Set();
for (const [name, entry] of Object.entries({
  ...lock.importers["."].dependencies,
  ...lock.importers["."].devDependencies,
  ...lock.importers["."].optionalDependencies,
})) {
  const target = ref(name, String(entry.version).split("(")[0]);
  if (!known.has(target)) throw new Error(`Unresolved root dependency ${name}`);
  rootDependencies.add(target);
}
edges.set(applicationRef, rootDependencies);
for (const [key, snapshot] of Object.entries(lock.snapshots)) {
  const [name, version] = split(key.split("(")[0]);
  const parent = ref(name, version);
  const deps = edges.get(parent) ?? new Set();
  for (const [child, resolved] of Object.entries({
    ...snapshot.dependencies,
    ...snapshot.optionalDependencies,
  })) {
    const target = ref(child, String(resolved).split("(")[0]);
    if (!known.has(target))
      throw new Error(`Unresolved dependency ${child}: ${resolved}`);
    deps.add(target);
  }
  edges.set(parent, deps);
}
mkdirSync("release-artifacts", { recursive: true });
writeFileSync(
  `release-artifacts/sbom-${version}.cdx.json`,
  JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      metadata: {
        component: {
          type: "application",
          "bom-ref": applicationRef,
          name: pkg.name,
          version,
        },
        tools: [
          {
            vendor: "Meterwerk",
            name: "scripts/generate-sbom.mjs",
            version: "2",
          },
        ],
        properties: [
          { name: "git.commit", value: commit },
          {
            name: "pnpm.lockfile.sha256",
            value: createHash("sha256").update(lockText).digest("hex"),
          },
          {
            name: "git.workingTree",
            value: execFileSync("git", ["status", "--porcelain"], {
              encoding: "utf8",
            }).trim()
              ? "dirty"
              : "clean",
          },
        ],
      },
      components,
      dependencies: [...edges].map(([ref, deps]) => ({
        ref,
        dependsOn: [...deps].sort(),
      })),
    },
    null,
    2,
  ),
);
