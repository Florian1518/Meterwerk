import { test, expect } from "@playwright/test";

test("RC PWA manifest, service worker, offline, reconnect and navigation", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill("verwaltung@nordstern.demo");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sicher anmelden" }).click();
  await expect(page).toHaveURL(/dashboard/);
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).name).toContain("Meterwerk");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  expect(
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).some((r) =>
        r.active?.scriptURL.endsWith("/sw.js"),
      ),
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(page.locator(".offline-banner")).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator(".offline-banner")).toHaveCount(0);
  await expect(page.locator("h1")).toContainText("Dashboard");
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("link", { name: "Zähler", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText("Zähler");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
