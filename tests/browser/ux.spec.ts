import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("Login, Navigation, Suche, Portfolio, Zähler, Gateway, Berichte, Alarme und Anzeige", async ({
  page,
}) => {
  test.skip(
    process.env.SEED_DEMO !== "true" || !process.env.DEMO_PASSWORD,
    "Lokale Demo-Zugangsdaten erforderlich.",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await accessible(page);
  await page.getByLabel("E-Mail-Adresse").fill("verwaltung@nordstern.demo");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sicher anmelden" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", {
      name: "Dashboard",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+Home");
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await accessible(page);
  await page.getByLabel("Zeitraum", { exact: true }).selectOption("7");
  await expect(page).toHaveURL(/days=7/);
  await expect(
    page.getByRole("img", { name: /Verbrauchsverlauf über 7 Tage/ }),
  ).toBeVisible();
  await page.getByLabel("Medium", { exact: true }).selectOption("WATER");
  await expect(page).toHaveURL(/type=WATER/);
  await page.reload();
  await expect(page.getByLabel("Zeitraum", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("Medium", { exact: true })).toHaveValue("WATER");
  const search = page.getByLabel("Global suchen");
  await search.fill("Campus");
  await expect(
    page.getByRole("navigation", { name: "Suchergebnisse" }),
  ).toBeVisible();
  await search.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Suchergebnisse" }),
  ).toBeHidden();
  await page.route("**/api/search?*", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await search.fill("Fehlertest");
  await expect(page.getByText(/Suche nicht verfügbar/)).toBeVisible();
  await page.unroute("**/api/search?*");
  await page.getByRole("button", { name: "Suche löschen" }).click();
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await nav.getByRole("link", { name: "Portfolio", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Portfolio",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await accessible(page);
  await nav.getByRole("link", { name: "Zähler", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Zähler", exact: true, level: 1 }),
  ).toBeVisible();
  await accessible(page);
  await page.getByLabel("Einträge durchsuchen").fill("kein-treffer-ux-test");
  await expect(page.getByText("Keine Einträge gefunden")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Einträge durchsuchen")).toHaveValue(
    "kein-treffer-ux-test",
  );
  await page.getByLabel("Einträge durchsuchen").fill("");
  const edit = page.getByRole("button", { name: /bearbeiten$/ }).first();
  await edit.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(edit).toBeFocused();
  await page.getByRole("columnheader").first().getByRole("button").click();
  await expect(page.getByRole("columnheader").first()).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await page.locator("tbody a").first().click();
  await expect(
    page.getByRole("button", { name: "Zähler als Favorit merken" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Zähler als Favorit merken" }).click();
  await expect(
    page.getByRole("button", { name: "Zähler als Favorit merken" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Zähler als Favorit merken" }),
  ).toHaveAttribute("aria-pressed", "true");
  await accessible(page);
  await page.getByLabel("Anzeigezeitzone", { exact: true }).selectOption("UTC");
  await expect(
    page.getByRole("columnheader", { name: "Zeitpunkt (UTC)" }),
  ).toBeVisible();
  await page.getByLabel("Darstellung", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await accessible(page);
  await page.reload();
  await expect(page.getByLabel("Darstellung", { exact: true })).toHaveValue(
    "dark",
  );
  await page.getByLabel("Darstellung", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(16, 27, 24)",
  );
  await page.getByLabel("Darstellung", { exact: true }).selectOption("light");
  await nav.getByRole("link", { name: "Systemstatus", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Systemstatus",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Gateways", exact: true }),
  ).toBeVisible();
  await accessible(page);
  await nav.getByRole("link", { name: "Berichte", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Berichte", exact: true, level: 1 }),
  ).toBeVisible();
  await accessible(page);
  await nav.getByRole("link", { name: "Alarme", exact: true }).click();
  await page.getByLabel("Alarmstatus", { exact: true }).selectOption("Offen");
  await expect(page).toHaveURL(/status=Offen/);
  await page.reload();
  await expect(page.getByLabel("Alarmstatus", { exact: true })).toHaveValue(
    "Offen",
  );
  await accessible(page);
  await page.goto("/does-not-exist");
  await expect(
    page.getByRole("heading", {
      name: /gefunden|verfügbar/,
      level: 1,
    }),
  ).toBeVisible();
  await accessible(page);
  await page.goto("/service-unavailable");
  await accessible(page);
  expect(errors).toEqual([]);
});

for (const theme of ["light", "dark"]) {
  test(`@visual Login und Fehlerseite ${theme}`, async ({ page, context }) => {
    await context.addCookies([
      {
        name: "meterwerk_theme",
        value: theme,
        url: test.info().project.use.baseURL!,
      },
    ]);
    await page.goto("/login");
    await expect(page.locator("main")).toHaveScreenshot(`login-${theme}.png`);
    await accessible(page);
    await page.goto("/service-unavailable");
    await expect(page.locator("main")).toHaveScreenshot(
      `unavailable-${theme}.png`,
    );
    await accessible(page);
  });
}
