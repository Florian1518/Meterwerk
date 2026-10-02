import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertWorkerRuntime,
  inspectWorkerRuntime,
  runtimeFileKind,
} from "./worker-runtime-policy.mjs";
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "worker-policy-"));
  try {
    for (const file of [
      "dist/rules-worker.js",
      "node_modules/runtime/package.json",
      "package.json",
      "runtime-manifest.json",
    ]) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(
        join(root, file),
        file.endsWith("package.json") ? "{}" : "",
      );
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("detects dev tools even inside pnpm virtual store without root symlinks", () => {
  for (const name of [
    "tsx",
    "typescript",
    "prisma",
    "@playwright/test",
    "playwright",
  ])
    fixture((root) => {
      const p = join(root, "node_modules/.pnpm/hidden/node_modules/tool");
      mkdirSync(p, { recursive: true });
      writeFileSync(
        join(p, "package.json"),
        JSON.stringify({ name, version: "1.0.0" }),
      );
      assert.throws(
        () => assertWorkerRuntime(inspectWorkerRuntime(root)),
        /devOnlyPackages/,
      );
    });
});
test("keeps Prisma client runtime distinct from Prisma CLI", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "node_modules/runtime/package.json"),
      JSON.stringify({ name: "@prisma/client", version: "7.10.0" }),
    );
    assertWorkerRuntime(inspectWorkerRuntime(root));
  }));
test("reports legitimate dependency fixtures without blanket rejection", () =>
  fixture((root) => {
    const p = join(root, "node_modules/runtime/tests");
    mkdirSync(p);
    writeFileSync(join(p, "valid.test.js"), "");
    const report = inspectWorkerRuntime(root);
    assert.equal(report.dependencyFixtures.length, 1);
    assertWorkerRuntime(report);
  }));
test("rejects project tests", () =>
  fixture((root) => {
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "tests", "leaked.test.js"), "");
    assert.throws(
      () => assertWorkerRuntime(inspectWorkerRuntime(root)),
      /projectTests/,
    );
  }));
test("rejects environment and private key files", () => {
  for (const f of [".env", ".env.production", "receipt.pem"])
    fixture((root) => {
      writeFileSync(join(root, f), "synthetic");
      assert.throws(
        () => assertWorkerRuntime(inspectWorkerRuntime(root)),
        /secretFiles/,
      );
    });
});
test("rejects complete embedded private keys, permits documented placeholders", () =>
  fixture((root) => {
    const p = join(root, "dist", "key.js");
    const header = ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
      end = ["-----END", "PRIVATE KEY-----"].join(" ");
    writeFileSync(p, header + "\n" + "synthetic-material" + "\n" + end);
    assert.throws(
      () => assertWorkerRuntime(inspectWorkerRuntime(root)),
      /secretPatterns/,
    );
    writeFileSync(p, header + "\n...\n" + end);
    assertWorkerRuntime(inspectWorkerRuntime(root));
  }));
test("nested runtime paths are not classified by a package name containing test", () => {
  assert.equal(
    runtimeFileKind("node_modules/@playwright/test/index.js"),
    "dependency-fixture",
  );
  assert.equal(runtimeFileKind("node_modules/contest/index.js"), "runtime");
});
