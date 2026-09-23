import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { db } from "./db";
import { tenantScope, type Actor } from "./policy";

export const resolutions = [
  "15m",
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;
export type AnalyticsResolution = (typeof resolutions)[number];
const inputSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    resolution: z.enum(resolutions),
    timezone: z.string().min(1).max(80).default("UTC"),
    meterId: z.string().optional(),
    propertyId: z.string().optional(),
    portfolio: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.to > v.from, { message: "Zeitraum ist ungültig." });

type Bucket = {
  key: string;
  start: Date;
  consumption: Decimal;
  values: Decimal[];
  cost: Decimal;
  count: number;
};
function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new z.ZodError([
      { code: "custom", path: ["timezone"], message: "Zeitzone ist ungültig." },
    ]);
  }
}
function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}
export function bucketKey(
  date: Date,
  resolution: AnalyticsResolution,
  timezone: string,
) {
  const p = localParts(date, timezone);
  const minute = Number(p.minute);
  if (resolution === "15m")
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${String(Math.floor(minute / 15) * 15).padStart(2, "0")}`;
  if (resolution === "hour")
    return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
  if (resolution === "day") return `${p.year}-${p.month}-${p.day}`;
  if (resolution === "month") return `${p.year}-${p.month}`;
  if (resolution === "year") return p.year;
  const utc = new Date(
    Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)),
  );
  const week = Math.ceil(
    ((utc.getTime() - Date.UTC(utc.getUTCFullYear(), 0, 1)) / 86400000 +
      utc.getUTCDay() +
      1) /
      7,
  );
  return `${p.year}-W${String(week).padStart(2, "0")}`;
}
function percentChange(current: Decimal, previous: Decimal) {
  return previous.isZero()
    ? null
    : current.minus(previous).div(previous).mul(100);
}

export async function analytics(
  actor: Actor,
  requested: string | null,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const input = inputSchema.parse(raw);
  const timezone = validTimezone(input.timezone);
  const meterScope = input.meterId
    ? { id: input.meterId }
    : input.propertyId
      ? { unit: { building: { propertyId: input.propertyId } } }
      : {};
  const meters = await db.meter.findMany({
    where: { tenantId, ...meterScope },
    select: {
      id: true,
      type: true,
      unit: {
        select: { area: true, building: { select: { propertyId: true } } },
      },
    },
  });
  const meterIds = meters.map((m) => m.id);
  const duration = input.to.getTime() - input.from.getTime();
  const previousFrom = new Date(input.from.getTime() - duration);
  const [readings, previousReadings, tariffs] = await Promise.all([
    db.reading.findMany({
      where: {
        tenantId,
        meterId: { in: meterIds },
        timestamp: { gte: input.from, lt: input.to },
        quality: { in: ["VALID", "ESTIMATED"] },
      },
      select: { meterId: true, timestamp: true, consumption: true },
      orderBy: { timestamp: "asc" },
    }),
    db.reading.findMany({
      where: {
        tenantId,
        meterId: { in: meterIds },
        timestamp: { gte: previousFrom, lt: input.from },
        quality: { in: ["VALID", "ESTIMATED"] },
      },
      select: { consumption: true },
    }),
    db.tariff.findMany({
      where: {
        tenantId,
        validFrom: { lt: input.to },
        OR: [{ validTo: null }, { validTo: { gt: input.from } }],
      },
      orderBy: { validFrom: "desc" },
    }),
  ]);
  const byKey = new Map<string, Bucket>();
  for (const row of readings) {
    const key = bucketKey(row.timestamp, input.resolution, timezone);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        start: row.timestamp,
        consumption: new Decimal(0),
        values: [],
        cost: new Decimal(0),
        count: 0,
      };
      byKey.set(key, bucket);
    }
    const value = new Decimal(row.consumption.toString());
    bucket.consumption = bucket.consumption.plus(value);
    bucket.values.push(value);
    bucket.count++;
    const meter = meters.find((m) => m.id === row.meterId);
    const tariff = tariffs.find(
      (t) =>
        (t.meterId === row.meterId || t.meterId === null) &&
        t.utility === meter?.type &&
        t.validFrom <= row.timestamp &&
        (!t.validTo || t.validTo > row.timestamp),
    );
    if (tariff)
      bucket.cost = bucket.cost.plus(value.mul(tariff.price.toString()));
  }
  const currentTotal = readings.reduce(
    (sum, r) => sum.plus(r.consumption.toString()),
    new Decimal(0),
  );
  const previousTotal = previousReadings.reduce(
    (sum, r) => sum.plus(r.consumption.toString()),
    new Decimal(0),
  );
  const values = readings.map((r) => new Decimal(r.consumption.toString()));
  const area = meters.reduce(
    (sum, m) => sum.plus(m.unit.area.toString()),
    new Decimal(0),
  );
  const rows = [...byKey.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((b) => ({
      period: b.key,
      from: b.start.toISOString(),
      consumption: b.consumption.toFixed(6),
      minimum: Decimal.min(...b.values).toFixed(6),
      maximum: Decimal.max(...b.values).toFixed(6),
      average: b.consumption.div(b.count).toFixed(6),
      peak: Decimal.max(...b.values).toFixed(6),
      baseLoad: Decimal.min(...b.values).toFixed(6),
      cost: b.cost.toFixed(6),
      samples: b.count,
    }));
  return {
    tenantId,
    timezone,
    resolution: input.resolution,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    meterCount: meters.length,
    meters: meters.map((m) => ({ id: m.id, type: m.type })),
    series: rows,
    totals: {
      consumption: currentTotal.toFixed(6),
      cost: rows.reduce((s, r) => s.plus(r.cost), new Decimal(0)).toFixed(6),
      minimum: values.length ? Decimal.min(...values).toFixed(6) : "0",
      maximum: values.length ? Decimal.max(...values).toFixed(6) : "0",
      average: values.length ? currentTotal.div(values.length).toFixed(6) : "0",
      peak: values.length ? Decimal.max(...values).toFixed(6) : "0",
      baseLoad: values.length ? Decimal.min(...values).toFixed(6) : "0",
      previousConsumption: previousTotal.toFixed(6),
      changePercent:
        percentChange(currentTotal, previousTotal)?.toFixed(6) ?? null,
      consumptionPerArea: area.isZero()
        ? null
        : currentTotal.div(area).toFixed(6),
    },
  };
}
