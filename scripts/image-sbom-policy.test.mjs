import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyImageSbom } from "./image-sbom-policy.mjs";

const digest = "sha256:" + "a".repeat(64);
function fixture() {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: {
        name: "worker",
        version: "acceptance",
        "bom-ref": "image",
        purl: `pkg:oci/worker@${digest}?tag=acceptance`,
      },
    },
    components: [
      {
        name: "runtime",
        version: "1.0.0",
        "bom-ref": "runtime",
        components: [{ type: "file", name: "/runtime.js", "bom-ref": "file" }],
      },
    ],
    dependencies: [{ ref: "runtime", dependsOn: ["file"] }],
  };
}
test("accepts Scout nested file components without invented versions", () => {
  verifyImageSbom(fixture(), digest);
});
test("rejects an SBOM for a different image digest", () => {
  assert.throws(() => verifyImageSbom(fixture(), "sha256:" + "b".repeat(64)));
});
test("rejects unresolved dependency references", () => {
  const bom = fixture();
  bom.dependencies[0].dependsOn.push("missing");
  assert.throws(() => verifyImageSbom(bom, digest), /child exists/);
});
test("requires concrete package versions", () => {
  const bom = fixture();
  delete bom.components[0].version;
  assert.throws(() => verifyImageSbom(bom, digest));
});
