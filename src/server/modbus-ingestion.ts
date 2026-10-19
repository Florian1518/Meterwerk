import "server-only";
import { modbusMetrics } from "./utility-measurements";
import { normalize } from "../lib/utility";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import {
  controlRequestSchema,
  telemetrySchema,
  modbusConfigSchema,
  profileSchema,
  diagnosticStatus,
  offlineAfter,
} from "../lib/modbus/contracts";
import { decodeRegister } from "../../apps/edge-gateway/src/registers";
import { enqueueWebhookEvent } from "./webhooks";
type Tx = Prisma.TransactionClient;
export async function acceptTelemetry(
  tx: Tx,
  tenantId: string,
  gatewayId: string,
  raw: unknown,
) {
  const value = telemetrySchema.parse(raw);
  if (Date.parse(value.timestamp) > Date.now() + 30000)
    throw new Error("Future telemetry");
  await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id"=${value.deviceId} AND "tenantId"=${tenantId} FOR UPDATE`;
  const device = await tx.device.findFirst({
    where: { id: value.deviceId, tenantId, gatewayId },
    include: { modbusConfig: true, diagnostic: true },
  });
  if (!device?.modbusConfig) throw new Error("Unassigned device");
  if (device.lifecycleStatus === "DECOMMISSIONED")
    throw new Error("Decommissioned device");
  const prior = await tx.telemetrySample.findUnique({
    where: {
      tenantId_deviceId_messageId: {
        tenantId,
        deviceId: device.id,
        messageId: value.messageId,
      },
    },
  });
  if (prior) return { gatewayId, messageId: value.messageId, duplicate: true };
  const config = device.modbusConfig;
  const snapshot =
    config.revision === value.revision
      ? config
      : z
          .array(
            z.object({
              revision: z.number(),
              configuration: z.unknown(),
              profile: z.unknown(),
            }),
          )
          .parse(config.history)
          .find((s) => s.revision === value.revision);
  if (!snapshot) throw new Error("Unknown configuration revision");
  const profile = profileSchema.parse(snapshot.profile);
  const connection = modbusConfigSchema.parse(snapshot.configuration);
  if (!value.error) {
    if (
      value.values.length !== profile.registers.length ||
      new Set(value.values.map((v) => v.metric)).size !== value.values.length
    )
      throw new Error("Incomplete telemetry");
    for (const item of value.values) {
      const r = profile.registers.find((r) => r.metric === item.metric);
      if (
        !r ||
        r.address !== item.register ||
        r.unit !== item.unit ||
        decodeRegister(Buffer.from(item.raw, "hex"), r) !== item.value
      )
        throw new Error("Invalid measurement");
    }
  }
  const timestamp = new Date(value.timestamp);
  const sample = await tx.telemetrySample.create({
    data: {
      tenantId,
      deviceId: device.id,
      messageId: value.messageId,
      timestamp,
      revision: value.revision,
      error: value.error,
    },
  });
  if (!value.error) {
    await tx.technicalMeasurement.createMany({
      data: value.values.map((item) => ({
        tenantId,
        sampleId: sample.id,
        metric: item.metric,
        value: item.value,
        unit: item.unit,
      })),
    });
    const energy = value.values.find((v) => v.metric === "energyImport");
    if (energy) {
      const before = await tx.reading.findFirst({
        where: {
          tenantId,
          meterId: device.meterId,
          timestamp: { lt: timestamp },
        },
        orderBy: { timestamp: "desc" },
        select: { registerValue: true },
      });
      const after = await tx.reading.findFirst({
        where: {
          tenantId,
          meterId: device.meterId,
          timestamp: { gt: timestamp },
        },
        orderBy: { timestamp: "asc" },
        select: { id: true },
      });
      const register = new Prisma.Decimal(energy.value);
      const monotonic = !before || register.gte(before.registerValue);
      const reading = await tx.reading.create({
        data: {
          tenantId,
          meterId: device.meterId,
          deviceId: device.id,
          messageId: value.messageId,
          timestamp,
          registerValue: register,
          meterValue: register,
          consumption:
            before && monotonic && !after
              ? register.sub(before.registerValue)
              : "0",
          measurementUnit: "kWh",
          source: "MQTT",
          quality: monotonic && !after ? "VALID" : "SUSPECT",
        },
      });
      await enqueueWebhookEvent(tx, tenantId, "meter.reading.received", {
        readingId: reading.id,
        meterId: device.meterId,
        timestamp: reading.timestamp.toISOString(),
        value: reading.registerValue.toString(),
        consumption: reading.consumption.toString(),
        unit: reading.measurementUnit,
      });
      await tx.measurement.createMany({
        data: value.values.map((item) => ({
          ...normalize("ELECTRICITY", {
            metric: modbusMetrics[item.metric],
            value: item.value,
            unit: item.unit,
            quality: reading.quality,
          }),
          tenantId,
          readingId: reading.id,
        })),
      });
    }
  }
  if (
    value.revision === config.revision &&
    (!device.diagnostic?.lastPollAt || timestamp > device.diagnostic.lastPollAt)
  ) {
    const consecutive = value.error
      ? (device.diagnostic?.consecutiveErrors ?? 0) + 1
      : 0;
    const status =
      Date.now() - timestamp.getTime() > offlineAfter(connection)
        ? "OFFLINE"
        : diagnosticStatus(value.error, consecutive);
    const active = config.state !== "DISABLED";
    await tx.modbusDiagnostic.upsert({
      where: { deviceId: device.id },
      create: {
        tenantId,
        deviceId: device.id,
        lastPollAt: timestamp,
        lastSuccessAt: value.error ? null : timestamp,
        responseMs: value.responseMs,
        lastError: value.error,
        successes: value.error ? 0 : 1,
        errors: value.error ? 1 : 0,
        consecutiveErrors: consecutive,
        revision: value.revision,
        raw: value.values,
      },
      update: {
        lastPollAt: timestamp,
        ...(!value.error ? { lastSuccessAt: timestamp } : {}),
        responseMs: value.responseMs,
        lastError: value.error,
        successes: { increment: value.error ? 0 : 1 },
        errors: { increment: value.error ? 1 : 0 },
        consecutiveErrors: consecutive,
        revision: value.revision,
        raw: value.values,
      },
    });
    if (active) {
      await tx.device.update({
        where: { id: device.id },
        data: { status, ...(!value.error ? { lastSeenAt: timestamp } : {}) },
      });
      await tx.meter.update({
        where: { id: device.meterId },
        data: {
          status: status === "OFFLINE" ? "OFFLINE" : "ACTIVE",
          ...(!value.error ? { lastContact: timestamp } : {}),
        },
      });
      if (status === "OFFLINE" && device.status !== "OFFLINE")
        await enqueueWebhookEvent(tx, tenantId, "meter.offline", {
          meterId: device.meterId,
          deviceId: device.id,
        });
      else if (status !== "OFFLINE" && device.status !== "ONLINE")
        await enqueueWebhookEvent(tx, tenantId, "meter.online", {
          meterId: device.meterId,
          deviceId: device.id,
        });
      if (value.error)
        await tx.modbusConfiguration.update({
          where: { deviceId: device.id },
          data: { state: "FAULT" },
        });
      else if (config.state === "FAULT")
        await tx.modbusConfiguration.update({
          where: { deviceId: device.id },
          data: { state: config.completedAt ? "ACTIVE" : "COMMISSIONING" },
        });
    }
  }
  await tx.auditEvent.create({
    data: {
      tenantId,
      actorId: gatewayId,
      action: value.error ? "modbus.poll.failed" : "modbus.poll.succeeded",
      entityId: device.id,
    },
  });
  return { gatewayId, messageId: value.messageId, duplicate: false };
}
export async function gatewayControl(
  tx: Tx,
  tenantId: string,
  gatewayId: string,
  raw: unknown,
) {
  const request = controlRequestSchema.parse(raw);
  if (Math.abs(Date.now() - Date.parse(request.timestamp)) > 30000)
    throw new Error("Stale control request");
  for (const result of request.results) {
    const command = await tx.gatewayCommand.findFirst({
      where: {
        id: result.id,
        tenantId,
        gatewayId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (!command) continue;
    const config = await tx.modbusConfiguration.findFirst({
      where: {
        deviceId: command.deviceId,
        tenantId,
        revision: command.revision,
      },
    });
    if (!config) continue;
    await tx.gatewayCommand.update({
      where: { id: command.id },
      data: {
        status: result.ok ? "SUCCEEDED" : "FAILED",
        error: result.error,
        completedAt: new Date(),
      },
    });
    if (result.ok && ["START", "STOP"].includes(command.action))
      await tx.modbusConfiguration.update({
        where: { deviceId: command.deviceId },
        data: {
          pollingEnabled:
            command.action === "START" && config.state !== "DISABLED",
        },
      });
    if (result.ok && command.action === "TEST" && config.step < 7)
      await tx.modbusConfiguration.update({
        where: { deviceId: command.deviceId },
        data: { step: 7 },
      });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: gatewayId,
        action: "modbus.command.result",
        entityId: command.id,
      },
    });
  }
  await tx.gatewayCommand.updateMany({
    where: {
      tenantId,
      gatewayId,
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED", error: "TIMEOUT", completedAt: new Date() },
  });
  const devices = await tx.device.findMany({
    where: { tenantId, gatewayId, modbusConfig: { isNot: null } },
    take: 32,
    select: { id: true, modbusConfig: true },
  });
  const commands = await tx.gatewayCommand.findMany({
    where: {
      tenantId,
      gatewayId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      deviceId: true,
      action: true,
      revision: true,
      expiresAt: true,
    },
  });
  return {
    gatewayId,
    control: {
      requestId: request.requestId,
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      devices: devices.map((d) => ({
        deviceId: d.id,
        revision: d.modbusConfig!.revision,
        configuration: modbusConfigSchema.parse(d.modbusConfig!.configuration),
        profile: profileSchema.parse(d.modbusConfig!.profile),
        enabled:
          d.modbusConfig!.pollingEnabled &&
          d.modbusConfig!.state !== "DISABLED",
        disabled: d.modbusConfig!.state === "DISABLED",
      })),
      commands,
      acknowledged: request.results.map((r) => r.id),
    },
  };
}
