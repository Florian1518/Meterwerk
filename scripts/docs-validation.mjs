import { access, readFile, readdir } from "node:fs/promises";
const required = [
  "docs/user/USER-GUIDE.md",
  "docs/admin/TENANT-ADMIN-GUIDE.md",
  "docs/admin/SUPER-ADMIN-GUIDE.md",
  "docs/technician/TECHNICIAN-GUIDE.md",
  "docs/COMMISSIONING.md",
  "docs/METER-REPLACEMENT.md",
  "docs/onboarding/CUSTOMER-ONBOARDING.md",
  "docs/onboarding/PILOT-ONBOARDING.md",
  "docs/onboarding/TENANT-OFFBOARDING.md",
  "docs/support/SUPPORT-GUIDE.md",
  "docs/support/INCIDENT-MANAGEMENT.md",
  "docs/OPERATIONS-PROCEDURES.md",
  "docs/GLOSSARY.md",
];
for (const file of required) await access(file);
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
for (const script of [
  "db:generate",
  "db:migrate",
  "db:seed",
  "demo:seed",
  "demo:verify",
  "demo:reset",
  "demo:verify-all",
  "docs:check",
])
  if (!packageJson.scripts[script])
    throw new Error(`Missing documented script: ${script}`);
async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? markdownFiles(`${directory}/${entry.name}`)
          : entry.name.endsWith(".md")
            ? [`${directory}/${entry.name}`]
            : [],
      ),
    )
  ).flat();
}
const allDocs = [...(await markdownFiles("docs")), "README.md"];
const scriptRefs = new Set();
const coreScripts = new Set([
  "dev",
  "build",
  "start",
  "lint",
  "test",
  "format",
]);
for (const file of allDocs) {
  const body = await readFile(file, "utf8");
  const formattedCommands = [
    ...[...body.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
    ...[...body.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]),
  ];
  for (const command of formattedCommands) {
    for (const match of command.matchAll(/\bpnpm\s+(?:run\s+)?([\w:-]+)/g)) {
      if (
        (match[1].includes(":") || coreScripts.has(match[1])) &&
        ![
          "exec",
          "install",
          "add",
          "remove",
          "update",
          "dlx",
          "audit",
        ].includes(match[1]) &&
        !/^\d/.test(match[1])
      )
        scriptRefs.add(match[1]);
    }
  }
}
for (const name of scriptRefs)
  if (!packageJson.scripts[name])
    throw new Error(`Documented pnpm script does not exist: ${name}`);
const corpus = await Promise.all(
  required.map((file) => readFile(file, "utf8")),
);
const text = corpus.join("\n");
for (const term of [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "MANAGER",
  "USER",
  "TECHNICIAN",
  "DEMO",
  "STAGING",
  "PRODUCTION",
  "MODBUS",
  "MQTT",
  "Webhook",
])
  if (!text.toUpperCase().includes(term.toUpperCase()))
    throw new Error(`Documentation term missing: ${term}`);
console.log(
  `Documentation validation passed (${required.length} required guides)`,
);
