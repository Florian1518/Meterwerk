import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const defaultConfig = {
  interface: "TCP",
  host: "127.0.0.1",
  port: 1502,
  unitId: 1,
  profileId: "simulator-three-phase-v1",
  pollingIntervalMs: 5000,
  timeoutMs: 1000,
};
const requireTool = createRequire(
  createRequire(import.meta.url).resolve("tsx/package.json"),
);
const bundler = requireTool("esbuild") as {
  build(
    options: Record<string, unknown>,
  ): Promise<{ outputFiles: { text: string }[] }>;
};
const pendingReason =
  "Aktion wurde noch nicht vom Gateway ausgeführt. Die Inbetriebnahme kann erst nach einer erfolgreichen technischen Bestätigung fortgesetzt werden.";
let script: string;
test.beforeAll(async () => {
  const result = await bundler.build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ModbusConsole} from './src/components/modbus-console'; createRoot(document.getElementById('root')).render(<ModbusConsole initial={window.fixture} diagnosis />);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env": JSON.stringify({ NODE_ENV: "production" }) },
  });
  script = result.outputFiles[0].text;
});
test("software fixture: pending, expired and verified states gate all nine-step actions", async ({
  page,
}) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  const now = new Date().toISOString();
  const fixture = {
    asOf: now,
    tenantId: "t",
    canManage: true,
    meter: { id: "m", serialNumber: "UI-SOFTWARE-ONLY", unitId: "u" },
    gateways: [{ id: "g", name: "Offline fixture", status: "OFFLINE" }],
    units: [{ id: "u", name: "Unit", building: { name: "Test" } }],
    devices: [
      {
        id: "d",
        status: "OFFLINE",
        gatewayId: "g",
        diagnostic: null,
        telemetry: [],
        commands: [
          { id: "test", action: "TEST", status: "PENDING", createdAt: now },
        ],
        modbusConfig: {
          configuration: defaultConfig,
          revision: 1,
          state: "COMMISSIONING",
          step: 6,
        },
        commissioning: {
          stage: "CONFIGURED",
          connectionVerified: false,
          readVerified: false,
          reviewed: false,
          assigned: false,
          pending: true,
          canReview: false,
          canAssign: false,
          canComplete: false,
          reason: pendingReason,
        },
      },
    ],
  };
  await page.route("**/commissioning-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html lang="de"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.route("**/api/meters/m/modbus?*", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/commissioning-fixture");
  await page.evaluate((value) => {
    (window as unknown as { fixture: unknown }).fixture = value;
  }, fixture);
  await page.addScriptTag({ content: script });
  const review = page.getByRole("button", { name: "7 · Messwerte geprüft" });
  const assign = page.getByRole("button", { name: "Zuordnung bestätigen" });
  const complete = page.getByRole("button", {
    name: "9 · Inbetriebnahme abschließen",
  });
  await expect(review).toBeDisabled();
  await expect(assign).toBeDisabled();
  await expect(complete).toBeDisabled();
  await expect(page.getByText(pendingReason, { exact: true })).toBeVisible();
  fixture.devices[0].commands[0].status = "EXPIRED";
  fixture.devices[0].commissioning.pending = false;
  await expect(page.getByText(/TEST: EXPIRED/)).toBeVisible();
  await expect(complete).toBeDisabled();
  Object.assign(fixture.devices[0].commissioning, {
    stage: "READ_VERIFIED",
    connectionVerified: true,
    readVerified: true,
    canReview: true,
    reason: "Messwerte bestätigen.",
  });
  await expect(review).toBeEnabled();
  await expect(assign).toBeDisabled();
  await expect(complete).toBeDisabled();
  Object.assign(fixture.devices[0].commissioning, {
    reviewed: true,
    canAssign: true,
  });
  await expect(assign).toBeEnabled();
  await expect(complete).toBeDisabled();
  Object.assign(fixture.devices[0].commissioning, {
    assigned: true,
    canComplete: true,
    stage: "ASSIGNMENT_CONFIRMED",
  });
  await expect(complete).toBeEnabled();
  await page.getByLabel("4 · Host").fill("changed.example.invalid");
  await expect(review).toBeDisabled();
  await expect(assign).toBeDisabled();
  await expect(complete).toBeDisabled();
  await expect(
    page.getByText(/Geänderte Konfiguration zuerst speichern/),
  ).toBeVisible();
});
