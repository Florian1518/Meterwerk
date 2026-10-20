import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "./db";
import { requireActor, requirePageActor } from "./auth";
import { AccessError, requirePlatform } from "./policy";
import {
  createPilotGateway,
  listGatewayCredentials,
  manageGatewayCredential,
} from "./gateway-credentials";
import { gatewayHealth, deviceCompliance } from "./device-fleet-part3";
import {
  changeDeviceLifecycle,
  listPlatformDevices,
} from "./device-management";
import { getGatewayProvisioningReadiness } from "./gateway-readiness";
import {
  gatewayLifecycles,
  isAllowedGatewayTransition,
} from "./gateway-lifecycle";

export async function requireGatewayAdminPage() {
  const actor = await requirePageActor();
  try {
    requirePlatform(actor);
  } catch (error) {
    if (error instanceof AccessError && error.status === 403) notFound();
    throw error;
  }
  return actor;
}
async function authorize() {
  const actor = await requireActor();
  requirePlatform(actor);
  return actor;
}
const optionalText = z
  .string()
  .trim()
  .max(160)
  .optional()
  .transform((v) => v || undefined);
const filters = z
  .object({
    q: z.string().trim().max(120).optional(),
    tenantId: optionalText,
    status: z
      .union([
        z.enum(["ONLINE", "OFFLINE", "WARNING", "MAINTENANCE", "DISABLED"]),
        z.literal(""),
      ])
      .optional()
      .transform((v) => v || undefined),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
const tenantSelect = { id: true, name: true } as const;
async function tenantExists(id: string) {
  if (!(await db.tenant.findUnique({ where: { id }, select: { id: true } })))
    throw new AccessError(404, "Kunde nicht gefunden.");
}
async function gatewayIdentity(id: string, expectedTenant?: string) {
  const row = await db.gateway.findFirst({
    where: { id, ...(expectedTenant ? { tenantId: expectedTenant } : {}) },
    select: { id: true, tenantId: true },
  });
  if (!row) throw new AccessError(404, "Gateway nicht gefunden.");
  return row;
}
export async function gatewayAdminTenants() {
  await authorize();
  return db.tenant.findMany({
    select: tenantSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
export async function gatewayAdminProperties(tenantId: string) {
  await authorize();
  await tenantExists(tenantId);
  return db.property.findMany({
    where: { tenantId },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
export async function listAdminGateways(raw: unknown = {}) {
  await authorize();
  const value = filters.parse(raw);
  if (value.tenantId) await tenantExists(value.tenantId);
  const where = {
    tenantId: value.tenantId,
    status: value.status,
    ...(value.q
      ? {
          OR: [
            { name: { contains: value.q, mode: "insensitive" as const } },
            {
              externalGatewayId: {
                contains: value.q,
                mode: "insensitive" as const,
              },
            },
            { id: { contains: value.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await db.$transaction([
    db.gateway.findMany({
      where,
      skip: (value.page - 1) * 25,
      take: 25,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        externalGatewayId: true,
        tenantId: true,
        tenant: { select: tenantSelect },
        status: true,
        lifecycleStatus: true,
        property: { select: { id: true, name: true } },
        firstContactAt: true,
        provisioningStartedAt: true,
        provisioningFailedAt: true,
        commissionedAt: true,
        lastSeenAt: true,
        firmwareVersion: true,
        queueWarning: true,
        queueDropped: true,
        quarantineSize: true,
        _count: { select: { devices: true } },
        credentials: { select: { status: true, expiresAt: true } },
      },
    }),
    db.gateway.count({ where }),
  ]);
  return {
    items,
    total,
    page: value.page,
    pages: Math.max(1, Math.ceil(total / 25)),
  };
}
export async function listAdminDevices(raw: unknown = {}) {
  await authorize();
  const value = z
    .object({
      q: z.string().trim().max(120).optional(),
      tenantId: optionalText,
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .strict()
    .parse(raw);
  const result = await listPlatformDevices(
    { q: value.q, page: value.page },
    value.tenantId,
  );
  return {
    ...result,
    items: result.items.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      tenant: d.tenant,
      name: d.name,
      externalDeviceId: d.externalDeviceId,
      gateway: d.gateway,
      meter: d.meter,
      profile: d.profile,
      lifecycleStatus: d.lifecycleStatus,
      status: d.status,
      lastSeenAt: d.lastSeenAt,
    })),
  };
}
export async function getAdminGateway(id: string, expectedTenant?: string) {
  await authorize();
  const identity = await gatewayIdentity(id, expectedTenant);
  const gateway = await db.gateway.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: tenantSelect },
      name: true,
      externalGatewayId: true,
      manufacturer: true,
      model: true,
      status: true,
      lifecycleStatus: true,
      revision: true,
      propertyId: true,
      property: { select: { id: true, name: true } },
      firstContactAt: true,
      provisioningStartedAt: true,
      provisioningFailedAt: true,
      provisioningErrorCode: true,
      commissionedAt: true,
      decommissionedAt: true,
      communicationIdentities: {
        orderBy: { registeredAt: "desc" },
        select: {
          id: true,
          brokerReference: true,
          certificateFingerprint: true,
          issuerReference: true,
          serialNumber: true,
          commonName: true,
          notBefore: true,
          expiresAt: true,
          registeredAt: true,
          enabledConfirmedAt: true,
          revocationRequestedAt: true,
          revocationConfirmedAt: true,
        },
      },
      lastSeenAt: true,
      installedAt: true,
      createdAt: true,
      firmwareVersion: true,
      queueSize: true,
      queueWarning: true,
      queueDropped: true,
      quarantineSize: true,
      devices: {
        orderBy: { externalDeviceId: "asc" },
        select: {
          id: true,
          tenantId: true,
          name: true,
          externalDeviceId: true,
          status: true,
          lifecycleStatus: true,
          lastSeenAt: true,
          meter: {
            select: {
              serialNumber: true,
              type: true,
              unit: {
                select: {
                  building: {
                    select: { property: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          },
          profile: {
            select: { manufacturer: true, model: true, version: true },
          },
        },
      },
      maintenanceWindows: {
        orderBy: { startsAt: "desc" },
        take: 20,
        select: { id: true, startsAt: true, endsAt: true, reason: true },
      },
    },
  });
  const [credentials, health, alerts, audit, compliance] = await Promise.all([
    listGatewayCredentials(id, identity.tenantId),
    gatewayHealth(id, identity.tenantId),
    db.technicalAlert.findMany({
      where: {
        tenantId: identity.tenantId,
        entityId: { in: [id, ...gateway.devices.map((d) => d.id)] },
      },
      orderBy: { openedAt: "desc" },
      take: 30,
      select: {
        id: true,
        kind: true,
        active: true,
        openedAt: true,
        resolvedAt: true,
      },
    }),
    db.auditEvent.findMany({
      where: {
        tenantId: identity.tenantId,
        OR: [
          { entityId: id },
          { entityId: { in: gateway.devices.map((d) => d.id) } },
          {
            entityId: {
              in: (
                await db.gatewayCredential.findMany({
                  where: { gatewayId: id, tenantId: identity.tenantId },
                  select: { id: true },
                })
              ).map((c) => c.id),
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, entityId: true, createdAt: true },
    }),
    Promise.all(
      gateway.devices.map((d) => deviceCompliance(d.id, identity.tenantId)),
    ),
  ]);
  const [readiness, properties, openCommands] = await Promise.all([
    getGatewayProvisioningReadiness(id, identity.tenantId),
    gatewayAdminProperties(identity.tenantId),
    db.gatewayCommand.count({
      where: {
        gatewayId: id,
        tenantId: identity.tenantId,
        status: { in: ["PENDING", "QUEUED", "SENT", "ACKNOWLEDGED"] },
      },
    }),
  ]);
  const allowedTransitions = gatewayLifecycles.filter(
    (to) =>
      isAllowedGatewayTransition(gateway.lifecycleStatus, to) &&
      (to !== "ACTIVE" || readiness.ready) &&
      (to !== "PROVISIONING" ||
        (!!gateway.propertyId &&
          !readiness.blockers.some((b) =>
            ["TENANT_MISSING", "MASTER_DATA_INVALID"].includes(b.code),
          ))),
  );
  const canAssignProperty =
    ["NEW", "MAINTENANCE"].includes(gateway.lifecycleStatus) &&
    gateway.devices.length === 0 &&
    openCommands === 0;
  return {
    gateway,
    credentials,
    health,
    alerts,
    audit,
    compliance,
    readiness,
    properties,
    allowedTransitions,
    canAssignProperty,
  };
}
export async function prepareAdminGateway(tenantId: string, raw: unknown) {
  await authorize();
  const value = z
    .object({
      name: z.string(),
      externalGatewayId: z.string(),
      propertyId: z.string().min(1),
      manufacturer: z.string().trim().min(1).max(160).optional(),
      model: z.string().trim().min(1).max(160).optional(),
    })
    .strict()
    .parse(raw);
  await tenantExists(tenantId);
  return createPilotGateway(
    {
      name: value.name,
      externalGatewayId: value.externalGatewayId,
      propertyId: value.propertyId,
      manufacturer: value.manufacturer,
      model: value.model,
    },
    tenantId,
  );
}
export async function adminGatewayCredential(id: string, raw: unknown) {
  await authorize();
  const value = z
    .object({
      tenantId: z.string().min(1),
      confirmed: z.literal(true),
      operation: z.enum(["CREATE", "ROTATE", "REVOKE"]),
      credentialId: z.string().min(1).optional(),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict()
    .parse(raw);
  const identity = await gatewayIdentity(id, value.tenantId);
  const operation = {
    operation: value.operation,
    ...(value.credentialId ? { credentialId: value.credentialId } : {}),
    ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
  };
  return manageGatewayCredential(id, operation, identity.tenantId);
}
export async function decommissionAdminDevice(id: string, raw: unknown) {
  await authorize();
  const value = z
    .object({
      tenantId: z.string().min(1),
      confirmed: z.literal(true),
      status: z.literal("DECOMMISSIONED"),
    })
    .strict()
    .parse(raw);
  return changeDeviceLifecycle(id, value.status, value.tenantId);
}
