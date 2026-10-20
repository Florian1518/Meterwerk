import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.GATEWAY_PROVISIONING_E2E === "true";
test.describe("Phase 1C-B Gateway-Provisioning im Browser", () => {
  test.skip(
    !enabled,
    "Requires the dedicated isolated browser-database runner.",
  );

  async function login(page: Page, email: string) {
    await page.goto("/login");
    await page.getByLabel("E-Mail-Adresse").fill(email);
    await page
      .getByLabel("Passwort", { exact: true })
      .fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: /Sicher anmelden/ }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }

  test("SUPER_ADMIN wählt tenantgebundene Property, legt Gateway an und öffnet Details", async ({
    page,
  }) => {
    await login(page, "admin@meterwerk.demo");
    await page.goto("/platform-admin/gateways");
    await expect(page.getByRole("heading", { name: /Gateways/ })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await page
      .locator("summary")
      .getByText("Gateway vorbereiten", { exact: true })
      .click();
    const form = page.locator("form.create-form").first();
    const propertiesResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/platform/gateways/properties?tenantId=") &&
        r.request().method() === "GET",
    );
    await form.getByLabel("Kunde").selectOption("gateway-browser-tenant");
    const propertyResponse = await propertiesResponse;
    expect(propertyResponse.status(), await propertyResponse.text()).toBe(200);
    const property = form.locator('select[name="propertyId"]');
    await expect(property.locator("option")).toHaveCount(3);
    expect(await property.locator("option").allTextContents()).toEqual([
      "Bitte auswählen",
      "E2E Liegenschaft Alpha",
      "E2E Liegenschaft Beta",
    ]);
    await property.selectOption("gateway-browser-property-a");
    const externalId = `browser-${randomUUID()}`;
    await form.getByLabel("Hersteller").fill("Synthetik AG");
    await form.getByLabel("Modell").fill("E2E Gateway");
    await form
      .getByLabel("Name", { exact: true })
      .fill("Gateway Browser-Abnahme");
    await form.getByLabel("Externe Gateway-ID").fill(externalId);
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/api/gateways?") && r.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Gateway vorbereiten" }).click();
    expect((await response).status()).toBe(201);
    await expect(page).toHaveURL(
      /\/platform-admin\/gateways\/[^?]+\?tenantId=gateway-browser-tenant/,
    );
    await expect(
      page.getByRole("heading", { name: "Gateway Browser-Abnahme" }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(
      "Liegenschaft: E2E Liegenschaft Alpha",
    );
    await expect(page.locator("body")).toContainText("Lifecycle: NEW");
    await expect(page.locator("body")).toContainText(
      "Online/Offline ist ein separater technischer Zustand",
    );
    await expect(page.locator("body")).toContainText("Erster Kontakt (UTC): —");
    await expect(page.locator("body")).toContainText(
      "Letzter Kontakt (UTC): —",
    );
    expect(
      (await page.locator("body").innerText()).toLowerCase(),
    ).not.toContain("mqtt verbunden");
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: [],
    });
    try {
      const gateway = await db.gateway.findFirstOrThrow({
        where: { externalGatewayId: externalId },
      });
      expect(gateway).toMatchObject({
        lifecycleStatus: "NEW",
        propertyId: "gateway-browser-property-a",
        installedAt: null,
        status: "OFFLINE",
      });
    } finally {
      await db.$disconnect();
    }
  });

  test("Provisionierung, Public Key, Kommunikationsmetadaten, Installation und Readiness verwenden den neuen UI-Pfad", async ({
    page,
  }) => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: [],
    });
    // Pair the synthetic public key and private signer by generating the pair together.
    const signingPair = generateKeyPairSync("ed25519");
    const matchingPublicKey = signingPair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const matchingPrivateKey = signingPair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    const requests: string[] = [];
    page.on("request", (request) =>
      requests.push(`${request.method()} ${request.url()}`),
    );
    try {
      await login(page, "admin@meterwerk.demo");
      await page.goto("/platform-admin/gateways");
      await page
        .locator("summary")
        .getByText("Gateway vorbereiten", { exact: true })
        .click();
      const form = page.locator("form.create-form").first();
      const propertiesResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/api/platform/gateways/properties?tenantId=") &&
          r.request().method() === "GET",
      );
      await form.getByLabel("Kunde").selectOption("gateway-browser-tenant");
      expect((await propertiesResponse).status()).toBe(200);
      await form
        .locator('select[name="propertyId"]')
        .selectOption("gateway-browser-property-a");
      await form.getByLabel("Hersteller").fill("Synthetik AG");
      await form.getByLabel("Modell").fill("E2E Gateway");
      await form
        .getByLabel("Name", { exact: true })
        .fill("Gateway Provisionierungsablauf");
      await form
        .getByLabel("Externe Gateway-ID")
        .fill(`provision-${randomUUID()}`);
      const create = page.waitForResponse(
        (r) =>
          r.url().includes("/api/gateways?") && r.request().method() === "POST",
      );
      await form.getByRole("button", { name: "Gateway vorbereiten" }).click();
      expect((await create).status()).toBe(201);
      await expect(
        page.getByRole("heading", { name: "Gateway Provisionierungsablauf" }),
      ).toBeVisible();
      const detailUrl = page.url();
      const gatewayId = decodeURIComponent(
        new URL(detailUrl).pathname.split("/").at(-1)!,
      );
      await expect(page.locator("body")).toContainText(
        "Liegenschaft zugeordnet: Erfüllt",
      );
      await expect(page.locator("body")).toContainText(
        "Installation vor Ort ist nicht bestätigt.",
      );
      await expect(
        page.getByRole("button", { name: "Gateway aktivieren" }),
      ).toHaveCount(0);

      const startResponse = page.waitForResponse(
        (r) =>
          r
            .url()
            .includes(`/api/platform/gateways/${gatewayId}/provisioning`) &&
          r.request().method() === "POST",
      );
      const startDialog = page.waitForEvent("dialog").then(async (dialog) => {
        expect(dialog.message()).toContain("Provisionierung starten");
        await dialog.accept();
      });
      await page
        .getByRole("button", {
          name: "Provisionierung starten / bewusst neu versuchen",
        })
        .click();
      expect((await startResponse).status()).toBe(200);
      await startDialog;
      await expect(page.locator("body")).toContainText(
        "Lifecycle: PROVISIONING",
      );
      await expect(
        page.getByRole("button", { name: "Installation vor Ort bestätigt" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Gateway aktivieren" }),
      ).toHaveCount(0);

      const keyForm = page.locator("form.create-form").filter({
        has: page.getByRole("heading", {
          name: "Signatur-Public-Key registrieren",
        }),
      });
      await keyForm
        .getByLabel("Ed25519 Public Key (SPKI-PEM)")
        .fill(matchingPublicKey);
      const keyResponse = page.waitForResponse(
        (r) =>
          r
            .url()
            .includes(`/api/platform/gateways/${gatewayId}/provisioning`) &&
          r.request().method() === "POST",
      );
      const keyDialog = page
        .waitForEvent("dialog")
        .then((dialog) => dialog.accept());
      await keyForm
        .getByRole("button", { name: "Signatur-Public-Key registrieren" })
        .click();
      const keyResult = await keyResponse;
      expect(keyResult.status()).toBe(200);
      const keyResponseText = await keyResult.text();
      expect(keyResponseText).not.toContain("privateKey");
      expect(keyResponseText).not.toContain("PRIVATE KEY");
      await keyDialog;
      await expect(page.locator("body")).toContainText(
        "Signaturidentität registriert: Offen / blockiert",
      );
      const stored = await db.gatewayCredential.findFirstOrThrow({
        where: { gatewayId },
      });
      expect(stored.publicKey).toBe(matchingPublicKey);
      expect(stored.publicKey).not.toContain("PRIVATE KEY");
      expect(requests.some((r) => r.includes("/credentials"))).toBe(false);

      const identityForm = page.locator("form.create-form").filter({
        has: page.getByRole("heading", {
          name: "Kommunikationsidentität registrieren",
        }),
      });
      await identityForm
        .getByLabel(/Umgebung \/ Brokerreferenz/)
        .fill("e2e-test-broker");
      await identityForm
        .getByLabel(/Zertifikatsfingerprint/)
        .fill(createHash("sha256").update(randomUUID()).digest("hex"));
      await identityForm.getByLabel("Issuer-Referenz").fill("e2e-test-issuer");
      await identityForm.getByLabel("Seriennummer (Hex, klein)").fill("e2e01");
      const before = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16);
      const after = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16);
      await identityForm.getByLabel("Gültig ab (UTC)").fill(before);
      await identityForm.getByLabel("Gültig bis (UTC)").fill(after);
      const identityResponse = page.waitForResponse(
        (r) =>
          r
            .url()
            .includes(`/api/platform/gateways/${gatewayId}/provisioning`) &&
          r.request().method() === "POST",
      );
      const identityDialog = page
        .waitForEvent("dialog")
        .then(async (dialog) => {
          expect(dialog.message()).toContain(
            "bestätigt keine Broker-Freischaltung",
          );
          await dialog.accept();
        });
      await identityForm
        .getByRole("button", { name: "In Meterwerk registrieren" })
        .click();
      expect((await identityResponse).status()).toBe(200);
      await identityDialog;
      await expect(page.locator("body")).toContainText(
        "In Meterwerk registriert:",
      );
      await expect(page.locator("body")).toContainText(
        "Externe Broker-Freischaltung bestätigt: —",
      );
      await expect(
        page.getByRole("button", {
          name: "Externe Broker-Freischaltung bestätigen",
        }),
      ).toBeVisible();
      expect(
        (await page.locator("body").innerText()).toLowerCase(),
      ).not.toContain("mqtt verbunden");

      expect(
        await db.gateway.findUniqueOrThrow({ where: { id: gatewayId } }),
      ).toMatchObject({ installedAt: null });
      const installResponse = page.waitForResponse(
        (r) =>
          r
            .url()
            .includes(`/api/platform/gateways/${gatewayId}/provisioning`) &&
          r.request().method() === "POST",
      );
      const installDialog = page.waitForEvent("dialog").then(async (dialog) => {
        expect(dialog.message()).toContain("vor Ort tatsächlich durchgeführt");
        await dialog.accept();
      });
      await page
        .getByRole("button", { name: "Installation vor Ort bestätigt" })
        .click();
      expect((await installResponse).status()).toBe(200);
      await installDialog;
      await expect(page.locator("body")).toContainText("Installiert:");
      expect(
        (await db.gateway.findUniqueOrThrow({ where: { id: gatewayId } }))
          .installedAt,
      ).toBeInstanceOf(Date);
      await expect(page.locator("body")).toContainText(
        "Externe Broker-Freischaltung ist nicht bestätigt.",
      );
      await expect(page.locator("body")).toContainText(
        "Mindestens ein geeignetes Gerät muss zugeordnet sein.",
      );
      await expect(
        page.getByRole("button", { name: "Gateway aktivieren" }),
      ).toHaveCount(0);
      await expect(page.locator("body")).toContainText(
        "Lifecycle: PROVISIONING",
      );
      await expect(page.locator("body")).toContainText("Verbindung: Offline");
      expect(requests.some((r) => r.includes("/credentials"))).toBe(false);
      expect(
        requests.some(
          (r) =>
            r.includes("/api/platform/gateways/") && r.includes("credentials"),
        ),
      ).toBe(false);
      expect(matchingPrivateKey).toContain("PRIVATE KEY");
      expect(await page.locator("body").innerText()).not.toContain(
        matchingPrivateKey,
      );
    } finally {
      await db.$disconnect();
    }
  });

  test("Stilllegung ist terminal und trennt Signaturwiderruf vom externen Brokerwiderruf", async ({
    page,
  }) => {
    await login(page, "admin@meterwerk.demo");
    await page.goto("/platform-admin/gateways");
    await page
      .locator("summary")
      .getByText("Gateway vorbereiten", { exact: true })
      .click();
    const form = page.locator("form.create-form").first();
    const props = page.waitForResponse(
      (r) =>
        r.url().includes("/api/platform/gateways/properties?tenantId=") &&
        r.request().method() === "GET",
    );
    await form.getByLabel("Kunde").selectOption("gateway-browser-tenant");
    expect((await props).status()).toBe(200);
    await form
      .locator('select[name="propertyId"]')
      .selectOption("gateway-browser-property-a");
    const externalId = `decommission-${randomUUID()}`;
    await form.getByLabel("Hersteller").fill("Synthetik AG");
    await form.getByLabel("Modell").fill("E2E Gateway");
    await form
      .getByLabel("Name", { exact: true })
      .fill("Gateway Stilllegungstest");
    await form.getByLabel("Externe Gateway-ID").fill(externalId);
    const create = page.waitForResponse(
      (r) =>
        r.url().includes("/api/gateways?") && r.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Gateway vorbereiten" }).click();
    expect((await create).status()).toBe(201);
    await expect(page).toHaveURL(
      /\/platform-admin\/gateways\/[^?]+\?tenantId=gateway-browser-tenant/,
    );
    const gatewayId = decodeURIComponent(
      new URL(page.url()).pathname.split("/").at(-1)!,
    );

    const keyPair = generateKeyPairSync("ed25519");
    const publicKey = keyPair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const keyForm = page.locator("form.create-form").filter({
      has: page.getByRole("heading", {
        name: "Signatur-Public-Key registrieren",
      }),
    });
    await keyForm.getByLabel("Ed25519 Public Key (SPKI-PEM)").fill(publicKey);
    const keyDialog = page.waitForEvent("dialog").then((d) => d.accept());
    await keyForm
      .getByRole("button", { name: "Signatur-Public-Key registrieren" })
      .click();
    await keyDialog;
    await expect(page.getByRole("status")).toContainText(
      "Bestätigung gespeichert",
    );

    const commForm = page.locator("form.create-form").filter({
      has: page.getByRole("heading", {
        name: "Kommunikationsidentität registrieren",
      }),
    });
    await commForm
      .getByLabel(/Umgebung \/ Brokerreferenz/)
      .fill("e2e-decommission-broker");
    await commForm
      .getByLabel(/Zertifikatsfingerprint/)
      .fill(createHash("sha256").update(randomUUID()).digest("hex"));
    await commForm.getByLabel("Issuer-Referenz").fill("e2e-issuer");
    await commForm.getByLabel("Seriennummer (Hex, klein)").fill("c001");
    await commForm
      .getByLabel("Gültig ab (UTC)")
      .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
    await commForm
      .getByLabel("Gültig bis (UTC)")
      .fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
    const commDialog = page.waitForEvent("dialog").then((d) => d.accept());
    await commForm
      .getByRole("button", { name: "In Meterwerk registrieren" })
      .click();
    await commDialog;
    await expect(page.getByRole("status")).toContainText(
      "Bestätigung gespeichert",
    );
    await expect(page.locator("body")).toContainText(
      "In Meterwerk registriert:",
    );
    await expect(page.locator("body")).toContainText(
      "Widerruf nicht angefordert",
    );
    await expect(page.locator("body")).not.toContainText("MQTT verbunden");

    const confirm = page.waitForEvent("dialog").then(async (d) => {
      expect(d.message()).toContain("Broker-Widerruf muss separat erfolgen");
      await d.accept();
    });
    await page
      .getByRole("button", { name: "Gateway endgültig stilllegen" })
      .click();
    await confirm;
    await expect(page.getByRole("status")).toContainText(
      "Bestätigung gespeichert",
    );
    await expect(page.locator("body")).toContainText(
      "Lifecycle: DECOMMISSIONED",
    );
    await expect(page.locator("body")).toContainText(
      "DECOMMISSIONED ist terminal",
    );
    await expect(page.locator("body")).toContainText(
      "Anwendung: gesperrt (terminal)",
    );
    await expect(page.locator("body")).toContainText(
      "Gateway-Signaturcredentials: widerrufen",
    );
    await expect(page.locator("body")).toContainText(
      "Widerruf angefordert; externe Bestätigung offen",
    );
    await expect(
      page.getByRole("button", { name: "Gateway aktivieren" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Gateway endgültig stilllegen" }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "vollständig gesperrt",
    );
    await expect(page.locator("body")).not.toContainText("MQTT verbunden");

    const storedGateway = await page.evaluate(async (gatewayId) => {
      const response = await fetch(
        `/api/platform/gateways/${gatewayId}?tenantId=gateway-browser-tenant`,
      );
      return {
        status: response.status,
        body: (await response.json()) as {
          gateway?: { id: string; revision: number; lifecycleStatus: string };
        },
      };
    }, gatewayId);
    expect(storedGateway.status).toBe(200);
    expect(storedGateway.body.gateway?.lifecycleStatus).toBe("DECOMMISSIONED");
    const gateway = storedGateway.body.gateway!;
    const forbidden = await page.evaluate(
      async ({ id, revision }) => {
        const response = await fetch(
          `/api/platform/gateways/${id}/provisioning`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenantId: "gateway-browser-tenant",
              confirmed: true,
              operation: "LIFECYCLE",
              data: { status: "ACTIVE", revision },
            }),
          },
        );
        return { status: response.status, body: await response.text() };
      },
      { id: gateway.id, revision: gateway.revision },
    );
    expect(forbidden.status, forbidden.body).toBe(409);
    const revokeConfirm = page.waitForEvent("dialog").then((d) => d.accept());
    await page
      .getByRole("button", { name: "Widerruf extern bestätigen" })
      .click();
    await revokeConfirm;
    await expect(page.locator("body")).toContainText(
      "Widerruf extern bestätigt",
    );
    await expect(page.locator("body")).not.toContainText("MQTT verbunden");
  });

  for (const [role, email] of [
    ["TENANT_ADMIN", "gateway-tenant-admin@browser.invalid"],
    ["MANAGER", "gateway-manager@browser.invalid"],
    ["USER", "gateway-user@browser.invalid"],
  ] as const) {
    test(`${role} kann die Plattform-Gatewayseite auch über direkte URL nicht öffnen`, async ({
      page,
    }) => {
      await login(page, email);
      const response = await page.goto("/platform-admin/gateways");
      expect(response?.status()).toBe(200);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: /Gateways/ })).toHaveCount(
        0,
      );
      await expect(page.locator("body")).not.toContainText(
        "Mandantenübergreifendes Gateway-Inventar",
      );
    });
  }
});
