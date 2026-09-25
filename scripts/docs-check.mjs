import { readFile, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
const root = resolve("docs");
async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? markdownFiles(join(directory, entry.name))
          : entry.name.endsWith(".md")
            ? [join(directory, entry.name)]
            : [],
      ),
    )
  ).flat();
}
const files = [...(await markdownFiles(root)), resolve("README.md")];
const missing = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:)/i.test(target)) continue;
    const resolved = resolve(dirname(file), target);
    try {
      await readFile(resolved);
    } catch {
      missing.push(`${file.replace(`${resolve(".")}\\`, "")}: ${target}`);
    }
  }
}
if (missing.length) {
  console.error("Broken documentation links:\n" + missing.join("\n"));
  process.exit(1);
}
console.log(`Documentation link check passed (${files.length} Markdown files)`);
