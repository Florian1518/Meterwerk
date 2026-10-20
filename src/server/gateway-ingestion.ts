import "server-only";
import { recordPrimaryMeasurement } from "./utility-measurements";
import { z } from "zod";
import { db } from "./db";
import { Prisma } from "../generated/prisma/client";
import { acceptTelemetry, gatewayControl } from "./modbus-ingestion";
import { modbusConfigSchema, offlineAfter } from "../lib/modbus/contracts";
import {
  envelopeSchema,
  verifyMessage,
} from "../../apps/edge-gateway/src/wire";
import { enqueueWebhookEvent } from "./webhooks";

const decimal = z.string().regex(/^\d{1,14}(\.\d{1,6})?$/);
const reading = z
  .object({
    messageId: z.string().min(1).max(160),
    deviceId: z.string().min(1),
    timestamp: z.iso.datetime(),
    value: decimal,
    consumption: decimal,
    unit: z.literal("kWh"),
    source: z.literal("MQTT"),
    quality: z.literal("VALID"),
  })
  .strict();
const heartbeat = z
  .object({
    gatewayId: z.string(),
    timestamp: z.iso.datetime(),
    agentVersion: z.string().max(80),
    uptime: z.number().int().nonnegative(),
    connectedDevices: z.number().int().nonnegative(),
    queueSize: z.number().int().nonnegative(),
    queueWarning: z.boolean().optional(),
    quarantineSize: z.number().int().nonnegative().optional(),
    queueDropped: z.number().int().nonnegative().optional(),
  })
  .strict();

export async function ingestGatewayMessage(topic: string, payload: Buffer) {
  if (payload.length > 16384) throw new Error("Payload too large");
  const match =
    /^meterwerk\/v1\/gateways\/([A-Za-z0-9_-]+)\/(readings|heartbeat|telemetry|control)$/.exec(
      topic,
    );
  if (!match) throw new Error("Invalid topic");
  const envelope = envelopeSchema.parse(JSON.parse(payload.toString()));
  return db.$transaction(async (tx) => {
    const topicGatewayId = match[1];
    await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "id"=${topicGatewayId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "GatewayCredential" WHERE "id"=${envelope.credentialId} FOR SHARE`;
    const credential = await tx.gatewayCredential.findUnique({
      where: { id: envelope.credentialId },
      include: { gateway: true },
    });
    if (
      !credential ||
      credential.gateway.lifecycleStatus === "DECOMMISSIONED" ||
      credential.status !== "ACTIVE" ||
      (credential.expiresAt !== null && credential.expiresAt <= new Date()) ||
      credential.gatewayId !== match[1] ||
      ["DISABLED", "MAINTENANCE"].includes(credential.gateway.status) ||
      !verifyMessage(topic, envelope, credential.publicKey)
    )
      throw new Error("Invalid gateway credential or topic");
    const { tenantId, gatewayId } = credential;
    await tx.gatewayCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });
    const raw: unknown = JSON.parse(envelope.body);
    if (match[2] === "telemetry")
      return acceptTelemetry(tx, tenantId, gatewayId, raw);
    if (match[2] === "control")
      return gatewayControl(tx, tenantId, gatewayId, raw);
    if (match[2] === "heartbeat") {
      const value = heartbeat.parse(raw);
      if (
        value.gatewayId !== gatewayId ||
        Math.abs(Date.now() - Date.parse(value.timestamp)) > 30000
      )
        throw new Error("Invalid heartbeat identity or time");
      if (
        credential.gateway.lastSeenAt &&
        Date.parse(value.timestamp) <= credential.gateway.lastSeenAt.getTime()
      )
        return null;
      await tx.gateway.update({
        where: { id: gatewayId },
        data: {
          lastSeenAt: new Date(value.timestamp),
          ...(!credential.gateway.firstContactAt
            ? { firstContactAt: new Date() }
            : {}),
          status: "ONLINE",
          firmwareVersion: value.agentVersion,
          queueSize: value.queueSize,
          queueWarning: value.queueWarning ?? value.queueSize >= 1000,
          quarantineSize: value.quarantineSize ?? 0,
          queueDropped: value.queueDropped ?? 0,
        },
      });
      if (credential.gateway.status !== "ONLINE")
        await enqueueWebhookEvent(tx, tenantId, "gateway.online", {
          gatewayId,
          lastSeenAt: value.timestamp,
        });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: gatewayId,
          action: "gateway.heartbeat",
          entityId: gatewayId,
          createdAt: new Date(),
        },
      });
      return null;
    }
    const value = reading.parse(raw);
    await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id"=${value.deviceId} AND "tenantId"=${tenantId} FOR UPDATE`;
    const device = await tx.device.findFirst({
      where: { id: value.deviceId, gatewayId, tenantId },
      include: { meter: true },
    });
    if (
      !device ||
      device.lifecycleStatus === "DECOMMISSIONED" ||
      ["DISABLED", "MAINTENANCE"].includes(device.status) ||
      device.meter.measurementUnit !== value.unit
    )
      throw new Error("Invalid device or unit");
    const duplicate = await tx.reading.findUnique({
      where: {
        tenantId_deviceId_messageId: {
          tenantId,
          deviceId: device.id,
          messageId: value.messageId,
        },
      },
      select: { id: true },
    });
    if (duplicate)
      return { gatewayId, messageId: value.messageId, duplicate: true };
    const timestamp = new Date(value.timestamp);
    if (timestamp.getTime() > Date.now() + 30000)
      throw new Error("Future timestamp");
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
      select: { registerValue: true },
    });
    const register = new Prisma.Decimal(value.value);
    if (
      (before && register.lt(before.registerValue)) ||
      (after && register.gt(after.registerValue))
    )
      throw new Error("Nonmonotonic register");
    const createdReading = await tx.reading.create({
      data: {
        tenantId,
        meterId: device.meterId,
        deviceId: device.id,
        messageId: value.messageId,
        timestamp,
        registerValue: register,
        meterValue: register,
        consumption: value.consumption,
        measurementUnit: value.unit,
        source: "MQTT",
        quality: "VALID",
      },
    });
    await enqueueWebhookEvent(tx, tenantId, "meter.reading.received", {
      readingId: createdReading.id,
      meterId: device.meterId,
      timestamp: createdReading.timestamp.toISOString(),
      value: createdReading.registerValue.toString(),
      consumption: createdReading.consumption.toString(),
      unit: createdReading.measurementUnit,
    });
    await recordPrimaryMeasurement(tx, createdReading);
    // Historical queue replay must not make a currently disconnected device ONLINE.
    if (!device.lastSeenAt || timestamp > device.lastSeenAt) {
      const online = Date.now() - timestamp.getTime() < 15000;
      await tx.device.update({
        where: { id: device.id },
        data: { lastSeenAt: timestamp, status: online ? "ONLINE" : "OFFLINE" },
      });
      await tx.meter.update({
        where: { id: device.meterId },
        data: { lastContact: timestamp, status: online ? "ACTIVE" : "OFFLINE" },
      });
      if (online && device.status !== "ONLINE")
        await enqueueWebhookEvent(tx, tenantId, "meter.online", {
          meterId: device.meterId,
          deviceId: device.id,
        });
    }
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: gatewayId,
        action: "gateway.reading",
        entityId: device.id,
      },
    });
    return { gatewayId, messageId: value.messageId, duplicate: false };
  });
}

export async function detectOffline() {
  const cutoff = new Date(Date.now() - 15000);
  await db.$transaction(async (tx) => {
    const gateways = await tx.gateway.findMany({
      where: { status: "ONLINE", lastSeenAt: { lt: cutoff } },
      select: { id: true, tenantId: true },
    });
    for (const g of gateways) {
      const changed = await tx.gateway.updateMany({
        where: { ...g, status: "ONLINE", lastSeenAt: { lt: cutoff } },
        data: { status: "OFFLINE" },
      });
      if (changed.count) {
        await enqueueWebhookEvent(tx, g.tenantId, "gateway.offline", {
          gatewayId: g.id,
        });
        await tx.auditEvent.create({
          data: {
            tenantId: g.tenantId,
            actorId: "offline-worker",
            action: "gateway.offline",
            entityId: g.id,
          },
        });
      }
    }
    const devices = await tx.device.findMany({
      where: {
        gatewayId: { not: null },
        modbusConfig: { is: null },
        status: "ONLINE",
        lastSeenAt: { lt: cutoff },
      },
      select: { id: true, tenantId: true, meterId: true },
    });
    for (const d of devices) {
      const changed = await tx.device.updateMany({
        where: {
          id: d.id,
          tenantId: d.tenantId,
          status: "ONLINE",
          lastSeenAt: { lt: cutoff },
        },
        data: { status: "OFFLINE" },
      });
      if (changed.count) {
        await tx.meter.updateMany({
          where: { id: d.meterId, tenantId: d.tenantId },
          data: { status: "OFFLINE" },
        });
        await enqueueWebhookEvent(tx, d.tenantId, "meter.offline", {
          meterId: d.meterId,
          deviceId: d.id,
        });
        await tx.auditEvent.create({
          data: {
            tenantId: d.tenantId,
            actorId: "offline-worker",
            action: "device.offline",
            entityId: d.id,
          },
        });
      }
    }
    const managed = await tx.device.findMany({
      where: {
        status: { in: ["ONLINE", "WARNING"] },
        modbusConfig: { isNot: null },
      },
      include: { modbusConfig: true, diagnostic: true },
    });
    for (const d of managed) {
      const config = modbusConfigSchema.parse(d.modbusConfig!.configuration);
      const last = d.diagnostic?.lastPollAt ?? d.lastSeenAt;
      if (last && Date.now() - last.getTime() > offlineAfter(config)) {
        const changed = await tx.device.updateMany({
          where: {
            id: d.id,
            tenantId: d.tenantId,
            status: { in: ["ONLINE", "WARNING"] },
            lastSeenAt: d.lastSeenAt,
          },
          data: { status: "OFFLINE" },
        });
        if (changed.count) {
          await tx.meter.update({
            where: { id: d.meterId },
            data: { status: "OFFLINE" },
          });
          await enqueueWebhookEvent(tx, d.tenantId, "meter.offline", {
            meterId: d.meterId,
            deviceId: d.id,
          });
          await tx.auditEvent.create({
            data: {
              tenantId: d.tenantId,
              actorId: "offline-worker",
              action: "modbus.offline",
              entityId: d.id,
            },
          });
        }
      }
    }
  });
}
