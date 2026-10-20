import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ComponentProps } from "react";
import type { Actor } from "@/server/policy";

const mocks = vi.hoisted(() => ({
  actor: {
    id: "super",
    role: "SUPER_ADMIN",
    tenantId: null,
    name: "Platform Admin",
    email: "platform@example.invalid",
  } as Actor,
  gatewayList: vi.fn(),
  devices: vi.fn(),
  tenants: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => "/platform-admin/gateways",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/server/auth", () => ({
  requirePageActor: async () => mocks.actor,
  requireActor: async () => mocks.actor,
}));
vi.mock("@/server/gateway-admin", () => ({
  requireGatewayAdminPage: async () => {
    if (mocks.actor.role !== "SUPER_ADMIN") throw new Error("NOT_FOUND");
    return mocks.actor;
  },
  listAdminGateways: mocks.gatewayList,
  listAdminDevices: mocks.devices,
  gatewayAdminTenants: mocks.tenants,
  getAdminGateway: mocks.detail,
}));
vi.mock("@/server/presentation", () => ({
  presentation: async () => ({ theme: "light", timeZone: "UTC" }),
}));
vi.mock("@/components/global-search", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/display-preferences", () => ({
  DisplayPreferences: () => null,
}));
vi.mock("@/components/breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/app/actions", () => ({ logoutAction: async () => {} }));

import { Shell } from "@/components/shell";
import GatewaysPage from "@/app/(platform)/platform-admin/gateways/page";
import DevicesPage from "@/app/(platform)/platform-admin/gateways/devices/page";
import GatewayDetailPage from "@/app/(platform)/platform-admin/gateways/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor = {
    id: "super",
    role: "SUPER_ADMIN",
    tenantId: null,
    name: "Platform Admin",
    email: "platform@example.invalid",
  };
  mocks.gatewayList.mockResolvedValue({
    items: [],
    total: 25,
    page: 1,
    pages: 2,
  });
  mocks.devices.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 });
  mocks.tenants.mockResolvedValue([{ id: "tenant-a", name: "Kunde A" }]);
  mocks.detail.mockResolvedValue({
    gateway: {
      id: "synthetic-gateway",
      tenantId: "tenant-a",
      tenant: { id: "tenant-a", name: "Kunde A" },
      name: "Synthetic",
      externalGatewayId: "synthetic",
      manufacturer: "Test",
      model: "Test",
      status: "OFFLINE",
      lifecycleStatus: "PROVISIONING",
      propertyId: null,
      property: null,
      revision: 1,
      firstContactAt: null,
      provisioningStartedAt: new Date("2026-01-01Z"),
      provisioningFailedAt: null,
      provisioningErrorCode: null,
      commissionedAt: null,
      communicationIdentities: [],
      lastSeenAt: null,
      installedAt: new Date("2026-01-01Z"),
      createdAt: new Date("2026-01-01Z"),
      firmwareVersion: null,
      queueSize: 0,
      queueWarning: false,
      queueDropped: 0,
      quarantineSize: 0,
      devices: [],
      maintenanceWindows: [],
    },
    credentials: [
      {
        id: "cred",
        status: "ACTIVE",
        keyFingerprint: "fingerprint",
        createdAt: new Date("2026-01-01Z"),
        expiresAt: null,
        revokedAt: null,
      },
    ],
    health: { status: "CRITICAL", reasons: ["Kein aktives Credential"] },
    alerts: [],
    audit: [],
    compliance: [],
    readiness: {
      ready: false,
      currentContactAt: null,
      steps: [{ label: "Installation bestätigt", status: "BLOCKED" }],
      blockers: [
        {
          code: "INSTALLATION_UNCONFIRMED",
          message: "Installation vor Ort ist nicht bestätigt.",
        },
      ],
    },
    properties: [],
    allowedTransitions: ["FAILED", "DECOMMISSIONED"],
    canAssignProperty: false,
  });
});

it("shows the single central navigation item only to SUPER_ADMIN", () => {
  const render = (role: Actor["role"]) =>
    renderToStaticMarkup(
      createElement(
        Shell,
        {
          actor: {
            ...mocks.actor,
            role,
            tenantId: role === "SUPER_ADMIN" ? null : "tenant-a",
          },
          preferences: { theme: "light", timeZone: "UTC" },
        } as ComponentProps<typeof Shell>,
        "Content",
      ),
    );
  // Shell renders the same role-filtered navigation in desktop and mobile layouts.
  expect(render("SUPER_ADMIN").match(/Gateways &amp; Geräte/g)).toHaveLength(2);
  for (const role of ["TENANT_ADMIN", "MANAGER", "USER"] as const)
    expect(render(role)).not.toContain("Gateways &amp; Geräte");
});

it("renders overview, customer filter, status filter, pagination and preparation form", async () => {
  const html = renderToStaticMarkup(
    await GatewaysPage({ searchParams: Promise.resolve({}) }),
  );
  for (const label of [
    "Gateways &amp; Geräte",
    "Gateway vorbereiten",
    "Kunde",
    "Technischer Status",
    "Lifecycle",
    "Liegenschaft",
    "Weiter",
  ])
    expect(html).toContain(label);
  expect(html).not.toContain("Zertifikat ausstellen");
  expect(html).not.toContain("Firmware-Update");
  expect(mocks.gatewayList).toHaveBeenCalledWith({});
});

it("renders central device table with links to the existing detail page", async () => {
  mocks.devices.mockResolvedValue({
    items: [
      {
        id: "device-a",
        tenantId: "tenant-a",
        tenant: { id: "tenant-a", name: "Kunde A" },
        name: "Device A",
        externalDeviceId: "device-a",
        gateway: { id: "gateway-a", name: "Gateway A" },
        meter: { serialNumber: "M-1", type: "ELECTRICITY" },
        profile: null,
        lifecycleStatus: "ACTIVE",
        status: "ONLINE",
        lastSeenAt: null,
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
  });
  const html = renderToStaticMarkup(
    await DevicesPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Device A");
  expect(html).toContain("Kunde A");
  expect(html).toContain(
    "/devices/device-a?tenantId=tenant-a&amp;platformAdmin=1",
  );
  expect(html).not.toContain("Neustart");
});

it.each(["TENANT_ADMIN", "MANAGER", "USER"] as const)(
  "rejects direct page rendering for %s",
  async (role) => {
    mocks.actor = { ...mocks.actor, role, tenantId: "tenant-a" };
    await expect(
      GatewaysPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      DevicesPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      GatewayDetailPage({
        params: Promise.resolve({ id: "gateway-a" }),
        searchParams: Promise.resolve({ tenantId: "tenant-a" }),
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.gatewayList).not.toHaveBeenCalled();
    expect(mocks.detail).not.toHaveBeenCalled();
  },
);

it("renders safe credential metadata and no private material in normal detail HTML", async () => {
  const html = renderToStaticMarkup(
    await GatewayDetailPage({
      params: Promise.resolve({ id: "synthetic-gateway" }),
      searchParams: Promise.resolve({ tenantId: "tenant-a" }),
    }),
  );
  expect(html).toContain("fingerprint");
  expect(html).toContain("Signatur-Public-Key registrieren");
  expect(html).not.toContain("Credential erzeugen");
  expect(html).not.toContain("Rotieren");
  expect(html).toContain("Keine Liegenschaft zugeordnet");
  expect(html).toContain("PROVISIONING");
  expect(html).toContain("Offline");
  expect(html).toContain("Erster Kontakt");
  expect(html).toContain("Letzter Kontakt");
  expect(html).toContain("Offen / blockiert");
  expect(html).toContain("Installation vor Ort ist nicht bestätigt.");
  expect(html).toContain("externe Broker-Freischaltung bestätigt");
  expect(html).not.toContain("MQTT verbunden");
  expect(html).not.toContain("Gateway aktivieren");
  expect(html).not.toContain("PRIVATE KEY");
  expect(html).not.toContain("tokenHash");
  expect(html).not.toContain("Neustart");
  expect(html).not.toContain("Firmware-Rollout");
});

it("renders direct gateway property without inferring from devices and separates lifecycle from online", async () => {
  mocks.gatewayList.mockResolvedValue({
    items: [
      {
        id: "direct",
        tenantId: "tenant-a",
        tenant: { name: "Kunde A" },
        externalGatewayId: "direct",
        property: { id: "property-a", name: "Direkte Liegenschaft" },
        lifecycleStatus: "NEW",
        status: "ONLINE",
        firstContactAt: new Date("2026-01-01Z"),
        lastSeenAt: new Date("2026-01-01Z"),
        provisioningStartedAt: null,
        commissionedAt: null,
        credentials: [],
        _count: { devices: 0 },
        queueWarning: false,
        queueDropped: 0,
        quarantineSize: 0,
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
  });
  const html = renderToStaticMarkup(
    await GatewaysPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Direkte Liegenschaft");
  expect(html).toContain("NEW");
  expect(html).toContain("Online");
  expect(html).toContain("Noch nicht gestartet");
});
it("shows activation only when supplied by the server and exposes no legacy key generator", async () => {
  const data = await mocks.detail();
  data.readiness = {
    ready: true,
    currentContactAt: new Date(),
    steps: [{ label: "Geräte zugeordnet", status: "FULFILLED" }],
    blockers: [],
  };
  data.allowedTransitions = ["ACTIVE", "FAILED", "DECOMMISSIONED"];
  mocks.detail.mockResolvedValue(data);
  const html = renderToStaticMarkup(
    await GatewayDetailPage({
      params: Promise.resolve({ id: "synthetic-gateway" }),
      searchParams: Promise.resolve({ tenantId: "tenant-a" }),
    }),
  );
  expect(html).toContain("Gateway aktivieren");
  expect(html).toContain("Erfüllt");
  expect(html).not.toContain("Credential erzeugen");
  expect(html).not.toContain("privateKey");
});
it("terminal UI keeps external revocation outstanding and hides provisioning actions", async () => {
  const data = await mocks.detail();
  data.gateway.lifecycleStatus = "DECOMMISSIONED";
  data.allowedTransitions = [];
  data.gateway.communicationIdentities = [
    {
      id: "identity",
      brokerReference: "test-broker",
      certificateFingerprint: "abc",
      issuerReference: "test",
      serialNumber: "01",
      commonName: "synthetic-gateway",
      notBefore: new Date("2026-01-01Z"),
      expiresAt: new Date("2030-01-01Z"),
      registeredAt: new Date(),
      enabledConfirmedAt: new Date(),
      revocationRequestedAt: new Date(),
      revocationConfirmedAt: null,
    },
  ];
  mocks.detail.mockResolvedValue(data);
  const html = renderToStaticMarkup(
    await GatewayDetailPage({
      params: Promise.resolve({ id: "synthetic-gateway" }),
      searchParams: Promise.resolve({ tenantId: "tenant-a" }),
    }),
  );
  expect(html).toContain("DECOMMISSIONED ist terminal");
  expect(html).toContain("externe Bestätigung offen");
  expect(html).toContain("Widerruf extern bestätigen");
  expect(html).not.toContain("Gateway aktivieren");
  expect(html).not.toContain("Signatur-Public-Key registrieren");
  expect(html).not.toContain("vollständig gesperrt");
});

it("requires an explicitly selected customer in gateway detail", async () => {
  await expect(
    GatewayDetailPage({
      params: Promise.resolve({ id: "synthetic-gateway" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("NOT_FOUND");
  expect(mocks.detail).not.toHaveBeenCalled();
});
