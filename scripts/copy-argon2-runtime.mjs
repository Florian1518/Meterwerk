import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

export function copyArgon2Runtime(destinationPath = ".next/standalone") {
  const destinationRoot = resolve(destinationPath);
  const metadataPath = resolve("node_modules/@node-rs/argon2/package.json");
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const musl =
    process.platform === "linux" &&
    !process.report.getReport().header.glibcVersionRuntime;
  const platformPackage =
    process.platform === "win32" && process.arch === "x64"
      ? "@node-rs/argon2-win32-x64-msvc"
      : process.platform === "win32" && process.arch === "arm64"
        ? "@node-rs/argon2-win32-arm64-msvc"
        : process.platform === "darwin" && process.arch === "x64"
          ? "@node-rs/argon2-darwin-x64"
          : process.platform === "darwin" && process.arch === "arm64"
            ? "@node-rs/argon2-darwin-arm64"
            : process.platform === "linux" && process.arch === "x64"
              ? `@node-rs/argon2-linux-x64-${musl ? "musl" : "gnu"}`
              : process.platform === "linux" && process.arch === "arm64"
                ? `@node-rs/argon2-linux-arm64-${musl ? "musl" : "gnu"}`
                : null;
  assert(
    platformPackage,
    `Unsupported Argon2 platform ${process.platform}/${process.arch}`,
  );
  const version = metadata.optionalDependencies?.[platformPackage];
  assert(version, `Argon2 package does not lock ${platformPackage}`);
  const storePath = resolve(
    "node_modules/.pnpm",
    `${platformPackage.replaceAll("/", "+")}@${version}`,
    "node_modules",
    platformPackage,
  );
  assert(
    statSync(storePath, { throwIfNoEntry: false })?.isDirectory(),
    `Missing locked native binding ${platformPackage}`,
  );
  const source = realpathSync(storePath);
  const nativeFiles = [];
  function collect(directory) {
    for (const entry of readdirSync(directory)) {
      const path = resolve(directory, entry);
      if (statSync(path).isDirectory()) collect(path);
      else if (path.endsWith(".node")) nativeFiles.push(path);
    }
  }
  collect(source);
  assert(
    nativeFiles.length > 0,
    `No native Argon2 binding in ${platformPackage}`,
  );
  const destination = resolve(
    destinationRoot,
    "node_modules",
    ...platformPackage.split("/"),
  );
  mkdirSync(resolve(destination, ".."), { recursive: true });
  cpSync(source, destination, { recursive: true, dereference: true });
  console.log(
    `Included ${platformPackage}@${version} (${nativeFiles.length} native binding file(s))`,
  );
  return { platformPackage, version, nativeFiles: nativeFiles.length };
}
