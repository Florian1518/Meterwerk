import "server-only";
import { db } from "./db";
import { propertyScope, tenantScope, type Actor } from "./policy";
import type { MeterType } from "@/generated/prisma/client";
export const typeLabels = {
  ELECTRICITY: "Strom",
  WATER: "Wasser",
  GAS: "Gas",
  HEAT: "Wärme",
};
export async function dashboard(
  actor: Actor,
  requested: string | null | undefined,
  type: MeterType,
) {
  const tenantId = tenantScope(actor, requested);
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previous = new Date(
    Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1),
  );
  const previousEnd = new Date(
    Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1),
  );
  const chartStart = new Date(today.getTime() - 29 * 86400000);
  const property = propertyScope(actor, tenantId);
  const scope = { tenantId, unit: { building: { property } } };
  const selected = { ...scope, type };
  const valid = {
    tenantId,
    meter: selected,
    quality: { not: "INVALID" as const },
  };
  const [
    meters,
    totals,
    todayTotal,
    monthTotal,
    previousTotal,
    series,
    alarms,
    typeTotals,
  ] = await Promise.all([
    db.meter.findMany({
      where: selected,
      include: {
        unit: { include: { building: { include: { property: true } } } },
        devices: {
          where: { tenantId },
          orderBy: { lastSeenAt: "desc" },
          take: 1,
          select: {
            status: true,
            lastSeenAt: true,
            protocol: true,
            gateway: { select: { name: true, status: true } },
          },
        },
        readings: {
          where: { tenantId },
          orderBy: { timestamp: "desc" },
          take: 1,
          select: { timestamp: true },
        },
      },
    }),
    db.reading.groupBy({
      by: ["meterId"],
      where: { ...valid, timestamp: { gte: month, lte: now } },
      _sum: { consumption: true },
    }),
    db.reading.aggregate({
      where: { ...valid, timestamp: { gte: today, lte: now } },
      _sum: { consumption: true },
    }),
    db.reading.aggregate({
      where: { ...valid, timestamp: { gte: month, lte: now } },
      _sum: { consumption: true },
    }),
    db.reading.aggregate({
      where: { ...valid, timestamp: { gte: previous, lt: previousEnd } },
      _sum: { consumption: true },
    }),
    db.reading.findMany({
      where: { ...valid, timestamp: { gte: chartStart, lte: now } },
      select: { timestamp: true, consumption: true, source: true },
    }),
    db.alarm.findMany({
      where: { tenantId, meter: scope, status: { not: "RESOLVED" } },
      include: { meter: { select: { serialNumber: true, type: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    Promise.all(
      Object.keys(typeLabels).map(async (key) => {
        const total = await db.reading.aggregate({
          where: {
            tenantId,
            meter: { ...scope, type: key as MeterType },
            quality: { not: "INVALID" },
            timestamp: { gte: month, lte: now },
          },
          _sum: { consumption: true },
        });
        return {
          type: key as MeterType,
          value: Number(total._sum.consumption ?? 0),
        };
      }),
    ),
  ]);
  const byDay = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(chartStart.getTime() + i * 86400000)
      .toISOString()
      .slice(0, 10),
    value: 0,
  }));
  const dayMap = new Map(byDay.map((day) => [day.date, day]));
  for (const row of series) {
    const day = dayMap.get(row.timestamp.toISOString().slice(0, 10));
    if (day) day.value += Number(row.consumption);
  }
  const meterTotals = new Map(
    totals.map((row) => [row.meterId, Number(row._sum.consumption ?? 0)]),
  );
  const properties = new Map<
    string,
    { name: string; city: string; value: number; meters: number }
  >();
  let cost = 0;
  for (const meter of meters) {
    const p = meter.unit.building.property;
    const value = meterTotals.get(meter.id) ?? 0;
    const entry = properties.get(p.id) ?? {
      name: p.name,
      city: p.city,
      value: 0,
      meters: 0,
    };
    entry.value += value;
    entry.meters++;
    properties.set(p.id, entry);
    cost += value * Number(meter.demoPricePerUnit);
  }
  const alarmCount = await db.alarm.count({
    where: { tenantId, meter: scope, status: { not: "RESOLVED" } },
  });
  const lastDataReceived = meters.reduce<Date | null>((latest, meter) => {
    const value =
      meter.readings[0]?.timestamp ?? meter.devices[0]?.lastSeenAt ?? null;
    return value && (!latest || value > latest) ? value : latest;
  }, null);
  const hasActualData = series.some((row) => row.source !== "DEMO");
  return {
    edgeDevices: meters
      .filter((m) => m.devices[0]?.gateway)
      .map((m) => ({
        serialNumber: m.serialNumber,
        status: m.devices[0].status,
        gateway: m.devices[0].gateway!,
        lastSeenAt: m.devices[0].lastSeenAt,
      })),
    today: Number(todayTotal._sum.consumption ?? 0),
    month: Number(monthTotal._sum.consumption ?? 0),
    previous: Number(previousTotal._sum.consumption ?? 0),
    cost,
    byDay,
    properties: [...properties.values()],
    meters: meters.length,
    active: meters.filter(
      (m) =>
        (m.devices[0]?.status ??
          (m.status === "ACTIVE" ? "ONLINE" : m.status)) === "ONLINE",
    ).length,
    offline: meters.filter(
      (m) => (m.devices[0]?.status ?? m.status) === "OFFLINE",
    ).length,
    lastDataReceived,
    hasActualData,
    alarms,
    alarmCount,
    typeTotals,
    unit: ["WATER", "GAS"].includes(type) ? "m³" : "kWh",
  };
}
