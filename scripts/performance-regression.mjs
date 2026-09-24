import { readFile } from "node:fs/promises";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/performance-regression.mjs <result.json>");
  process.exit(2);
}

const report = JSON.parse(await readFile(input, "utf8"));
const budgets = {
  dashboard: 1000,
  readings: 1000,
  analytics: 2000,
  publicApi: 500,
  fleet: 1000,
  queueClaim: 500,
  worker: 2000,
};
const failures = [];
for (const [name, budget] of Object.entries(budgets)) {
  const sample = report[name];
  if (!sample) {
    failures.push(`${name}: missing measurement`);
    continue;
  }
  if (typeof sample.p95Ms !== "number") failures.push(`${name}: missing p95Ms`);
  else if (sample.p95Ms > budget)
    failures.push(`${name}: p95 ${sample.p95Ms}ms > budget ${budget}ms`);
  if (typeof sample.errorRate !== "number")
    failures.push(`${name}: missing errorRate`);
  else if (sample.errorRate > 0.01)
    failures.push(`${name}: error rate ${sample.errorRate} > 0.01`);
}
if (failures.length) {
  console.error("Performance regression gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Performance regression gate passed", {
  measuredAt: report.measuredAt ?? null,
  environment: report.environment ?? null,
});
