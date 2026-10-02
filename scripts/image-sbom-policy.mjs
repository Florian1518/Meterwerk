import assert from "node:assert/strict";

export function verifyImageSbom(bom, imageId) {
  assert.equal(bom.bomFormat, "CycloneDX");
  assert.match(bom.specVersion, /^\d+\.\d+$/);
  assert(Array.isArray(bom.components) && bom.components.length > 0);
  const refs = new Set();
  function collect(components) {
    for (const component of components) {
      assert(component.name && component["bom-ref"]);
      if (component.type !== "file") assert(component.version);
      if (component.purl) assert.match(component.purl, /^pkg:/);
      refs.add(component["bom-ref"]);
      collect(component.components ?? []);
    }
  }
  collect(bom.components);
  if (bom.metadata?.component) collect([bom.metadata.component]);
  if (imageId) {
    assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
    const purl = bom.metadata?.component?.purl ?? "";
    assert.equal(purl.split("@")[1]?.split("?")[0], imageId);
  }
  for (const dependency of bom.dependencies ?? []) {
    assert(refs.has(dependency.ref), "SBOM dependency parent exists");
    for (const child of dependency.dependsOn ?? [])
      assert(refs.has(child), "SBOM dependency child exists");
  }
}
