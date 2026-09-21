import "server-only";
import Decimal from "decimal.js";
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
  comparisonPeriods,
  decimalInput,
  timeProportionalCost,
  metrics,
  profiles,
  utilities,
  type MetricName,
} from "../lib/utility";
import { utilityConfigSchema } from "../lib/utility-alarms";
import { csvDocument } from "../lib/modbus/csv";

async function access(requested?: string | null, manage = false) {
  const actor = await requireActor();
  if (manage) requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  return {
    actor,
    tenantId,
    scope: {
      tenantId,
      unit: { building: { property: propertyScope(actor, tenantId) } },
    },
  };
}
export async function utilityReport(
  requested?: string | null,
  meterId?: string,
) {
  const { tenantId, scope } = await access(requested);
  const meters = await db.meter.findMany({
    where: { ...scope, ...(meterId ? { id: meterId } : {}) },
  });
  if (meterId && !meters.length)
    throw new AccessError(404, "Zähler nicht gefunden.");
  const now = new Date();
  const periods = comparisonPeriods(now);
  const tariffs = await db.tariff.findMany({
    where: { tenantId },
    orderBy: { validFrom: "desc" },
  });
  const results = [];
  for (const utility of utilities) {
    const selected = meters.filter((m) => m.type === utility);
    const ids = selected.map((m) => m.id);
    const unit = metrics[profiles[utility].primary].unit;
    const totals: Record<string, string> = {};
    for (const [key, [gte, lt]] of Object.entries(periods)) {
      const total = await db.reading.aggregate({
        where: {
          tenantId,
          meterId: { in: ids },
          timestamp: { gte, lt },
          quality: { in: ["VALID", "ESTIMATED"] },
        },
        _sum: { consumption: true },
      });
      totals[key] = total._sum.consumption?.toString() ?? "0";
    }
    let cost = new Decimal(0),
      complete = true;
    for (const meter of selected) {
      const own = tariffs.filter(
        (t) => t.utility === utility && t.meterId === meter.id,
      );
      const defaults = tariffs.filter(
        (t) => t.utility === utility && t.meterId === null,
      );
      const prices = [...own, ...defaults];
      const rows = await db.reading.findMany({
        where: {
          tenantId,
          meterId: meter.id,
          timestamp: { gte: periods.month[0], lt: now },
          quality: { in: ["VALID", "ESTIMATED"] },
        },
        select: { timestamp: true, consumption: true },
      });
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const intervalStart =
          index === 0 ? periods.month[0] : rows[index - 1].timestamp;
        const value = timeProportionalCost(
          row.consumption.toString(),
          unit,
          intervalStart,
          row.timestamp,
          prices.map((t) => ({
            ...t,
            price: t.price.toString(),
            basePerDay: t.basePerDay.toString(),
            condition: t.condition?.toString() ?? null,
            calorific: t.calorific?.toString() ?? null,
          })),
        );
        if (value === null) complete = false;
        else cost = cost.plus(value);
      }
      // Split base charges at every validity boundary; meter tariff takes precedence.
      const boundaries = [
        ...new Set([
          periods.month[0].getTime(),
          now.getTime(),
          ...prices
            .flatMap((t) => [
              t.validFrom.getTime(),
              t.validTo?.getTime() ?? now.getTime(),
            ])
            .filter((t) => t > periods.month[0].getTime() && t < now.getTime()),
        ]),
      ].sort((a, b) => a - b);
      for (let i = 0; i < boundaries.length - 1; i++) {
        const t = prices.find(
          (p) =>
            p.validFrom.getTime() <= boundaries[i] &&
            (!p.validTo || p.validTo.getTime() > boundaries[i]),
        );
        if (!t) {
          complete = false;
          continue;
        }
        cost = cost.plus(
          new Decimal(t.basePerDay.toString())
            .mul(boundaries[i + 1] - boundaries[i])
            .div(86400000),
        );
      }
    }
    const activeAlerts = await db.technicalAlert.count({
      where: {
        tenantId,
        entityId: { in: ids },
        kind: { startsWith: "UTILITY_", not: "UTILITY_OFFLINE" },
        active: true,
      },
    });
    const offline = selected.filter(
      (m) =>
        m.status !== "MAINTENANCE" &&
        (m.status === "OFFLINE" ||
          now.getTime() - (m.lastContact ?? m.installedAt).getTime() >
            utilityConfigSchema.parse(m.utilityConfig).offlineMinutes * 60000),
    ).length;
    const legacy = await db.alarm.count({
      where: { tenantId, meterId: { in: ids }, status: { not: "RESOLVED" } },
    });
    results.push({
      utility,
      label: profiles[utility].label,
      unit,
      meters: selected.length,
      totals,
      cost: complete ? cost.toFixed(2) : null,
      active: selected.filter(
        (m) =>
          m.status === "ACTIVE" &&
          m.lastContact &&
          now.getTime() - m.lastContact.getTime() <=
            utilityConfigSchema.parse(m.utilityConfig).offlineMinutes * 60000,
      ).length,
      offline,
      alarms: activeAlerts + legacy + offline,
    });
  }
  return {
    results,
    periods: Object.fromEntries(
      Object.entries(periods).map(([k, v]) => [
        k,
        v.map((d) => d.toISOString()),
      ]),
    ),
    timezone: "UTC",
  };
}
export async function utilityDetail(
  meterId: string,
  requested?: string | null,
) {
  const { tenantId, scope } = await access(requested);
  const meter = await db.meter.findFirst({ where: { ...scope, id: meterId } });
  if (!meter) throw new AccessError(404, "Zähler nicht gefunden.");
  const readings = await db.reading.findMany({
    where: { tenantId, meterId },
    orderBy: { timestamp: "desc" },
    take: 48,
    include: { measurements: true },
  });
  const latest = readings[0];
  const values = profiles[meter.type].metrics.map((metric) => {
    const row = latest?.measurements.find((m) => m.metric === metric);
    return {
      metric,
      label: metrics[metric].label,
      value:
        row?.value.toString() ??
        (metric === profiles[meter.type].primary
          ? latest?.registerValue.toString()
          : undefined) ??
        null,
      unit: metrics[metric].unit,
      quality: row?.quality ?? latest?.quality ?? null,
    };
  });
  const alerts = await db.technicalAlert.findMany({
    where: {
      tenantId,
      entityId: meterId,
      kind: { startsWith: "UTILITY_" },
      active: true,
    },
    select: { kind: true, openedAt: true },
  });
  const tariffs = await db.tariff.findMany({
    where: {
      tenantId,
      utility: meter.type,
      OR: [{ meterId }, { meterId: null }],
    },
    orderBy: { validFrom: "desc" },
    take: 100,
  });
  return {
    tariffs: tariffs.map((t) => ({
      id: t.id,
      scope: t.meterId ? "Zähler" : "Mandant",
      from: t.validFrom.toISOString(),
      to: t.validTo?.toISOString() ?? null,
      unit: t.unit,
      price: t.price.toString(),
      basePerDay: t.basePerDay.toString(),
      condition: t.condition?.toString() ?? null,
      calorific: t.calorific?.toString() ?? null,
    })),
    values,
    alerts,
    timestamp: latest?.timestamp.toISOString() ?? null,
    config: utilityConfigSchema.parse(meter.utilityConfig),
    report: await utilityReport(requested, meterId),
  };
}
const tariffSchema = z
  .object({
    meterId: z.string().min(1).optional(),
    utility: z.enum(utilities),
    validFrom: z.iso.datetime({ offset: true }),
    validTo: z.iso.datetime({ offset: true }).optional(),
    unit: z.enum(["kWh", "MWh", "m3"]),
    price: decimalInput,
    basePerDay: decimalInput.default("0"),
    condition: decimalInput.optional(),
    calorific: decimalInput.optional(),
  })
  .strict();
export async function createTariff(raw: unknown, requested?: string | null) {
  const { actor, tenantId, scope } = await access(requested, true);
  const input = tariffSchema.parse(raw);
  const allowed = {
    ELECTRICITY: ["kWh"],
    WATER: ["m3"],
    GAS: ["m3", "kWh"],
    HEAT: ["kWh", "MWh"],
  };
  if (
    !allowed[input.utility].includes(input.unit) ||
    new Decimal(input.price).lt(0) ||
    new Decimal(input.basePerDay).lt(0) ||
    (input.utility === "GAS" &&
      input.unit === "kWh" &&
      (!input.condition || !input.calorific)) ||
    [input.condition, input.calorific].some(
      (x) => x !== undefined && new Decimal(x).lte(0),
    )
  )
    throw new AccessError(400, "Ungültiger Tarif oder fehlende Gasfaktoren.");
  const validFrom = new Date(input.validFrom),
    validTo = input.validTo ? new Date(input.validTo) : null;
  if (validTo && validTo <= validFrom)
    throw new AccessError(400, "Ungültiger Tarifzeitraum.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${tenantId} FOR UPDATE`;
    if (
      input.meterId &&
      !(await tx.meter.findFirst({
        where: { ...scope, id: input.meterId, type: input.utility },
      }))
    )
      throw new AccessError(404, "Zähler nicht gefunden.");
    const conflicts = await tx.tariff.findMany({
      where: {
        tenantId,
        meterId: input.meterId ?? null,
        utility: input.utility,
        ...(validTo ? { validFrom: { lt: validTo } } : {}),
        OR: [{ validTo: null }, { validTo: { gt: validFrom } }],
      },
    });
    if (conflicts.length > 1)
      throw new AccessError(
        409,
        "Mehrere Tarifzeiträume überlappen den neuen Tarif.",
      );
    const conflict = conflicts[0];
    const applicable = await tx.tariff.count({
      where: {
        tenantId,
        utility: input.utility,
        OR: [{ meterId: input.meterId ?? null }, { meterId: null }],
      },
    });
    if (validFrom < new Date() && applicable > 0)
      throw new AccessError(
        409,
        "Tarifwechsel müssen in der Zukunft liegen; historische Preise bleiben unverändert.",
      );
    if (
      conflict &&
      conflict.validTo === null &&
      conflict.validFrom < validFrom &&
      validFrom > new Date()
    ) {
      await tx.tariff.update({
        where: { id: conflict.id },
        data: { validTo: validFrom },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: actor.id,
          action: "utility.tariff.close",
          entityId: conflict.id,
        },
      });
    } else if (conflict)
      throw new AccessError(
        409,
        "Tarifzeiträume dürfen sich nicht überschneiden. Bestehende Tarife bleiben unverändert.",
      );
    const tariff = await tx.tariff.create({
      data: { ...input, tenantId, validFrom, validTo },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "utility.tariff.create",
        entityId: tariff.id,
      },
    });
    return { id: tariff.id };
  });
}
export async function configureUtility(
  meterId: string,
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId, scope } = await access(requested, true);
  const config = utilityConfigSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const meter = await tx.meter.findFirst({
      where: { ...scope, id: meterId },
    });
    if (!meter) throw new AccessError(404, "Zähler nicht gefunden.");
    await tx.meter.update({
      where: { id: meterId },
      data: { utilityConfig: config },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "utility.configure",
        entityId: meterId,
      },
    });
    return { id: meterId };
  });
}
export async function exportUtilityCsv(
  meterId: string,
  raw: unknown,
  requested?: string | null,
) {
  const { tenantId, scope } = await access(requested);
  const input = z
    .object({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
    })
    .strict()
    .parse(raw);
  const from = new Date(input.from),
    to = new Date(input.to);
  if (to <= from || to.getTime() - from.getTime() > 31 * 86400000)
    throw new AccessError(400, "Zeitraum muss zwischen 0 und 31 Tagen liegen.");
  const meter = await db.meter.findFirst({ where: { ...scope, id: meterId } });
  if (!meter) throw new AccessError(404, "Zähler nicht gefunden.");
  const rows = await db.measurement.findMany({
    where: { tenantId, reading: { meterId, timestamp: { gte: from, lt: to } } },
    include: { reading: { select: { timestamp: true } } },
    orderBy: { reading: { timestamp: "asc" } },
    take: 10001,
  });
  if (rows.length > 10000)
    throw new AccessError(400, "Zu viele Messwerte. Zeitraum verkürzen.");
  return csvDocument(
    [
      "Medium",
      "Zähler",
      "Messgröße",
      "Von UTC",
      "Bis UTC (exklusiv)",
      "Rohwert",
      "Roheinheit",
      "Normalisierter Wert",
      "Einheit",
      "Qualität",
      "Zeitstempel UTC",
    ],
    rows.map((r) => [
      meter.type,
      meter.serialNumber,
      metrics[r.metric as MetricName]?.label ?? r.metric,
      from.toISOString(),
      to.toISOString(),
      r.rawValue.toString(),
      r.rawUnit,
      r.value.toString(),
      r.unit,
      r.quality,
      r.reading.timestamp.toISOString(),
    ]),
  );
}
