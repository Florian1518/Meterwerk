import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
const baseURL = process.argv[2];
assert.equal(process.env.METERWERK_ENV, "test");
assert(["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname));
assert(process.env.DEMO_PASSWORD, "Synthetic demo password required");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ baseURL });
  const diagnostics = [];
  page.on("pageerror", (error) => diagnostics.push(`pageerror:${error.name}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      diagnostics.push(`console:${message.type()}`);
  });
  page.on("response", (response) => {
    if (response.request().method() !== "GET")
      diagnostics.push(
        `response:${response.request().method()}:${new URL(response.url()).pathname}:${response.status()}`,
      );
  });
  for (const path of ["/api/health/live", "/api/health/ready"])
    assert.equal((await page.request.get(path)).status(), 200);
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill("verwaltung@nordstern.demo");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill(process.env.DEMO_PASSWORD);
  const navigation = page
    .waitForURL(/\/dashboard/, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  await page.getByRole("button", { name: "Sicher anmelden" }).click();
  const signedIn = await navigation;
  if (!signedIn) {
    const messages = await page
      .locator('[role="alert"], [role="status"]')
      .allTextContents();
    const heading = await page.locator("h1, h2").allTextContents();
    throw new Error(
      `Synthetic login failed; url=${new URL(page.url()).pathname}; headings=${heading.join(" | ")}; visible messages=${messages.join(" | ") || "none"}; diagnostics=${diagnostics.join(" | ") || "none"}`,
    );
  }
  assert((await page.locator("h1").textContent()).includes("Dashboard"));
  await mkdir(".local/acceptance", { recursive: true });
  await writeFile(
    ".local/acceptance/resume-artifact-login-results.json",
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        status: "PASSED",
        baseURL,
        checks: [
          "liveness",
          "readiness",
          "real demo login",
          "authenticated dashboard",
        ],
        scope:
          "Extracted standalone runtime outside workspace; local synthetic test database",
      },
      null,
      2,
    ),
  );
  console.log(
    "Standalone runtime: health, real demo login and authenticated dashboard passed",
  );
} finally {
  await browser.close();
}
