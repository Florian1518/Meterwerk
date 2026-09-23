import "server-only";
import Decimal from "decimal.js";
import { db } from "./db";
import { enqueueWebhookEvent } from "./webhooks";
import { emitRuleEvent } from "./rules";
import { authenticateDevice, consumeDeviceRateLimit } from "./device-auth";
import { AccessError } from "./policy";
import { normalize, profiles, utilityPayload } from "../lib/utility";
import {
  evaluateUtilityAlarms,
  utilityConfigSchema,
} from "../lib/utility-alarms";

// Device credentials determine both tenant and meter; payloads cannot supply IDs.
export async function ingestUtility(
  authorization: string | null,
  raw: unknown,
  correlationId?: string,
) {
  const { device, credential } = await authenticateDevice(authorization);
  await consumeDeviceRateLimit(credential.id);
  const payload = utilityPayload.parse(raw);
  const timestamp = new Date(payload.timestamp);
  if (timestamp.getTime() > Date.now() + 300000)
    throw new AccessError(400, "Zeitstempel liegt in der Zukunft.");
  const rows = payload.measurements.map((m) => {
    try {
      return normalize(device.meter.type, m);
    } catch {
      throw new AccessError(
        400,
        "Messgröße, Einheit oder Wertebereich passt nicht zum Zählerprofil.",
      );
    }
  });
  if (new Set(rows.map((m) => m.metric)).size !== rows.length)
    throw new AccessError(400, "Doppelte Messgröße.");
  const primary = rows.find(
    (m) => m.metric === profiles[device.meter.type].primary,
  );
  if (!primary) throw new AccessError(400, "Primärer Zählerstand fehlt.");
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${device.tenantId} FOR UPDATE`;
    const active = await tx.deviceCredential.findFirst({
      where: {
        id: credential.id,
        status: "ACTIVE",
        device: { status: { in: ["ONLINE", "WARNING", "OFFLINE"] } },
      },
    });
    if (!active) throw new AccessError(403, "Credential nicht mehr aktiv.");
    const existing = await tx.reading.findFirst({
      where: {
        tenantId: device.tenantId,
        deviceId: device.id,
        messageId: payload.messageId,
      },
    });
    if (existing) return { id: existing.id, duplicate: true };
    const previous = await tx.reading.findFirst({
      where: { tenantId: device.tenantId, meterId: device.meterId },
      orderBy: { timestamp: "desc" },
    });
    const historical = !!previous && timestamp <= previous.timestamp;
    let consumption = new Decimal(0);
    if (
      previous &&
      !historical &&
      ["VALID", "ESTIMATED"].includes(primary.quality) &&
      ["VALID", "ESTIMATED"].includes(previous.quality)
    ) {
      consumption = new Decimal(primary.value).minus(
        previous.registerValue.toString(),
      );
      if (consumption.lt(0)) {
        primary.quality = "SUSPECT";
        consumption = new Decimal(0);
      }
    }
    if (historical) primary.quality = "SUSPECT";
    const reading = await tx.reading.create({
      data: {
        tenantId: device.tenantId,
        meterId: device.meterId,
        deviceId: device.id,
        messageId: payload.messageId,
        timestamp,
        registerValue: Decimal.max(0, primary.value).toFixed(6),
        meterValue: Decimal.max(0, primary.value).toFixed(6),
        consumption: consumption.toFixed(6),
        measurementUnit: device.meter.measurementUnit,
        source: "REST",
        quality: primary.quality,
      },
    });
    await enqueueWebhookEvent(tx, device.tenantId, "meter.reading.received", {
      readingId: reading.id,
      meterId: device.meterId,
      timestamp: reading.timestamp.toISOString(),
      value: reading.registerValue.toString(),
      consumption: reading.consumption.toString(),
      unit: reading.measurementUnit,
    });
    await tx.measurement.createMany({
      data: rows.map((row) => ({
        ...row,
        tenantId: device.tenantId,
        readingId: reading.id,
      })),
    });
    const recent = !historical && Date.now() - timestamp.getTime() < 3600000;
    if (recent) {
      await tx.device.update({
        where: { id: device.id },
        data: { lastSeenAt: timestamp, status: "ONLINE" },
      });
      await tx.meter.update({
        where: { id: device.meterId },
        data: { lastContact: timestamp, status: "ACTIVE" },
      });
      if (device.status !== "ONLINE")
        await enqueueWebhookEvent(tx, device.tenantId, "meter.online", {
          meterId: device.meterId,
          deviceId: device.id,
        });
      const config = utilityConfigSchema.parse(device.meter.utilityConfig);
      const start = new Date(
        timestamp.getTime() - config.continuousHours * 3600000,
      );
      const history = await tx.measurement.findMany({
        where: {
          tenantId: device.tenantId,
          metric: "FLOW_RATE",
          reading: {
            meterId: device.meterId,
            timestamp: { gte: start, lte: timestamp },
          },
        },
        include: { reading: { select: { timestamp: true } } },
        orderBy: { reading: { timestamp: "asc" } },
        take: 10000,
      });
      const continuous =
        history.length >= 3 &&
        history[0].reading.timestamp.getTime() <= start.getTime() + 900000 &&
        history.every(
          (h, i) =>
            h.quality === "VALID" &&
            new Decimal(h.value.toString()).gt(config.minimumFlow) &&
            (!i ||
              h.reading.timestamp.getTime() -
                history[i - 1].reading.timestamp.getTime() <=
                1800000),
        );
      const conditions = evaluateUtilityAlarms(
        device.meter.type,
        Object.fromEntries(
          rows
            .filter((r) => r.quality === "VALID")
            .map((r) => [r.metric, r.value]),
        ),
        config,
        consumption.toString(),
        continuous,
        rows.some((r) => r.quality === "INVALID"),
        rows.some((r) => r.quality === "SUSPECT"),
      );
      const flow = rows.find(
        (r) => r.metric === "FLOW_RATE" && r.quality === "VALID",
      );
      if (
        device.meter.type === "HEAT" &&
        previous &&
        previous.quality === "VALID" &&
        primary.quality === "VALID" &&
        new Decimal(previous.consumption.toString()).eq(0) &&
        consumption.eq(0) &&
        flow &&
        new Decimal(flow.value).gt(config.minimumFlow)
      )
        conditions.QUALITY_WARNING = true;
      if (
        !config.allowReverse &&
        previous &&
        new Decimal(primary.value).lt(previous.registerValue.toString())
      )
        conditions.REVERSE_FLOW = true;
      for (const [kind, active] of Object.entries(conditions)) {
        const where = {
          tenantId_kind_entityId: {
            tenantId: device.tenantId,
            kind: `UTILITY_${kind}`,
            entityId: device.meterId,
          },
        };
        const old = await tx.technicalAlert.findUnique({ where });
        if ((!old && !active) || old?.active === active) continue;
        await tx.technicalAlert.upsert({
          where,
          create: {
            tenantId: device.tenantId,
            kind: `UTILITY_${kind}`,
            entityId: device.meterId,
            active,
          },
          update: {
            active,
            resolvedAt: active ? null : new Date(),
            ...(active
              ? { openedAt: new Date(), occurrences: { increment: 1 } }
              : {}),
          },
        });
      }
    }
    await tx.auditEvent.create({
      data: {
        tenantId: device.tenantId,
        actorId: device.id,
        action: "utility.ingest",
        entityId: reading.id,
        correlationId,
      },
    });
    return { id: reading.id, duplicate: false };
  });
  if (!result.duplicate) {
    try {
      await emitRuleEvent(device.tenantId, {
        trigger: "READING_CREATED",
        eventKey: `reading:${result.id}`,
        correlationId: correlationId ?? payload.messageId,
        occurredAt: timestamp,
      });
    } catch (error) {
      console.error(
        "Rules event failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return result;
}
