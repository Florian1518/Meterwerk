import { test, expect, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

test("selected customer user CRUD, password retention and server-side request tampering", async ({
  page,
}) => {
  test.skip(
    process.env.USER_MANAGEMENT_RELEASE_GATE !== "true",
    "Requires the isolated release-gate runner.",
  );
  expect(process.env.DATABASE_URL).toBe(
    "postgresql://release_test@127.0.0.1:55451/release_test",
  );
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: [],
  });
  const password = process.env.DEMO_PASSWORD!;
  const email = "browser-admin@example.invalid";
  async function login(target: Page, address: string) {
    await target.goto("/login");
    await target.getByLabel("E-Mail-Adresse").fill(address);
    await target.getByLabel("Passwort", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Sicher anmelden" }).click();
    await expect(target).not.toHaveURL(/\/login/);
  }
  const payload = {
    name: "Tampered",
    email: "tampered@example.invalid",
    role: "SUPER_ADMIN",
    password,
  };
  const headers = { origin: process.env.APP_URL! };
  try {
    await login(page, "admin@meterwerk.demo");
    await page.goto("/tenants");
    const customer = page.getByRole("row").filter({
      has: page.locator('a[href="/dashboard?tenantId=demo-tenant-0"]'),
    });
    await customer.getByRole("link", { name: "Benutzer verwalten" }).click();
    await expect(page).toHaveURL(/\/users\?tenantId=demo-tenant-0/);
    await page.getByText("＋ Benutzer anlegen", { exact: true }).click();
    const create = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Benutzer anlegen" }) })
      .first();
    await create.getByLabel("Name", { exact: false }).fill("Browser Admin");
    await create.getByLabel("E-Mail", { exact: false }).fill(email);
    await create
      .getByLabel("Initiales Passwort", { exact: false })
      .fill(password);
    await expect(create.getByLabel("Zugang")).toHaveValue("true");
    await expect(create.getByLabel("Rolle").locator("option")).toHaveCount(4);
    await expect(
      create.getByLabel("Rolle").locator('option[value="SUPER_ADMIN"]'),
    ).toHaveCount(0);
    // Manipulate the actual Server Action FormData; bypass the UI role allowlist.
    await create.getByLabel("Rolle").evaluate((select: HTMLSelectElement) => {
      select.add(new Option("Injected", "SUPER_ADMIN"));
      select.value = "SUPER_ADMIN";
    });
    await create.getByRole("button", { name: "Speichern" }).click();
    await expect(create.getByRole("alert")).toContainText("role");
    expect(await db.user.count({ where: { email } })).toBe(0);
    // React resets uncontrolled fields after an action; refill with a valid role.
    await create.getByLabel("Name", { exact: false }).fill("Browser Admin");
    await create.getByLabel("E-Mail", { exact: false }).fill(email);
    await create
      .getByLabel("Initiales Passwort", { exact: false })
      .fill(password);
    await create.getByLabel("Rolle").selectOption("TENANT_ADMIN");
    await create.getByRole("button", { name: "Speichern" }).click();
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    const before = await db.user.findUniqueOrThrow({ where: { email } });
    await row.getByRole("button", { name: "Browser Admin bearbeiten" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Browser Admin bearbeiten",
    });
    await dialog
      .getByLabel("Name", { exact: false })
      .fill("Browser Admin Updated");
    await expect(
      dialog.getByLabel("Neues Passwort", { exact: false }),
    ).toHaveValue("");
    await expect(
      dialog.getByLabel("Rolle").locator('option[value="SUPER_ADMIN"]'),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(row).toContainText("Browser Admin Updated");
    const after = await db.user.findUniqueOrThrow({ where: { email } });
    expect(after.passwordHash === before.passwordHash).toBe(true);
    expect(after.tenantId).toBe("demo-tenant-0");
    expect(after.role).toBe("TENANT_ADMIN");
    const elevated = await page.request.post(
      "/api/users?tenantId=demo-tenant-0",
      { data: payload, headers },
    );
    expect(elevated.status()).toBe(400);
    const noTenant = await page.request.post("/api/users", {
      data: { ...payload, role: "USER" },
      headers,
    });
    expect(noTenant.status()).toBe(400);
    const listed = await page.request.get("/api/users?tenantId=demo-tenant-0");
    const body = await listed.text();
    expect(body.includes(password)).toBe(false);
    expect(body.includes("passwordHash")).toBe(false);
    expect((await page.locator("body").innerText()).includes(password)).toBe(
      false,
    );
    await page.context().clearCookies();
    await login(page, email);
    await page.goto("/users");
    await expect(
      page.getByRole("heading", { name: "Benutzer", exact: true }),
    ).toBeVisible();
    // Tenant admin cannot select a foreign scope in FormData.
    await page.getByText("＋ Benutzer anlegen", { exact: true }).click();
    const ownCreate = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Benutzer anlegen" }) })
      .first();
    await ownCreate
      .getByLabel("Name", { exact: false })
      .fill("Foreign attempt");
    await ownCreate
      .getByLabel("E-Mail", { exact: false })
      .fill("foreign-attempt@example.invalid");
    await ownCreate
      .getByLabel("Initiales Passwort", { exact: false })
      .fill(password);
    await ownCreate.getByLabel("Rolle").selectOption("USER");
    await ownCreate
      .locator('input[name="tenantId"]')
      .evaluate((input: HTMLInputElement) => {
        input.value = "demo-tenant-1";
      });
    await ownCreate.getByRole("button", { name: "Speichern" }).click();
    await expect(ownCreate.getByRole("alert")).toContainText(
      "Kein Zugriff auf diesen Mandanten",
    );
    expect(
      await db.user.count({
        where: { email: "foreign-attempt@example.invalid" },
      }),
    ).toBe(0);
    const foreign = await page.request.patch(
      `/api/users/${after.id}?tenantId=demo-tenant-1`,
      {
        data: { ...payload, role: "USER", tenantId: "demo-tenant-1" },
        headers,
      },
    );
    expect(foreign.status()).toBe(403);
    await page.goto("/users?tenantId=demo-tenant-1");
    // Next.js streamed notFound responses retain HTTP 200; assert denial UI and no data.
    await expect(
      page.getByRole("heading", { name: "Seite nicht gefunden" }),
    ).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
    await expect(
      page.getByText("＋ Benutzer anlegen", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});
