// Next traces pnpm directory links into .next/standalone. Windows directory
// junctions preserve those links without requiring the symlink privilege.
// This preload is a no-op outside Windows and never changes dependency files.
if (process.platform === "win32") {
  const fs = require("node:fs");
  const path = require("node:path");
  const { syncBuiltinESMExports } = require("node:module");
  const output = path.resolve(".next/standalone");
  const contained = (value) => {
    const rel = path.relative(output, value);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  const original = fs.promises.symlink.bind(fs.promises);
  fs.promises.symlink = async (target, destination, type) => {
    const resolvedDestination = path.resolve(String(destination));
    const resolvedTarget = path.resolve(
      path.dirname(resolvedDestination),
      String(target),
    );
    if (contained(resolvedDestination) && contained(resolvedTarget)) {
      // Next copies traced packages concurrently; the output target may not
      // exist yet. Verify its corresponding source before creating the link.
      const sourceTarget = path.resolve(path.relative(output, resolvedTarget));
      const stat = await fs.promises
        .stat(resolvedTarget)
        .catch(() => fs.promises.stat(sourceTarget).catch(() => null));
      if (stat?.isDirectory())
        return original(resolvedTarget, resolvedDestination, "junction");
    }
    return original(target, destination, type);
  };
  syncBuiltinESMExports();
}
