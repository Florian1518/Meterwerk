import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
const baseURL =
  process.env.BROWSER_E2E_BASE_URL ??
  process.env.APP_URL ??
  "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("E2E ausschließlich auf localhost ausführen.");
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "test-results/browser-artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: "disabled" },
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/browser-report" }],
  ],
  use: {
    actionTimeout: 15_000,
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "mobile-landscape",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 915, height: 412 },
        isMobile: true,
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
