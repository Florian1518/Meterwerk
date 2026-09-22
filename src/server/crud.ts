import "server-only";
import { z } from "zod";
import { db } from "./db";
import {
  AccessError,
  requireManage,
  requirePlatform,
  tenantScope,
  type Actor,
} from "./policy";
import { hashPassword } from "./password";
import { requireTenantQuota } from "./licensing";
import type { Prisma } from "@/generated/prisma/client";

export const editableResources = [
  "tenants",
  "properties",
  "buildings",
  "units",
  "meters",
  "users",
  "alarms",
] as const;
export type EditableResource = (typeof editableResources)[number];
const text = z
  .string()
  .trim()
  .min(1, "Pflichtfeld fehlt.")
  .max(160, "Maximal 160 Zeichen.");
const bool = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => v === true || v === "true");
const userSchema = z.object({
  name: text,
  email: z.email("Ungültige E-Mail-Adresse.").toLowerCase(),
  role: z.enum(["TENANT_ADMIN", "MANAGER", "USER"]),
  active: bool.default(true),
  password: z
    .union([
      z.literal(""),
      z.string().min(14, "Passwort benötigt mindestens 14 Zeichen.").max(128),
    ])
    .optional(),
});
export const schemas = {
  tenants: z.object({
    name: text,
    slug: z
      .string()
      .regex(
        /^[a-z0-9-]{3,60}$/,
        "Kürzel: 3–60 Zeichen, a–z, 0–9 und Bindestrich.",
      ),
  }),
  properties: z.object({ name: text, address: text, city: text }),
  buildings: z.object({ name: text, propertyId: text }),
  units: z.object({
    name: text,
    buildingId: text,
    floor: text,
    area: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce.number().min(0).max(1000000),
    ),
  }),
  meters: z.object({
    serialNumber: text,
    externalDeviceId: z.string().trim().max(160).optional(),
    unitId: text,
    type: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]),
    manufacturer: text,
    model: text,
    location: text,
    installedAt: z.iso.date(),
    status: z.enum(["ACTIVE", "OFFLINE", "MAINTENANCE"]).default("MAINTENANCE"),
  }),
  users: userSchema,
  alarms: z.object({
    title: text,
    meterId: text,
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).default("OPEN"),
  }),
};

async function existing(
  tx: Prisma.TransactionClient,
  kind: EditableResource,
  id: string,
  tenantId: string,
) {
  const where = { id, tenantId };
  const row =
    kind === "tenants"
      ? await tx.tenant.findUnique({ where: { id } })
      : kind === "properties"
        ? await tx.property.findFirst({ where })
        : kind === "buildings"
          ? await tx.building.findFirst({ where })
          : kind === "units"
            ? await tx.unit.findFirst({ where })
            : kind === "meters"
              ? await tx.meter.findFirst({ where })
              : kind === "users"
                ? await tx.user.findFirst({ where })
                : await tx.alarm.findFirst({ where });
  if (!row) throw new AccessError(404, "Eintrag nicht gefunden.");
  return row;
}

export async function writeResource(
  actor: Actor,
  kindInput: unknown,
  operation: "create" | "update" | "delete",
  raw: unknown,
  requested?: string | null,
) {
  requireManage(actor);
  const kind = z.enum(editableResources).parse(kindInput);
  if (kind === "tenants") requirePlatform(actor);
  const envelope = z
    .object({ id: text.optional(), confirmation: z.string().optional() })
    .parse(raw);
  if (operation !== "create" && !envelope.id)
    throw new AccessError(400, "Eintrags-ID fehlt.");
  if (operation === "delete" && envelope.confirmation !== "DELETE")
    throw new AccessError(400, "Löschen bitte ausdrücklich bestätigen.");
  const tenantId =
    kind === "tenants" ? (envelope.id ?? "") : tenantScope(actor, requested);
  const password =
    kind === "users" && operation !== "delete"
      ? userSchema.parse(raw).password
      : undefined;
  if (kind === "users" && operation === "create" && !password)
    throw new AccessError(400, "Passwort benötigt mindestens 14 Zeichen.");
  const passwordHash = password ? await hashPassword(password) : undefined;
  // Tenant row lock serializes administration and protects the last-admin invariant.
  return db.$transaction(async (tx) => {
    if (operation === "create" && kind !== "tenants" && kind !== "alarms")
      await requireTenantQuota(tx, tenantId, kind);
    if (tenantId)
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    const id = envelope.id;
    const prior =
      operation !== "create" ? await existing(tx, kind, id!, tenantId) : null;
    if (kind === "users" && prior && "role" in prior) {
      const next = operation === "update" ? userSchema.parse(raw) : null;
      if (
        id === actor.id &&
        (operation === "delete" ||
          next?.active === false ||
          next?.role !== prior.role)
      )
        throw new AccessError(
          409,
          "Den eigenen Zugang dürfen Sie nicht löschen, sperren oder herabstufen.",
        );
      if (
        prior.role === "TENANT_ADMIN" &&
        prior.active &&
        (operation === "delete" ||
          !next?.active ||
          next.role !== "TENANT_ADMIN")
      ) {
        const admins = await tx.user.count({
          where: { tenantId, role: "TENANT_ADMIN", active: true },
        });
        if (admins <= 1)
          throw new AccessError(
            409,
            "Mindestens ein aktiver Kundenadministrator muss erhalten bleiben.",
          );
      }
    }
    let resultId = id ?? "";
    if (operation === "delete") {
      const where = { id: id!, tenantId };
      // Restrict protects metering history and linked children; no implicit cascading deletion.
      switch (kind) {
        case "tenants":
          await tx.tenant.delete({ where: { id } });
          break;
        case "properties":
          await tx.property.delete({ where });
          break;
        case "buildings":
          await tx.building.delete({ where });
          break;
        case "units":
          await tx.unit.delete({ where });
          break;
        case "meters":
          await tx.meter.delete({ where });
          break;
        case "users":
          await tx.user.delete({ where });
          break;
        case "alarms":
          await tx.alarm.delete({ where });
          break;
      }
    } else {
      switch (kind) {
        case "tenants": {
          const data = schemas.tenants.parse(raw);
          resultId = (
            operation === "create"
              ? await tx.tenant.create({ data })
              : await tx.tenant.update({ where: { id }, data })
          ).id;
          if (operation === "create") {
            const basic = await tx.plan.findUnique({
              where: { code: "BASIC" },
            });
            if (!basic)
              throw new AccessError(503, "SaaS-Pläne sind nicht eingerichtet.");
            await tx.subscription.create({
              data: { tenantId: resultId, planId: basic.id },
            });
          }
          break;
        }
        case "properties": {
          const data = schemas.properties.parse(raw);
          resultId = (
            operation === "create"
              ? await tx.property.create({ data: { ...data, tenantId } })
              : await tx.property.update({ where: { id, tenantId }, data })
          ).id;
          break;
        }
        case "buildings": {
          const data = schemas.buildings.parse(raw);
          await existing(tx, "properties", data.propertyId, tenantId);
          resultId = (
            operation === "create"
              ? await tx.building.create({ data: { ...data, tenantId } })
              : await tx.building.update({ where: { id, tenantId }, data })
          ).id;
          break;
        }
        case "units": {
          const data = schemas.units.parse(raw);
          await existing(tx, "buildings", data.buildingId, tenantId);
          resultId = (
            operation === "create"
              ? await tx.unit.create({ data: { ...data, tenantId } })
              : await tx.unit.update({ where: { id, tenantId }, data })
          ).id;
          break;
        }
        case "meters": {
          const value = schemas.meters.parse(raw);
          await existing(tx, "units", value.unitId, tenantId);
          if (
            prior &&
            "type" in prior &&
            value.type !== prior.type &&
            (await tx.reading.count({ where: { tenantId, meterId: id } }))
          )
            throw new AccessError(
              409,
              "Zählerart mit vorhandener Messhistorie kann nicht geändert werden.",
            );
          const data = {
            ...value,
            installedAt: new Date(value.installedAt),
            externalDeviceId: value.externalDeviceId || null,
            measurementUnit: ["WATER", "GAS"].includes(value.type)
              ? "m³"
              : "kWh",
          };
          resultId = (
            operation === "create"
              ? await tx.meter.create({
                  data: { ...data, tenantId, demoPricePerUnit: 0 },
                })
              : await tx.meter.update({ where: { id, tenantId }, data })
          ).id;
          break;
        }
        case "users": {
          const value = userSchema.parse(raw);
          const data = {
            name: value.name,
            email: value.email,
            role: value.role,
            active: value.active,
            ...(passwordHash ? { passwordHash } : {}),
          };
          resultId = (
            operation === "create"
              ? await tx.user.create({
                  data: { ...data, tenantId, passwordHash: passwordHash! },
                })
              : await tx.user.update({ where: { id, tenantId }, data })
          ).id;
          if (operation === "update") {
            await tx.session.deleteMany({ where: { userId: id } });
            if (prior && "role" in prior && prior.role !== value.role)
              await tx.propertyGrant.deleteMany({
                where: { userId: id, tenantId },
              });
          }
          break;
        }
        case "alarms": {
          const data = schemas.alarms.parse(raw);
          await existing(tx, "meters", data.meterId, tenantId);
          resultId = (
            operation === "create"
              ? await tx.alarm.create({ data: { ...data, tenantId } })
              : await tx.alarm.update({ where: { id, tenantId }, data })
          ).id;
          break;
        }
      }
    }
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId: kind === "tenants" ? resultId : tenantId,
        action: `${kind}.${operation}`,
        entityId: resultId,
      },
    });
    return { id: resultId };
  });
}

export async function saveSettings(
  actor: Actor,
  raw: unknown,
  requested?: string | null,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const data = z.object({ name: text }).parse(raw);
  return db.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId,
        entityId: tenantId,
        action: "settings.update",
      },
    });
    return { id: tenantId };
  });
}

export async function revokeGrant(
  actor: Actor,
  raw: unknown,
  requested?: string | null,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const data = z
    .object({
      userId: text,
      propertyId: text,
      confirmation: z.literal("DELETE"),
    })
    .parse(raw);
  return db.$transaction(async (tx) => {
    const result = await tx.propertyGrant.deleteMany({
      where: { tenantId, userId: data.userId, propertyId: data.propertyId },
    });
    if (!result.count) throw new AccessError(404, "Freigabe nicht gefunden.");
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId,
        entityId: data.propertyId,
        action: "grant.delete",
      },
    });
    return { id: data.propertyId };
  });
}
