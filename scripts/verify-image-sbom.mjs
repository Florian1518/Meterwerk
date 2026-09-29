import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const images = ["web", "worker"];
const reports = {};
for (const image of images) {
  const file = resolve(`.local/acceptance/${image}-image-sbom.cdx.json`);
  const bytes = readFileSync(file);
  const bom = JSON.parse(bytes.toString("utf8"));
  assert.equal(bom.bomFormat, "CycloneDX");
  assert.match(bom.specVersion, /^\d+\.\d+$/);
  assert(Array.isArray(bom.components) && bom.components.length > 0);
  const refs = new Set(bom.components.map((item) => item["bom-ref"]));
  if (bom.metadata?.component?.["bom-ref"])
    refs.add(bom.metadata.component["bom-ref"]);
  for (const component of bom.components) {
    assert(component.name, `${image} SBOM component has a name`);
    assert(
      component.version,
      `${image} SBOM ${component.name} has a concrete version`,
    );
    assert(component["bom-ref"], `${image} SBOM component has a reference`);
    if (component.purl) assert.match(component.purl, /^pkg:/);
  }
  for (const dependency of bom.dependencies ?? []) {
    assert(refs.has(dependency.ref), `${image} SBOM dependency parent exists`);
    for (const child of dependency.dependsOn ?? [])
      assert(refs.has(child), `${image} SBOM dependency child exists`);
  }
  reports[image] = {
    file: file.replace(`${process.cwd()}\\`, "").replaceAll("\\", "/"),
    components: bom.components.length,
    dependencyNodes: bom.dependencies?.length ?? 0,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
mkdirSync(".local/acceptance", { recursive: true });
writeFileSync(
  ".local/acceptance/image-sbom-verification.json",
  JSON.stringify({ status: "PASSED", images: reports }, null, 2),
);
console.log(JSON.stringify({ status: "PASSED", images: reports }, null, 2));
