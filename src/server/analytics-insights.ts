import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { db } from "./db";
import { AccessError, requireManage, tenantScope, type Actor } from "./policy";

const insightInput = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    timezone: z.string().default("UTC"),
    meterId: z.string().optional(),
    propertyId: z.string().optional(),
  })
  .strict()
  .refine((v) => v.to > v.from);
type Point = { timestamp: Date; value: Decimal };
export type Anomaly = {
  tenantId: string;
  meterId: string;
  propertyId: string;
  medium: string;
  from: string;
  to: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  measuredValue: string;
  expectedValue: string;
  deviationPercent: string | null;
  description: string;
  detectedAt: string;
  status: "OPEN";
};

function localHour(date: Date, timezone: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
}
function deviation(value: Decimal, expected: Decimal) {
  return expected.isZero()
    ? null
    : value.minus(expected).div(expected).mul(100);
}
export function anomalyFor(
  tenantId: string,
  meter: { id: string; type: string; propertyId: string },
  points: Point[],
  historical: Point[],
  from: Date,
  to: Date,
  timezone: string,
): Anomaly[] {
  if (!points.length)
    return [
      {
        tenantId,
        meterId: meter.id,
        propertyId: meter.propertyId,
        medium: meter.type,
        from: from.toISOString(),
        to: to.toISOString(),
        type: "MISSING_DATA",
        severity: "WARNING",
        measuredValue: "0",
        expectedValue: "0",
        deviationPercent: null,
        description:
          "Im Zeitraum wurden keine verwertbaren Messwerte gefunden.",
        detectedAt: new Date().toISOString(),
        status: "OPEN",
      },
    ];
  const avg = (values: Point[]) =>
    values.length
      ? values
          .reduce((s, p) => s.plus(p.value), new Decimal(0))
          .div(values.length)
      : new Decimal(0);
  const historicalAverage = avg(historical);
  const previous = avg(
    historical.filter(
      (p) =>
        p.timestamp >=
        new Date(from.getTime() - (to.getTime() - from.getTime())),
    ),
  );
  const result: Anomaly[] = [];
  const add = (
    type: string,
    severity: Anomaly["severity"],
    value: Decimal,
    expected: Decimal,
    description: string,
  ) =>
    result.push({
      tenantId,
      meterId: meter.id,
      propertyId: meter.propertyId,
      medium: meter.type,
      from: from.toISOString(),
      to: to.toISOString(),
      type,
      severity,
      measuredValue: value.toFixed(6),
      expectedValue: expected.toFixed(6),
      deviationPercent: deviation(value, expected)?.toFixed(6) ?? null,
      description,
      detectedAt: new Date().toISOString(),
      status: "OPEN",
    });
  const max = points.reduce((m, p) => Decimal.max(m, p.value), new Decimal(0));
  const base = avg(points.filter((p) => p.value.gt(0)));
  if (historicalAverage.gt(0) && max.gt(historicalAverage.mul(2)))
    add(
      "CONSUMPTION_PEAK",
      "WARNING",
      max,
      historicalAverage,
      "Verbrauchsspitze liegt deutlich über dem historischen Durchschnitt.",
    );
  if (historicalAverage.gt(0) && base.gt(historicalAverage.mul(1.5)))
    add(
      "HIGH_BASE_LOAD",
      "WARNING",
      base,
      historicalAverage,
      "Grundlast liegt dauerhaft über dem historischen Niveau.",
    );
  const night = points.filter((p) => {
    const h = localHour(p.timestamp, timezone);
    return h < 6 || h >= 23;
  });
  const nightValue = avg(night);
  if (night.length && nightValue.gt(historicalAverage.mul(1.5)))
    add(
      meter.type === "WATER" ? "WATER_LEAK_INDICATOR" : "NIGHT_CONSUMPTION",
      meter.type === "WATER" ? "CRITICAL" : "WARNING",
      nightValue,
      historicalAverage,
      "Nachtverbrauch ist ungewöhnlich hoch.",
    );
  if (
    previous.gt(0) &&
    historicalAverage.gt(0) &&
    previous.gt(historicalAverage.mul(1.3))
  )
    add(
      "SUDDEN_CHANGE",
      "WARNING",
      previous,
      historicalAverage,
      "Verbrauch hat sich gegenüber dem Vergleichszeitraum deutlich erhöht.",
    );
  if (historicalAverage.gt(0) && avg(points).gt(historicalAverage.mul(1.25)))
    add(
      "PERSISTENTLY_ELEVATED",
      "WARNING",
      avg(points),
      historicalAverage,
      "Verbrauch bleibt über dem historischen Normalbereich.",
    );
  const distinct = new Set(points.map((p) => p.value.toFixed(6))).size;
  if (points.length >= 6 && distinct === 1 && points[0].value.gt(0))
    add(
      "CONSTANT_CONSUMPTION",
      "INFO",
      points[0].value,
      historicalAverage,
      "Über längere Zeit wurde ein konstanter Verbrauch gemessen.",
    );
  if (historicalAverage.gt(0) && max.gt(historicalAverage.mul(1.5)))
    add(
      "OUTSIDE_HISTORICAL_RANGE",
      "INFO",
      max,
      historicalAverage,
      "Messwert liegt außerhalb des historischen Normalbereichs.",
    );
  return result;
}

export async function anomalies(
  actor: Actor,
  requested: string | null,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const input = insightInput.parse(raw);
  const scope = input.meterId
    ? { id: input.meterId }
    : input.propertyId
      ? { unit: { building: { propertyId: input.propertyId } } }
      : {};
  const meters = await db.meter.findMany({
    where: { tenantId, ...scope },
    select: {
      id: true,
      type: true,
      unit: { select: { building: { select: { propertyId: true } } } },
    },
  });
  const ids = meters.map((m) => m.id);
  const historyFrom = new Date(input.from.getTime() - 30 * 86400000);
  const rows = await db.reading.findMany({
    where: {
      tenantId,
      meterId: { in: ids },
      timestamp: { gte: historyFrom, lt: input.to },
      quality: { in: ["VALID", "ESTIMATED"] },
    },
    select: { meterId: true, timestamp: true, consumption: true },
    orderBy: { timestamp: "asc" },
  });
  return {
    tenantId,
    timezone: input.timezone,
    anomalies: meters.flatMap((meter) =>
      anomalyFor(
        tenantId,
        {
          id: meter.id,
          type: meter.type,
          propertyId: meter.unit.building.propertyId,
        },
        rows
          .filter((r) => r.meterId === meter.id && r.timestamp >= input.from)
          .map((r) => ({
            timestamp: r.timestamp,
            value: new Decimal(r.consumption.toString()),
          })),
        rows
          .filter((r) => r.meterId === meter.id && r.timestamp < input.from)
          .map((r) => ({
            timestamp: r.timestamp,
            value: new Decimal(r.consumption.toString()),
          })),
        input.from,
        input.to,
        input.timezone,
      ),
    ),
  };
}

export async function benchmarks(
  actor: Actor,
  requested: string | null,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const input = insightInput.parse(raw);
  const meters = await db.meter.findMany({
    where: { tenantId },
    select: {
      id: true,
      type: true,
      unit: {
        select: {
          area: true,
          building: { select: { id: true, propertyId: true } },
        },
      },
    },
  });
  const rows = await db.reading.findMany({
    where: {
      tenantId,
      meterId: { in: meters.map((m) => m.id) },
      timestamp: { gte: input.from, lt: input.to },
      quality: { in: ["VALID", "ESTIMATED"] },
    },
    select: { meterId: true, consumption: true },
  });
  const result = meters
    .map((meter) => {
      const total = rows
        .filter((r) => r.meterId === meter.id)
        .reduce((s, r) => s.plus(r.consumption.toString()), new Decimal(0));
      return {
        meterId: meter.id,
        propertyId: meter.unit.building.propertyId,
        buildingId: meter.unit.building.id,
        medium: meter.type,
        consumption: total.toFixed(6),
        consumptionPerArea: meter.unit.area.gt(0)
          ? total.div(meter.unit.area.toString()).toFixed(6)
          : null,
      };
    })
    .sort((a, b) => Number(b.consumption) - Number(a.consumption));
  return {
    tenantId,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    ranking: result,
    byMedium: Object.groupBy(result, (r) => r.medium),
  };
}

export async function persistDetectedAnomalies(
  actor: Actor,
  requested: string | null,
  raw: unknown,
) {
  requireManage(actor);
  const result = await anomalies(actor, requested, raw);
  for (const item of result.anomalies) {
    const fingerprint = [item.meterId, item.type, item.from, item.to].join(":");
    await db.analyticsAnomaly.upsert({
      where: {
        tenantId_fingerprint: { tenantId: result.tenantId, fingerprint },
      },
      create: {
        tenantId: result.tenantId,
        meterId: item.meterId,
        propertyId: item.propertyId,
        medium: item.medium as never,
        type: item.type,
        severity: item.severity,
        windowFrom: new Date(item.from),
        windowTo: new Date(item.to),
        measuredValue: item.measuredValue,
        expectedValue: item.expectedValue,
        deviationPercent: item.deviationPercent,
        description: item.description,
        fingerprint,
      },
      update: {
        measuredValue: item.measuredValue,
        expectedValue: item.expectedValue,
        deviationPercent: item.deviationPercent,
        description: item.description,
        severity: item.severity,
      },
    });
  }
  return listAnomalies(actor, requested, { status: "OPEN" });
}
export async function listAnomalies(
  actor: Actor,
  requested: string | null,
  raw: unknown = {},
) {
  const tenantId = tenantScope(actor, requested);
  const status = z
    .enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"])
    .optional()
    .parse((raw as { status?: unknown }).status);
  const rows = await db.analyticsAnomaly.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
    orderBy: { detectedAt: "desc" },
    take: 500,
  });
  return rows.map((row) => ({
    ...row,
    measuredValue: row.measuredValue.toString(),
    expectedValue: row.expectedValue.toString(),
    deviationPercent: row.deviationPercent?.toString() ?? null,
    windowFrom: row.windowFrom.toISOString(),
    windowTo: row.windowTo.toISOString(),
    detectedAt: row.detectedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  }));
}
export async function updateAnomaly(
  actor: Actor,
  requested: string | null,
  id: string,
  raw: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
      comment: z.string().trim().max(2000).optional(),
    })
    .strict()
    .parse(raw);
  const updated = await db.analyticsAnomaly.updateMany({
    where: { id, tenantId },
    data: {
      status: value.status,
      comment: value.comment,
      ...(value.status === "ACKNOWLEDGED"
        ? { acknowledgedAt: new Date() }
        : {}),
      ...(value.status === "RESOLVED" || value.status === "DISMISSED"
        ? { resolvedAt: new Date() }
        : {}),
    },
  });
  if (!updated.count) throw new AccessError(404, "Anomalie nicht gefunden.");
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: `analytics.anomaly.${value.status.toLowerCase()}`,
      entityId: id,
      details: { comment: value.comment ?? null },
    },
  });
  return { id, status: value.status };
}
