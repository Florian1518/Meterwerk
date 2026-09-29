import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const checks = [];
for (const [database, port] of [
  ["clean", 3106],
  ["upgrade", 3107],
]) {
  for (const path of ["/api/health/live", "/api/health/ready", "/login"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200, `${database}: ${path}`);
    if (path !== "/login") {
      const body = await response.json();
      assert(body, "health response");
    }
    checks.push({ database, path, status: "PASSED" });
  }
}
await writeFile(
  ".local/acceptance/database-health.json",
  JSON.stringify({ checks }, null, 2),
);
console.log(`${checks.length} database startup/health checks passed`);
