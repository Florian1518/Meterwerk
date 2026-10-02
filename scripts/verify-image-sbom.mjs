import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyImageSbom } from "./image-sbom-policy.mjs";

const images = ["web", "worker"];
const reports = {};
for (const image of images) {
  const file = resolve(`.local/acceptance/${image}-image-sbom.cdx.json`);
  const bytes = readFileSync(file);
  const bom = JSON.parse(bytes.toString("utf8"));
  const runtime = JSON.parse(
    readFileSync(resolve(`.local/acceptance/${image}-image-runtime.json`)),
  );
  assert(runtime.imageId, `${image} runtime evidence identifies its image`);
  verifyImageSbom(bom, runtime.imageId);
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
