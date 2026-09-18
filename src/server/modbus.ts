import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import {
  AccessError,
  propertyScope,
  requireManage,
  tenantScope,
} from "./policy";
import {
  commandAction,
  getProfile,
  modbusConfigSchema,
  metricSchema,
  profiles,
} from "../lib/modbus/contracts";
import { csvDocument } from "../lib/modbus/csv";

async function access(
  meterId: string,
  requested?: string | null,
  manage = false,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  if (manage) requireManage(actor);
  const meter = await db.meter.findFirst({
    where: {
      id: meterId,
      tenantId,
      unit: { building: { property: propertyScope(actor, tenantId) } },
    },
    select: {
      id: true,
      tenantId: true,
      serialNumber: true,
      unitId: true,
      type: true,
      measurementUnit: true,
    },
  });
  if (!meter) throw new AccessError(404, "Zähler nicht gefunden.");
  return { actor, tenantId, meter };
}
export async function readModbus(
  meterId: string,
  requested?: string | null,
  debug = false,
) {
  const { actor, tenantId, meter } = await access(meterId, requested);
  const admin = ["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role);
  if (debug && !admin)
    throw new AccessError(
      403,
      "Rohdaten sind nur für Administratoren zugänglich.",
    );
  const devices = await db.device.findMany({
    where: { tenantId, meterId, protocol: "MODBUS" },
    select: {
      id: true,
      status: true,
      gatewayId: true,
      lastSeenAt: true,
      modbusConfig: {
        select: {
          configuration: true,
          revision: true,
          state: true,
          step: true,
          pollingEnabled: true,
          reviewedRevision: true,
          confirmedUnitId: true,
          completedAt: true,
        },
      },
      diagnostic: {
        select: {
          lastPollAt: true,
          lastSuccessAt: true,
          responseMs: true,
          lastError: true,
          successes: true,
          errors: true,
          consecutiveErrors: true,
          revision: true,
          ...(debug ? { raw: true } : {}),
        },
      },
      commands: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          action: true,
          status: true,
          error: true,
          createdAt: true,
          expiresAt: true,
        },
      },
      telemetry: {
        where: { error: null },
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          timestamp: true,
          revision: true,
          measurements: { select: { metric: true, value: true, unit: true } },
        },
      },
    },
  });
  return {
    asOf: new Date().toISOString(),
    meter,
    tenantId,
    canManage: admin,
    devices: devices.map((d) => ({
      ...d,
      telemetry: d.telemetry.map((s) => ({
        ...s,
        measurements: s.measurements.map((m) => ({
          ...m,
          value: m.value.toString(),
        })),
      })),
    })),
    gateways: admin
      ? await db.gateway.findMany({
          where: { tenantId, status: { not: "DISABLED" } },
          select: { id: true, name: true, status: true },
          take: 200,
        })
      : [],
    units: admin
      ? await db.unit.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            building: { select: { name: true } },
          },
          take: 200,
        })
      : [],
  };
}
const operationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("CONFIGURE"),
      gatewayId: z.string().min(1),
      configuration: modbusConfigSchema,
    })
    .strict(),
  z.object({ operation: z.literal("COMMAND"), action: commandAction }).strict(),
  z
    .object({
      operation: z.literal("REVIEW"),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ operation: z.literal("ASSIGN"), unitId: z.string().min(1) })
    .strict(),
  z.object({ operation: z.literal("COMPLETE") }).strict(),
  z.object({ operation: z.literal("DISABLE") }).strict(),
]);
export async function writeModbus(
  meterId: string,
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId, meter } = await access(meterId, requested, true);
  const value = operationSchema.parse(raw);
  return db.$transaction(async (tx) => {
    // Match ingestion order Gateway -> Device -> Meter. GatewayCommand inserts
    // also acquire a Gateway FK lock, including for STOP/READ commands.
    const targetGateway =
      value.operation === "CONFIGURE" ? value.gatewayId : "";
    await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "tenantId"=${tenantId} AND ("id"=${targetGateway} OR "id" IN (SELECT "gatewayId" FROM "Device" WHERE "meterId"=${meterId} AND "tenantId"=${tenantId})) ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "meterId"=${meterId} AND "tenantId"=${tenantId} ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Meter" WHERE "id"=${meterId} AND "tenantId"=${tenantId} FOR UPDATE`;
    let device = await tx.device.findFirst({
      where: { tenantId, meterId, protocol: "MODBUS" },
      include: { modbusConfig: true, diagnostic: true },
    });
    if (value.operation === "CONFIGURE") {
      if (meter.type !== "ELECTRICITY" || meter.measurementUnit !== "kWh")
        throw new AccessError(
          409,
          "Das Stromzählerprofil erfordert einen kWh-Stromzähler.",
        );
      const profile = profiles.find(
        (p) => p.id === value.configuration.profileId,
      );
      if (!profile) throw new AccessError(400, "Unbekanntes Modbus-Profil.");
      if (!profile.transports.includes(value.configuration.interface))
        throw new AccessError(
          400,
          "Profil unterstützt diese Schnittstelle nicht.",
        );
      const gateway = await tx.gateway.findFirst({
        where: { id: value.gatewayId, tenantId, status: { not: "DISABLED" } },
      });
      if (!gateway) throw new AccessError(404, "Gateway nicht gefunden.");
      if (
        (await tx.device.count({
          where: {
            tenantId,
            gatewayId: gateway.id,
            modbusConfig: { isNot: null },
            id: { not: device?.id ?? "" },
          },
        })) >= 32
      )
        throw new AccessError(
          409,
          "Der Pilot unterstützt maximal 32 konfigurierte Geräte je Gateway.",
        );
      if (
        device?.gatewayId &&
        device.gatewayId !== gateway.id &&
        device.modbusConfig?.pollingEnabled
      )
        throw new AccessError(
          409,
          "Polling vor einem Gateway-Wechsel stoppen.",
        );
      if (!device)
        device = await tx.device.create({
          data: {
            tenantId,
            meterId,
            gatewayId: gateway.id,
            externalDeviceId: `modbus-${meterId}`,
            manufacturer: profile.manufacturer,
            model: profile.model,
            protocol: "MODBUS",
            status: "OFFLINE",
            installedAt: new Date(),
          },
          include: { modbusConfig: true, diagnostic: true },
        });
      else
        await tx.device.update({
          where: { id: device.id },
          data: {
            gatewayId: gateway.id,
            status: "OFFLINE",
            manufacturer: profile.manufacturer,
            model: profile.model,
          },
        });
      const old = device.modbusConfig;
      const history = old
        ? [
            ...(Array.isArray(old.history) ? old.history : []),
            {
              revision: old.revision,
              configuration: old.configuration,
              profile: old.profile,
            },
          ]
        : [];
      await tx.modbusConfiguration.upsert({
        where: { deviceId: device.id },
        create: {
          deviceId: device.id,
          tenantId,
          configuration: value.configuration,
          profile,
          state: "COMMISSIONING",
          step: 6,
        },
        update: {
          configuration: value.configuration,
          profile,
          history,
          revision: { increment: 1 },
          state: "COMMISSIONING",
          step: 6,
          pollingEnabled: false,
          reviewedRevision: null,
          confirmedUnitId: null,
          completedAt: null,
        },
      });
      await tx.gatewayCommand.updateMany({
        where: { deviceId: device.id, tenantId, status: "PENDING" },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    } else {
      if (!device?.modbusConfig || !device.gatewayId)
        throw new AccessError(
          409,
          "Zuerst ein Gateway und eine Modbus-Konfiguration speichern.",
        );
      const config = device.modbusConfig;
      if (value.operation === "COMMAND") {
        if (value.action !== "STOP") {
          if (config.state === "DISABLED")
            throw new AccessError(
              409,
              "Das Gerät ist deaktiviert. Zuerst neu konfigurieren.",
            );
          const profile = getProfile(
            modbusConfigSchema.parse(config.configuration).profileId,
          );
          if (!profile.verified)
            throw new AccessError(
              409,
              "Die Profilvorlage hat noch keine bestätigte Registerbelegung.",
            );
        }
        if (
          (await tx.gatewayCommand.count({
            where: {
              tenantId,
              deviceId: device.id,
              status: "PENDING",
              expiresAt: { gt: new Date() },
            },
          })) >= 5
        )
          throw new AccessError(
            429,
            "Bitte auf die offenen Gateway-Aktionen warten.",
          );
        const command = await tx.gatewayCommand.create({
          data: {
            tenantId,
            gatewayId: device.gatewayId,
            deviceId: device.id,
            action: value.action,
            revision: config.revision,
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorId: actor.id,
            action: `modbus.${value.action.toLowerCase()}`,
            entityId: device.id,
          },
        });
        return {
          commandId: command.id,
          message:
            "Aktion eingeplant. Das Gateway muss erreichbar sein; der Ausführungsstatus wird aktualisiert.",
        };
      }
      if (value.operation === "REVIEW") {
        if (
          value.revision !== config.revision ||
          device.diagnostic?.revision !== config.revision ||
          device.diagnostic.lastError ||
          !device.diagnostic.lastSuccessAt ||
          Date.now() - device.diagnostic.lastSuccessAt.getTime() > 300000
        )
          throw new AccessError(
            409,
            "Aktuelle erfolgreiche Messung dieser Konfiguration erforderlich.",
          );
        await tx.modbusConfiguration.update({
          where: { deviceId: device.id },
          data: { reviewedRevision: config.revision, step: 8 },
        });
      }
      if (value.operation === "ASSIGN") {
        if (config.reviewedRevision !== config.revision)
          throw new AccessError(409, "Zuerst Messwerte prüfen und bestätigen.");
        const unit = await tx.unit.findFirst({
          where: { id: value.unitId, tenantId },
          select: { id: true },
        });
        if (!unit)
          throw new AccessError(404, "Nutzungseinheit nicht gefunden.");
        if (
          unit.id !== meter.unitId &&
          ((await tx.reading.count({ where: { tenantId, meterId } })) > 0 ||
            (await tx.telemetrySample.count({
              where: { tenantId, device: { tenantId, meterId } },
            })) > 0)
        )
          throw new AccessError(
            409,
            "Zähler mit Messhistorie nicht umhängen. Zuordnung am vorhandenen Zähler bestätigen oder neuen Zähler anlegen.",
          );
        await tx.meter.update({
          where: { id: meterId },
          data: { unitId: unit.id },
        });
        await tx.modbusConfiguration.update({
          where: { deviceId: device.id },
          data: { confirmedUnitId: unit.id, step: 9 },
        });
      }
      if (value.operation === "COMPLETE") {
        if (
          config.reviewedRevision !== config.revision ||
          config.confirmedUnitId !== meter.unitId ||
          device.diagnostic?.lastError ||
          device.diagnostic?.revision !== config.revision ||
          !device.diagnostic?.lastSuccessAt ||
          Date.now() - device.diagnostic.lastSuccessAt.getTime() > 300000
        )
          throw new AccessError(
            409,
            "Aktuelle Messung und bestätigte Nutzungseinheit erforderlich.",
          );
        await tx.modbusConfiguration.update({
          where: { deviceId: device.id },
          data: { state: "ACTIVE", completedAt: new Date() },
        });
      }
      if (value.operation === "DISABLE") {
        await tx.modbusConfiguration.update({
          where: { deviceId: device.id },
          data: { state: "DISABLED", pollingEnabled: false },
        });
        await tx.device.update({
          where: { id: device.id },
          data: { status: "DISABLED" },
        });
      }
    }
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: `modbus.${value.operation.toLowerCase()}`,
        entityId: device!.id,
      },
    });
    return { message: "Gespeichert." };
  });
}
export const exportSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    metric: z.union([metricSchema, z.literal("consumption")]),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= 31 * 86400000,
    "Zeitraum muss größer als 0 und maximal 31 Tage sein.",
  );
export async function exportModbusCsv(
  meterId: string,
  raw: unknown,
  requested?: string | null,
) {
  const { tenantId, meter } = await access(meterId, requested);
  const value = exportSchema.parse(raw);
  const timestamp = { gte: new Date(value.from), lt: new Date(value.to) };
  let rows: string[][];
  if (value.metric === "consumption" || value.metric === "energyImport") {
    const readings = await db.reading.findMany({
      where: { tenantId, meterId, timestamp },
      select: {
        timestamp: true,
        registerValue: true,
        consumption: true,
        measurementUnit: true,
        source: true,
        quality: true,
      },
      orderBy: { timestamp: "asc" },
      take: 10001,
    });
    rows = readings.map((r) => [
      r.timestamp.toISOString(),
      meter.serialNumber,
      value.metric,
      (value.metric === "consumption"
        ? r.consumption
        : r.registerValue
      ).toString(),
      r.measurementUnit,
      r.source,
      r.quality,
    ]);
  } else {
    const measurements = await db.technicalMeasurement.findMany({
      where: {
        tenantId,
        metric: value.metric,
        sample: {
          tenantId,
          timestamp,
          error: null,
          device: { tenantId, meterId },
        },
      },
      select: {
        value: true,
        unit: true,
        sample: { select: { timestamp: true } },
      },
      orderBy: { sample: { timestamp: "asc" } },
      take: 10001,
    });
    rows = measurements.map((r) => [
      r.sample.timestamp.toISOString(),
      meter.serialNumber,
      value.metric,
      r.value.toString(),
      r.unit,
      "MQTT",
      "VALID",
    ]);
  }
  if (rows.length > 10000)
    throw new AccessError(
      413,
      "Mehr als 10.000 Werte. Bitte Zeitraum verkleinern.",
    );
  return csvDocument(
    [
      "Zeitstempel UTC",
      "Zähler",
      "Messgröße",
      "Wert",
      "Einheit",
      "Quelle",
      "Qualität",
    ],
    rows,
  );
}
