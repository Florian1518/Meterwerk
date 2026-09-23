import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { db } from "./db";
import { tenantScope, type Actor } from "./policy";

const schema = z
  .object({
    asOf: z.coerce.date().default(() => new Date()),
    horizon: z.enum(["day", "week", "month"]),
    meterId: z.string().optional(),
  })
  .strict();
export function forecastValues(
  values: string[],
  horizon: "day" | "week" | "month",
) {
  if (values.length < 7)
    return {
      status: "insufficient_data" as const,
      confidence: "low" as const,
      consumption: null,
      cost: null,
    };
  const recent = values.slice(-7).map((v) => new Decimal(v));
  const avg = recent
    .reduce((s, v) => s.plus(v), new Decimal(0))
    .div(recent.length);
  const first = new Decimal(
    values[Math.max(0, values.length - 14)] ?? values[0],
  );
  const last = new Decimal(values[values.length - 1]);
  const trend = last.minus(first).div(Math.max(1, values.length - 1));
  const multiplier = horizon === "day" ? 1 : horizon === "week" ? 7 : 30;
  const result = avg.plus(trend.mul(multiplier / 2)).mul(multiplier);
  return {
    status: "ok" as const,
    confidence: values.length >= 30 ? ("high" as const) : ("medium" as const),
    consumption: Decimal.max(0, result).toFixed(6),
    cost: null,
  };
}
export async function forecast(
  actor: Actor,
  requested: string | null,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const input = schema.parse(raw);
  const meters = await db.meter.findMany({
    where: { tenantId, ...(input.meterId ? { id: input.meterId } : {}) },
    select: { id: true, type: true },
  });
  const since = new Date(input.asOf.getTime() - 90 * 86400000);
  const rows = await db.reading.findMany({
    where: {
      tenantId,
      meterId: { in: meters.map((m) => m.id) },
      timestamp: { gte: since, lte: input.asOf },
      quality: { in: ["VALID", "ESTIMATED"] },
    },
    select: { meterId: true, consumption: true },
    orderBy: { timestamp: "asc" },
  });
  const output = meters.map((meter) => ({
    meterId: meter.id,
    medium: meter.type,
    ...forecastValues(
      rows
        .filter((r) => r.meterId === meter.id)
        .map((r) => r.consumption.toString()),
      input.horizon,
    ),
  }));
  return {
    tenantId,
    asOf: input.asOf.toISOString(),
    horizon: input.horizon,
    forecasts: output,
  };
}
