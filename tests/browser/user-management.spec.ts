import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

test("selected customer user CRUD, password retention and server-side request tampering", async ({
  page,
}, testInfo: TestInfo) => {
  test.skip(
    process.env.USER_MANAGEMENT_RELEASE_GATE !== "true",
    "Requires the isolated release-gate runner.",
  );
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  expect(databaseUrl.protocol).toBe("postgresql:");
  expect(databaseUrl.username).toBe("release_test");
  expect(databaseUrl.password).toBe("");
  expect(databaseUrl.hostname).toBe("127.0.0.1");
  expect(Number(databaseUrl.port)).toBeGreaterThan(0);
  expect(databaseUrl.pathname).toBe("/release_test");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: [],
  });
  const password = process.env.USER_MANAGEMENT_BROWSER_PASSWORD!;
  const projectSuffix = testInfo.project.name.replace(/[^a-z0-9-]/gi, "-");
  const tenantId = process.env.USER_MANAGEMENT_BROWSER_TENANT_ID!;
  const foreignTenantId =
    process.env.USER_MANAGEMENT_BROWSER_FOREIGN_TENANT_ID!;
  const adminEmail = process.env.USER_MANAGEMENT_BROWSER_ADMIN_EMAIL!;
  const email = `browser-admin-${projectSuffix}@example.invalid`;
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
  async function apiRequest(path: string, method: string, body?: unknown) {
    return page.evaluate(
      async ({ path, method, body }) => {
        const response = await fetch(path, {
          method,
          credentials: "same-origin",
          headers:
            body === undefined
              ? undefined
              : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, text: await response.text() };
      },
      { path, method, body },
    );
  }
  try {
    await login(page, adminEmail);
    await page.goto("/tenants");
    const customer = page.getByRole("row").filter({
      has: page.locator(`a[href="/dashboard?tenantId=${tenantId}"]`),
    });
    await customer.getByRole("link", { name: "Benutzer verwalten" }).click();
    await expect(page).toHaveURL(new RegExp(`/users\\?tenantId=${tenantId}`));
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
    const auditBeforeFormEscalation = await db.auditEvent.count({
      where: { tenantId, action: "users.create" },
    });
    // Manipulate the actual Server Action FormData; bypass the UI role allowlist.
    await create.getByLabel("Rolle").evaluate((select: HTMLSelectElement) => {
      select.add(new Option("Injected", "SUPER_ADMIN"));
      select.value = "SUPER_ADMIN";
    });
    await create.getByRole("button", { name: "Speichern" }).click();
    await expect(create.getByRole("alert")).toContainText("role");
    expect(await db.user.count({ where: { email } })).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { tenantId, action: "users.create" },
      }),
    ).toBe(auditBeforeFormEscalation);
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
    expect(after.tenantId).toBe(tenantId);
    expect(after.role).toBe("TENANT_ADMIN");
    const authenticatedList = await apiRequest(
      `/api/users?tenantId=${tenantId}`,
      "GET",
    );
    expect(authenticatedList.status).toBe(200);
    const usersBeforeEscalation = await db.user.count({
      where: { tenantId },
    });
    const auditBeforeEscalation = await db.auditEvent.count({
      where: {
        tenantId,
        action: { in: ["users.create", "users.update"] },
      },
    });
    const elevated = await apiRequest(
      `/api/users?tenantId=${tenantId}`,
      "POST",
      payload,
    );
    expect(elevated.status).toBe(400);
    expect(await db.user.count({ where: { tenantId } })).toBe(
      usersBeforeEscalation,
    );
    expect(
      await db.auditEvent.count({
        where: {
          tenantId,
          action: { in: ["users.create", "users.update"] },
        },
      }),
    ).toBe(auditBeforeEscalation);
    const updateAttempt = await apiRequest(
      `/api/users/${after.id}?tenantId=${tenantId}`,
      "PATCH",
      { ...payload, role: "SUPER_ADMIN", password: "" },
    );
    expect(updateAttempt.status).toBe(400);
    expect(
      await db.user.findUniqueOrThrow({
        where: { id: after.id },
        select: { role: true },
      }),
    ).toEqual({ role: "TENANT_ADMIN" });
    expect(
      await db.auditEvent.count({
        where: {
          tenantId,
          action: { in: ["users.create", "users.update"] },
        },
      }),
    ).toBe(auditBeforeEscalation);
    const noTenant = await apiRequest("/api/users", "POST", {
      ...payload,
      role: "USER",
    });
    expect(noTenant.status).toBe(400);
    const listed = await apiRequest(`/api/users?tenantId=${tenantId}`, "GET");
    const body = listed.text;
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
      .evaluate((input: HTMLInputElement, id: string) => {
        input.value = id;
      }, foreignTenantId);
    await ownCreate.getByRole("button", { name: "Speichern" }).click();
    await expect(ownCreate.getByRole("alert")).toContainText(
      "Kein Zugriff auf diesen Mandanten",
    );
    expect(
      await db.user.count({
        where: { email: "foreign-attempt@example.invalid" },
      }),
    ).toBe(0);
    const foreign = await apiRequest(
      `/api/users/${after.id}?tenantId=${foreignTenantId}`,
      "PATCH",
      { ...payload, role: "USER", tenantId: "demo-tenant-1" },
    );
    expect(foreign.status).toBe(403);
    await page.goto(`/users?tenantId=${foreignTenantId}`);
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
