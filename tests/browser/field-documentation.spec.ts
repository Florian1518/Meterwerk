import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const requireTool = createRequire(
  createRequire(import.meta.url).resolve("tsx/package.json"),
);
const bundler = requireTool("esbuild") as {
  build(
    options: Record<string, unknown>,
  ): Promise<{ outputFiles: { text: string }[] }>;
};
let script: string;
test.beforeAll(async () => {
  const result = await bundler.build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {FieldDocumentation} from './src/components/field-documentation'; import {ChecklistEditor} from './src/components/field-service-controls'; createRoot(document.getElementById('root')).render(<><FieldDocumentation id="order" tenantId="a" actorId="tech" revision={0} type="METER_REPLACEMENT" editable={true} documentation={null} commissioning={null} entries={[]} technicians={[{id:'tech',name:'Techniker'}]} attachments={[{id:'old-photo',fileName:'alt.png',category:'BEFORE',sizeBytes:10,description:''},{id:'new-photo',fileName:'neu.png',category:'AFTER',sizeBytes:10,description:''}]} templates={[]} /><ChecklistEditor tenantId="a" id="templates" template /></>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "next/navigation": resolve("tests/browser/field-router-fixture.ts"),
    },
  });
  script = result.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.route("**/field-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html lang="de"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{font-family:sans-serif;margin:16px}label{display:block}input,textarea,select,canvas{max-width:100%}textarea{width:100%}canvas{width:100%;touch-action:none}button{min-height:44px}details{margin:16px 0}fieldset{min-width:0}</style></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto("/field-fixture");
  await page.addScriptTag({ content: script });
});
test("mobile Dokumentation bleibt offline erhalten und wird nach Reconnect gespeichert", async ({
  page,
  context,
}) => {
  let writes = 0;
  await page.route("**/api/work-orders/order/documentation?*", (route) => {
    writes++;
    return route.fulfill({ json: { revision: 1 } });
  });
  await page.getByText("Arbeitsbericht bearbeiten", { exact: true }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Arbeitsbericht", { exact: true }) });
  await form
    .getByLabel("Arbeitsbericht", { exact: true })
    .fill("Wartung mobil dokumentiert");
  await form
    .getByLabel("Ausgeführte Arbeiten", { exact: true })
    .fill("Dichtung getauscht");
  await form.getByLabel("Tatsächlicher Beginn (UTC)").fill("2026-01-01T08:00");
  await form.getByLabel("Tatsächliches Ende (UTC)").fill("2026-01-01T10:00");
  await context.setOffline(true);
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Übertragung offen");
  await expect(form.getByLabel("Arbeitsbericht", { exact: true })).toHaveValue(
    "Wartung mobil dokumentiert",
  );
  expect(writes).toBe(0);
  await context.setOffline(false);
  await form
    .getByRole("button", { name: "Ausstehende Übertragung wiederholen" })
    .click();
  await expect(page.getByRole("status")).toContainText("Gespeichert.");
  expect(writes).toBe(1);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("verlorene Antwort wiederholt exakt dieselbe Materialmutation", async ({
  page,
}) => {
  const bodies: string[] = [];
  await page.route("**/api/work-orders/order/documentation?*", (route) => {
    bodies.push(route.request().postData()!);
    return bodies.length === 1
      ? route.abort("failed")
      : route.fulfill({ json: { revision: 1, replayed: true } });
  });
  await page.getByText("Material erfassen", { exact: true }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Menge", { exact: true }) });
  await form.getByLabel("Bezeichnung", { exact: true }).fill("Dichtung");
  await form.getByLabel("Menge", { exact: true }).fill("0.125");
  await form.getByLabel("Einheit", { exact: true }).fill("Stück");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Übertragung offen");
  await form
    .getByRole("button", { name: "Ausstehende Übertragung wiederholen" })
    .click();
  await expect(page.getByRole("status")).toContainText("Gespeichert.");
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
});

test("Vorlagenformular sendet Typ, Medium und Signaturpflicht an Vorlagen-API", async ({
  page,
}) => {
  let body: Record<string, unknown> | undefined;
  await page.route("**/api/work-orders/templates?*", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ json: { id: "template" } });
  });
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Checklistenname", { exact: true }) });
  await form
    .getByLabel("Checklistenname", { exact: true })
    .fill("Wartungsvorlage");
  await form
    .getByRole("combobox", { name: "Einsatztyp", exact: true })
    .selectOption("MAINTENANCE");
  await form
    .getByRole("combobox", { name: "Medium", exact: true })
    .selectOption("WATER");
  await form.getByLabel("Kundenbestätigung erforderlich").check();
  await form.getByLabel("Punkt 1", { exact: true }).fill("Sichtprüfung");
  await form.getByRole("button", { name: "Vorlage speichern" }).click();
  await expect(form.getByRole("status")).toContainText("Gespeichert.");
  expect(body).toMatchObject({
    type: "MAINTENANCE",
    medium: "WATER",
    requireCustomerSignature: true,
    items: [{ title: "Sichtprüfung" }],
  });
});

test("Zählerwechsel-Neuerfassung sendet vorhandenes Modell mit Fotos und UTC-Zeiten", async ({
  page,
}) => {
  let body: Record<string, unknown> | undefined;
  await page.route("**/api/work-orders/order/documentation?*", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ json: { revision: 1 } });
  });
  await page.getByText("Zählerwechsel dokumentieren", { exact: true }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Alter Zähler (ID)", { exact: true }) });
  await form.getByLabel("Alter Zähler (ID)", { exact: true }).fill("old");
  await form.getByLabel("Neuer Zähler (ID)", { exact: true }).fill("new");
  await form
    .getByLabel("Ausbauzählerstand", { exact: true })
    .fill("123.123456");
  await form.getByLabel("Einbauzählerstand", { exact: true }).fill("0.000001");
  await form.getByLabel("Ausbaudatum / Uhrzeit (UTC)").fill("2026-01-01T08:00");
  await form.getByLabel("Einbaudatum / Uhrzeit (UTC)").fill("2026-01-01T09:00");
  await form.getByLabel("Grund des Wechsels").fill("Defekt");
  await form
    .getByLabel("Kunde / Ansprechpartner", { exact: true })
    .fill("Kunde");
  await form.getByLabel("Foto alter Zähler").selectOption("old-photo");
  await form.getByLabel("Foto neuer Zähler").selectOption("new-photo");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Gespeichert.");
  expect(body).toMatchObject({
    mutation: {
      kind: "replacement",
      value: {
        oldPhotoId: "old-photo",
        newPhotoId: "new-photo",
        replacement: {
          oldMeterId: "old",
          newMeterId: "new",
          removedAt: "2026-01-01T08:00:00.000Z",
          removedRegister: "123.123456",
          installedRegister: "0.000001",
        },
      },
    },
  });
});
