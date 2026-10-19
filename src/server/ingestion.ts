import "server-only";
import { z } from "zod";
import { db } from "./db";
import { AccessError } from "./policy";
import { recordPrimaryMeasurement } from "./utility-measurements";
import type { Device } from "@/generated/prisma/client";
import { enqueueWebhookEvent } from "./webhooks";
import { emitRuleEvent } from "./rules";
export const readingPayload = z
  .object({
    messageId: z.string().trim().min(1).max(160),
    timestamp: z.iso.datetime({ offset: true }),
    value: z.number().finite().nonnegative(),
    consumption: z.number().finite().nonnegative().optional(),
    unit: z.enum(["kWh", "m³"]),
    quality: z
      .enum(["VALID", "ESTIMATED", "INVALID", "SUSPECT"])
      .default("VALID"),
    source: z.enum(["REST"]).default("REST"),
  })
  .strict();
const futureLimit = 5 * 60_000;
export async function ingestReading(
  device: Device & { meter: { measurementUnit: string } },
  raw: unknown,
) {
  const value = readingPayload.parse(raw);
  const timestamp = new Date(value.timestamp);
  if (timestamp.getTime() > Date.now() + futureLimit)
    throw new AccessError(400, "Zeitstempel liegt zu weit in der Zukunft.");
  if (value.unit !== device.meter.measurementUnit)
    throw new AccessError(
      409,
      "Einheit passt nicht zum konfigurierten Zähler.",
    );
  const existing = await db.reading.findFirst({
    where: {
      tenantId: device.tenantId,
      deviceId: device.id,
      messageId: value.messageId,
    },
    select: { id: true },
  });
  if (existing) return { duplicate: true, id: existing.id };
  const previous = await db.reading.findFirst({
    where: {
      tenantId: device.tenantId,
      meterId: device.meterId,
      timestamp: { lt: timestamp },
    },
    orderBy: { timestamp: "desc" },
    select: { registerValue: true },
  });
  if (previous && value.value < Number(previous.registerValue))
    throw new AccessError(
      400,
      "Zählerstand darf nicht kleiner als der vorherige Stand sein.",
    );
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id"=${device.id} AND "tenantId"=${device.tenantId} FOR UPDATE`;
    const current = await tx.device.findFirst({
      where: { id: device.id, tenantId: device.tenantId },
    });
    if (
      !current ||
      current.lifecycleStatus === "DECOMMISSIONED" ||
      current.status === "DISABLED"
    )
      throw new AccessError(403, "Device ist deaktiviert.");
    const created = await tx.reading.create({
      data: {
        tenantId: device.tenantId,
        meterId: device.meterId,
        deviceId: device.id,
        messageId: value.messageId,
        timestamp,
        registerValue: value.value,
        meterValue: value.value,
        consumption: value.consumption ?? 0,
        measurementUnit: value.unit,
        quality: value.quality,
        source: "REST",
        receivedAt: new Date(),
      },
    });
    await enqueueWebhookEvent(tx, device.tenantId, "meter.reading.received", {
      readingId: created.id,
      meterId: device.meterId,
      timestamp: created.timestamp.toISOString(),
      value: created.registerValue.toString(),
      consumption: created.consumption.toString(),
      unit: created.measurementUnit,
    });
    await recordPrimaryMeasurement(tx, created);
    await tx.auditEvent.create({
      data: {
        tenantId: device.tenantId,
        actorId: device.id,
        action: "reading.ingest",
        entityId: created.id,
      },
    });
    await tx.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), status: "ONLINE" },
    });
    if (device.status !== "ONLINE")
      await enqueueWebhookEvent(tx, device.tenantId, "meter.online", {
        meterId: device.meterId,
        deviceId: device.id,
      });
    await tx.meter.update({
      where: { id: device.meterId },
      data: { lastContact: new Date() },
    });
    return created;
  });
  try {
    await emitRuleEvent(device.tenantId, {
      trigger: "READING_CREATED",
      eventKey: `reading:${row.id}`,
      correlationId: value.messageId,
      occurredAt: row.timestamp,
      meter: {
        id: device.meterId,
        propertyId: "",
        type: device.meter.measurementUnit,
        status: "ACTIVE",
        lastContact: row.timestamp,
        installedAt: row.timestamp,
      },
      reading: {
        consumption: row.consumption.toString(),
        registerValue: row.registerValue.toString(),
        meterValue: row.meterValue?.toString() ?? null,
        timestamp: row.timestamp,
      },
    });
  } catch (error) {
    console.error(
      "Rules event failed",
      error instanceof Error ? error.message : error,
    );
  }
  return { duplicate: false, id: row.id };
}
