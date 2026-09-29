import { test, expect } from "@playwright/test";

test("RC Demo-Steuerung: Mandant, alle Szenarien, Produktseite, Refresh und Reset", async ({
  page,
}) => {
  expect(process.env.METERWERK_ENV).toBe("test");
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill("admin@meterwerk.demo");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sicher anmelden" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/platform-admin/demo");
  await expect(
    page.getByRole("heading", { name: "Demo-Steuerung" }),
  ).toBeVisible();
  const tenantId = "demo-tenant-0";
  const scenarios = [
    "NORMAL",
    "HIGH_ELECTRICITY",
    "WATER_LEAK",
    "METER_OFFLINE",
    "GATEWAY_OFFLINE",
    "MISSING_DATA",
    "OPEN_ALARM",
    "ACKNOWLEDGED_ALARM",
    "CRITICAL_ANOMALY",
    "MAINTENANCE",
    "METER_REPLACEMENT",
    "SUPPORT_CASE",
    "FIRMWARE_ROLLOUT",
  ];
  async function clickAction(name: string, status = 200) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/demo") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name, exact: true }).click();
    expect((await response).status()).toBe(status);
  }
  await clickAction("Aktivieren", 400);
  await expect(page.getByRole("status")).toContainText("Aktion fehlgeschlagen");
  await page.getByLabel("Demo-Mandant", { exact: true }).selectOption(tenantId);
  try {
    for (const scenario of scenarios) {
      await page.getByLabel("Szenario", { exact: true }).selectOption(scenario);
      await clickAction("Aktivieren");
      await expect(page.getByRole("status")).toHaveText("Gespeichert");
      // Read through the same browser context as the authenticated UI action.
      const state = await page.evaluate(async (selectedTenant) => {
        const response = await fetch(
          `/api/platform/demo?tenantId=${selectedTenant}`,
        );
        return { status: response.status, body: await response.json() };
      }, tenantId);
      expect(state.status).toBe(200);
      expect(state.body).toMatchObject({ tenantId, scenario });
    }
    await clickAction("Demo-Daten aktualisieren");
    await expect(page.getByLabel("Szenario", { exact: true })).toHaveValue(
      "FIRMWARE_ROLLOUT",
    );
    await page
      .getByLabel("Szenario", { exact: true })
      .selectOption("METER_OFFLINE");
    await clickAction("Aktivieren");
    await page.goto(
      `/meters/scenario-${tenantId}-electricity?tenantId=${tenantId}`,
    );
    await expect(
      page.getByRole("heading", {
        name: `scenario-${tenantId}-electricity`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .locator(".meter-details")
        .filter({ has: page.locator("dt", { hasText: /^Status$/ }) }),
    ).toContainText("OFFLINE");
  } finally {
    await page.goto("/platform-admin/demo");
    await page
      .getByLabel("Demo-Mandant", { exact: true })
      .selectOption(tenantId);
    await clickAction("NORMAL zurücksetzen");
    await expect(page.getByLabel("Szenario", { exact: true })).toHaveValue(
      "NORMAL",
    );
  }
  await page.goto(
    `/meters/scenario-${tenantId}-electricity?tenantId=${tenantId}`,
  );
  await expect(
    page
      .locator(".meter-details")
      .filter({ has: page.locator("dt", { hasText: /^Status$/ }) }),
  ).toContainText("ACTIVE");
});
