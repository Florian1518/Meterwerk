import { randomUUID } from "node:crypto";
import { test, expect, type Locator } from "@playwright/test";

test("RC Field Service: echte HTTP-Zuweisung und mobiler Abschluss ohne API-Mocks", async ({
  page,
  context,
}) => {
  expect(process.env.METERWERK_ENV).toBe("test");
  const tenantId = "demo-tenant-0";
  const actualStart = new Date(Date.now() - 3 * 3600000)
    .toISOString()
    .slice(0, 16);
  const actualEnd = new Date(Date.now() - 3600000).toISOString().slice(0, 16);
  async function login(email: string) {
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("E-Mail-Adresse").fill(email);
    await page
      .getByLabel("Passwort", { exact: true })
      .fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sicher anmelden" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }
  async function api(
    path: string,
    body?: object,
    method = body ? "POST" : "GET",
    status = 200,
  ) {
    const result = await page.evaluate(
      async ({ path, body, method }) => {
        const response = await fetch(`/api/work-orders${path}`, {
          method,
          headers: { "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json() };
      },
      { path, body, method },
    );
    expect(result.status, `${method} ${path}`).toBe(status);
    return result.body;
  }
  await login("verwaltung@nordstern.demo");
  const template = await api("/templates", {
    title: `Synthetische RC-Abnahme ${randomUUID()}`,
    type: "MAINTENANCE",
    medium: "WATER",
    requireTechnicianSignature: true,
    items: [{ title: "Synthetische Sichtprüfung", required: true, order: 0 }],
  });
  const order = await api("", {
    title: `Synthetischer RC-Einsatz ${randomUUID()}`,
    type: "MAINTENANCE",
    propertyId: `${tenantId}-property-0`,
    templateId: template.id,
    scheduledAt: new Date().toISOString(),
  });
  const deniedOrder = await api("", {
    title: `RC ohne Freigabe ${randomUUID()}`,
    type: "MAINTENANCE",
    propertyId: `${tenantId}-property-1`,
  });
  await api(`/${order.id}/status`, { status: "PLANNED" });
  await api(`/${order.id}/assignments`, { userId: `${tenantId}-user-2` });
  await api(`/${order.id}/status`, { status: "ASSIGNED" });
  // Cross-tenant IDs, missing grants and role escalation use real sessions.
  await login("verwaltung@rheinblick.demo");
  await api(`/${order.id}`, undefined, "GET", 404);
  await login("user@nordstern.demo");
  await api(`/${deniedOrder.id}`, undefined, "GET", 404);
  await api(`/${order.id}?tenantId=demo-tenant-1`, undefined, "GET", 403);
  await api(
    "",
    {
      title: "Eskalation",
      type: "OTHER",
      propertyId: `${tenantId}-property-0`,
    },
    "POST",
    403,
  );
  await page.goto(`/work-orders/${order.id}`);
  await expect(
    page.getByRole("heading", { name: order.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Starten", exact: true }).click();
  await expect(page.locator(".field-service > header")).toContainText(
    "In Bearbeitung",
  );
  await api(`/${order.id}/status`, { status: "COMPLETED" }, "POST", 409);
  const detail = await api(`/${order.id}`);
  await api(
    `/${order.id}/checklist-items/${detail.checklists[0].items[0].id}`,
    { completed: true, comment: "Synthetisch geprüft" },
    "PATCH",
  );
  await page.reload();
  async function save(form: Locator) {
    const response = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/work-orders/${order.id}/documentation`) &&
        r.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Speichern", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("Gespeichert.");
    await page.reload();
  }
  await page.getByText("Arbeitsbericht bearbeiten", { exact: true }).click();
  const documentation = page
    .locator("form")
    .filter({ has: page.getByLabel("Arbeitsbericht", { exact: true }) });
  await documentation
    .getByLabel("Arbeitsbericht", { exact: true })
    .fill("Synthetische Wartung abgeschlossen");
  await documentation
    .getByLabel("Ausgeführte Arbeiten", { exact: true })
    .fill("Sichtprüfung ohne Hardware");
  await documentation
    .getByLabel("Tatsächlicher Beginn (UTC)")
    .fill(actualStart);
  await documentation.getByLabel("Tatsächliches Ende (UTC)").fill(actualEnd);
  await save(documentation);
  await page.getByText("Material erfassen", { exact: true }).click();
  const material = page
    .locator("form")
    .filter({ has: page.getByLabel("Menge", { exact: true }) });
  await material
    .getByLabel("Bezeichnung", { exact: true })
    .fill("Synthetische Dichtung");
  await material.getByLabel("Menge", { exact: true }).fill("0.125");
  await material.getByLabel("Einheit", { exact: true }).fill("Stück");
  await save(material);
  await page.getByText("Arbeitszeit erfassen", { exact: true }).click();
  const time = page
    .locator("form")
    .filter({ has: page.getByLabel("Tätigkeit", { exact: true }) });
  await time.getByLabel("Beginn (UTC)", { exact: true }).fill(actualStart);
  await time.getByLabel("Ende (UTC)", { exact: true }).fill(actualEnd);
  await time.getByLabel("Pause (Minuten)").fill("15");
  await time
    .getByLabel("Tätigkeit", { exact: true })
    .fill("Synthetische Wartung");
  await save(time);
  await expect(
    page.getByRole("heading", { name: /Arbeitszeiten/ }),
  ).toContainText("105");
  await page.getByText("Einsatz / Abnahme bestätigen", { exact: true }).click();
  const signature = page
    .locator("form")
    .filter({ has: page.getByLabel("Name der unterzeichnenden Person") });
  await signature
    .getByLabel("Name der unterzeichnenden Person")
    .fill("Synthetischer Techniker");
  await signature.locator('select[name="role"]').selectOption("TECHNICIAN");
  const canvas = signature.getByLabel("Unterschriftsfläche");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 15, bounds.y + 25);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 45, bounds.y + 45, { steps: 5 });
  await page.mouse.up();
  await signature.getByRole("checkbox").check();
  await save(signature);
  await expect(
    page.getByRole("img", { name: "Bestätigung von Synthetischer Techniker" }),
  ).toBeVisible();
  await api(`/${order.id}/status`, { status: "COMPLETED" });
  await page.reload();
  await expect(page.locator(".field-service > header")).toContainText(
    "Abgeschlossen",
  );
  const completed = await api(`/${order.id}`);
  expect(completed.status).toBe("COMPLETED");
  expect(
    completed.entries.map((entry: { kind: string }) => entry.kind),
  ).toEqual(expect.arrayContaining(["time", "material", "signature"]));
  expect(
    completed.history.map((event: { action: string }) => event.action),
  ).toContain("work-order.completed");
  await api(
    `/${order.id}/checklist-items/${detail.checklists[0].items[0].id}`,
    { completed: false },
    "PATCH",
    409,
  );
  // Preserve completed synthetic audit history; remove only this run's unused draft.
  await login("verwaltung@nordstern.demo");
  await api(`/${deniedOrder.id}`, undefined, "DELETE");
});
