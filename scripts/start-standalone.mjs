import { readFile, lstat, mkdir, symlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const contained = (path) => {
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Runtime link must stay inside the extracted artifact");
  return path;
};
const links = JSON.parse(
  await readFile(resolve(root, "runtime-links.json"), "utf8"),
);
for (const link of links) {
  const destination = contained(resolve(root, link.path));
  const target = contained(resolve(dirname(destination), link.target));
  const existing = await lstat(destination).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    if (
      !existing.isSymbolicLink() ||
      (await realpath(destination)) !== (await realpath(target))
    )
      throw new Error("Unexpected existing runtime link");
    continue;
  }
  await mkdir(dirname(destination), { recursive: true });
  await symlink(
    process.platform === "win32" ? target : link.target,
    destination,
    process.platform === "win32" ? "junction" : "dir",
  );
}
await import("./server.js");
