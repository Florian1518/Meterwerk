import "server-only";
import { recordTenantUsage } from "./licensing";
import { enqueueWebhookEvent } from "./webhooks";
import { emitRuleEvent } from "./rules";
import Decimal from "decimal.js";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, propertyScope, tenantScope, type Actor } from "./policy";
import { comparisonPeriods, utilities, profiles, metrics } from "@/lib/utility";
import { csvDocument } from "@/lib/modbus/csv";
import { utilityReport } from "./utility";
import type { MeterType, ReportType } from "@/generated/prisma/client";
import { requireFeature } from "./licensing";

const filterSchema = z.object({
  propertyId: z.string().min(1).optional(),
  buildingId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
  meterId: z.string().min(1).optional(),
  utility: z.enum(utilities).optional(),
});

async function access(requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  return { actor, tenantId };
}

function meterWhere(
  tenantId: string,
  actor: Actor,
  filters: z.infer<typeof filterSchema>,
) {
  return {
    tenantId,
    ...(filters.meterId ? { id: filters.meterId } : {}),
    ...(filters.utility ? { type: filters.utility } : {}),
    unit: {
      ...(filters.unitId ? { id: filters.unitId } : {}),
      building: {
        ...(filters.buildingId ? { id: filters.buildingId } : {}),
        property: {
          ...(filters.propertyId ? { id: filters.propertyId } : {}),
          ...propertyScope(actor, tenantId),
        },
      },
    },
  };
}

export async function portfolio(requested?: string | null) {
  const { actor, tenantId } = await access(requested);
  const where = meterWhere(tenantId, actor, {});
  const [properties, buildings, units, meters, alarms, rows] =
    await Promise.all([
      db.property.count({ where: propertyScope(actor, tenantId) }),
      db.building.count({
        where: { tenantId, property: propertyScope(actor, tenantId) },
      }),
      db.unit.count({
        where: {
          tenantId,
          building: { property: { ...propertyScope(actor, tenantId) } },
        },
      }),
      db.meter.findMany({
        where,
        select: {
          id: true,
          type: true,
          status: true,
          serialNumber: true,
          unit: {
            select: {
              name: true,
              building: {
                select: { name: true, property: { select: { name: true } } },
              },
            },
          },
        },
      }),
      db.alarm.count({
        where: { tenantId, meter: { ...where }, status: { not: "RESOLVED" } },
      }),
      db.reading.findMany({
        where: {
          tenantId,
          meter: where,
          quality: { in: ["VALID", "ESTIMATED"] },
        },
        select: { meterId: true, consumption: true, timestamp: true },
      }),
    ]);
  const periods = comparisonPeriods(new Date());
  const costReport = await utilityReport(tenantId);
  const costs = new Map(
    costReport.results.map((result) => [result.utility, result.cost]),
  );
  const byUtility = await Promise.all(
    utilities.map(async (utility) => {
      const meterIds = meters
        .filter((m) => m.type === utility)
        .map((m) => m.id);
      const [month, year, previousYear] = await Promise.all([
        db.reading.aggregate({
          where: {
            tenantId,
            meterId: { in: meterIds },
            timestamp: { gte: periods.month[0], lt: periods.month[1] },
            quality: { in: ["VALID", "ESTIMATED"] },
          },
          _sum: { consumption: true },
        }),
        db.reading.aggregate({
          where: {
            tenantId,
            meterId: { in: meterIds },
            timestamp: { gte: periods.year[0], lt: periods.year[1] },
            quality: { in: ["VALID", "ESTIMATED"] },
          },
          _sum: { consumption: true },
        }),
        db.reading.aggregate({
          where: {
            tenantId,
            meterId: { in: meterIds },
            timestamp: {
              gte: periods.previousYear[0],
              lt: periods.previousYear[1],
            },
            quality: { in: ["VALID", "ESTIMATED"] },
          },
          _sum: { consumption: true },
        }),
      ]);
      const monthValue = Number(month._sum.consumption ?? 0);
      const previousValue = Number(previousYear._sum.consumption ?? 0);
      return {
        utility,
        label: profiles[utility].label,
        unit: metrics[profiles[utility].primary].unit,
        meters: meterIds.length,
        month: monthValue,
        year: Number(year._sum.consumption ?? 0),
        cost: costs.get(utility) ?? null,
        previousYear: previousValue,
        changePercent: previousValue
          ? ((monthValue - previousValue) / previousValue) * 100
          : null,
      };
    }),
  );
  const largest = [...rows]
    .sort((a, b) => Number(b.consumption) - Number(a.consumption))
    .slice(0, 5)
    .map((row) => ({
      meterId: row.meterId,
      value: row.consumption.toString(),
      timestamp: row.timestamp.toISOString(),
    }));
  return {
    counts: {
      properties,
      buildings,
      units,
      meters: meters.length,
      active: meters.filter((m) => m.status === "ACTIVE").length,
      offline: meters.filter((m) => m.status === "OFFLINE").length,
      alarms,
    },
    byUtility,
    largest,
  };
}

export async function propertyPortfolio(
  propertyId: string,
  requested?: string | null,
) {
  const { actor, tenantId } = await access(requested);
  const property = await db.property.findFirst({
    where: { id: propertyId, ...propertyScope(actor, tenantId) },
    include: {
      buildings: {
        include: {
          units: {
            include: {
              meters: { select: { id: true, type: true, status: true } },
            },
          },
        },
      },
    },
  });
  if (!property) throw new AccessError(404, "Liegenschaft nicht gefunden.");
  const meterIds = property.buildings.flatMap((b) =>
    b.units.flatMap((u) => u.meters.map((m) => m.id)),
  );
  const periods = comparisonPeriods(new Date());
  const utility = await Promise.all(
    utilities.map(async (type) => {
      const ids = property.buildings.flatMap((b) =>
        b.units.flatMap((u) =>
          u.meters.filter((m) => m.type === type).map((m) => m.id),
        ),
      );
      const [today, month, previous] = await Promise.all([
        db.reading.aggregate({
          where: {
            tenantId,
            meterId: { in: ids },
            timestamp: { gte: periods.today[0], lt: periods.today[1] },
            quality: { in: ["VALID", "ESTIMATED"] },
          },
          _sum: { consumption: true },
        }),
        db.reading.aggregate({
          where: {
            tenantId,
            meterId: { in: ids },
            timestamp: { gte: periods.month[0], lt: periods.month[1] },
            quality: { in: ["VALID", "ESTIMATED"] },
          },
          _sum: { consumption: true },
        }),
        db.reading.aggregate({
          where: {
            tenantId,
            meterId: { in: ids },
            timestamp: {
              gte: periods.previousMonth[0],
              lt: periods.previousMonth[1],
            },
            quality: { in: ["VALID", "ESTIMATED"] },
          },
          _sum: { consumption: true },
        }),
      ]);
      return {
        type,
        unit: metrics[profiles[type].primary].unit,
        today: Number(today._sum.consumption ?? 0),
        month: Number(month._sum.consumption ?? 0),
        previousMonth: Number(previous._sum.consumption ?? 0),
        meters: ids.length,
      };
    }),
  );
  return { property, meterIds, utility };
}

function periodFilter(period: { from: Date; to: Date }) {
  if (period.to <= period.from)
    throw new AccessError(400, "Ungültiger Zeitraum.");
  return { timestamp: { gte: period.from, lt: period.to } };
}

export async function benchmark(
  requested?: string | null,
  filters: unknown = {},
) {
  const { actor, tenantId } = await access(requested);
  await requireFeature(actor, "ANALYTICS", tenantId);
  const parsed = filterSchema.parse(filters);
  const meters = await db.meter.findMany({
    where: meterWhere(tenantId, actor, parsed),
    select: {
      id: true,
      type: true,
      unit: {
        select: {
          id: true,
          name: true,
          area: true,
          building: {
            select: {
              id: true,
              name: true,
              property: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  const from = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  );
  const to = new Date();
  const grouped = new Map<
    string,
    {
      key: string;
      label: string;
      utility: MeterType;
      area: Decimal;
      value: Decimal;
      meters: number;
    }
  >();
  for (const meter of meters) {
    const total = await db.reading.aggregate({
      where: {
        tenantId,
        meterId: meter.id,
        timestamp: { gte: from, lt: to },
        quality: { in: ["VALID", "ESTIMATED"] },
      },
      _sum: { consumption: true },
    });
    const key = meter.unit.building.id;
    const current = grouped.get(key) ?? {
      key,
      label: meter.unit.building.name,
      utility: meter.type,
      area: new Decimal(0),
      value: new Decimal(0),
      meters: 0,
    };
    current.area = current.area.plus(meter.unit.area);
    current.value = current.value.plus(total._sum.consumption?.toString() ?? 0);
    current.meters++;
    grouped.set(key, current);
  }
  return [...grouped.values()].map((r) => ({
    ...r,
    area: r.area.toString(),
    value: r.value.toString(),
    perArea: r.area.isZero() ? null : r.value.div(r.area).toString(),
  }));
}

const reportInput = z.object({
  type: z.enum([
    "MONTHLY",
    "YEARLY",
    "CONSUMPTION",
    "COST",
    "METER_STATUS",
    "ALARM",
    "PROPERTY",
  ]),
  title: z.string().min(1).max(160),
  from: z.coerce.date(),
  to: z.coerce.date(),
  filters: filterSchema.default({}),
});
export async function createReport(input: unknown, requested?: string | null) {
  const { actor, tenantId } = await access(requested);
  await requireFeature(actor, "REPORTING", tenantId);
  const value = reportInput.parse(input);
  const where = meterWhere(tenantId, actor, value.filters);
  const meters = await db.meter.findMany({
    where,
    select: {
      id: true,
      serialNumber: true,
      type: true,
      measurementUnit: true,
      status: true,
    },
  });
  const readings = await db.reading.findMany({
    where: { tenantId, meter: where, ...periodFilter(value) },
    orderBy: { timestamp: "asc" },
    select: {
      meterId: true,
      timestamp: true,
      registerValue: true,
      consumption: true,
      measurementUnit: true,
      quality: true,
    },
  });
  const content = {
    meterCount: meters.length,
    readingCount: readings.length,
    meters,
    readings: readings.map((r) => ({
      ...r,
      registerValue: r.registerValue.toString(),
      consumption: r.consumption.toString(),
      timestamp: r.timestamp.toISOString(),
    })),
  };
  const report = await db.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        tenantId,
        createdById: actor.id,
        type: value.type as ReportType,
        title: value.title,
        periodFrom: value.from,
        periodTo: value.to,
        filters: value.filters,
        content,
      },
    });
    await enqueueWebhookEvent(tx, tenantId, "report.ready", {
      reportId: created.id,
      type: created.type,
      title: created.title,
      periodFrom: created.periodFrom.toISOString(),
      periodTo: created.periodTo.toISOString(),
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "report.created",
        entityId: created.id,
      },
    });
    return created;
  });
  return {
    id: report.id,
    title: report.title,
    type: report.type,
    periodFrom: report.periodFrom.toISOString(),
    periodTo: report.periodTo.toISOString(),
    readingCount: readings.length,
  };
}

export async function listReports(requested?: string | null) {
  const { actor, tenantId } = await access(requested);
  await requireFeature(actor, "REPORTING", tenantId);
  return db.report.findMany({
    where: {
      tenantId,
      createdBy: actor.role === "USER" ? { id: actor.id } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      type: true,
      periodFrom: true,
      periodTo: true,
      createdAt: true,
      status: true,
    },
  });
}

export async function reportExport(
  id: string,
  format: "csv" | "pdf",
  requested?: string | null,
) {
  const { actor, tenantId } = await access(requested);
  await requireFeature(actor, "ADVANCED_EXPORTS", tenantId);
  const report = await db.report.findFirst({
    where: {
      id,
      tenantId,
      ...(actor.role === "USER" ? { createdById: actor.id } : {}),
    },
  });
  if (!report) throw new AccessError(404, "Bericht nicht gefunden.");
  await recordTenantUsage(tenantId, "EXPORT");
  const content = report.content as {
    readings?: Array<Record<string, string>>;
  };
  if (format === "csv") {
    const rows = (content.readings ?? []).map((r) => [
      r.meterId,
      r.timestamp,
      r.registerValue,
      r.consumption,
      r.measurementUnit,
      r.quality,
    ]);
    return {
      body: csvDocument(
        [
          "Zähler",
          "Zeitstempel",
          "Rohwert",
          "Verbrauch",
          "Einheit",
          "Qualität",
        ],
        rows,
      ),
      contentType: "text/csv; charset=utf-8",
      fileName: `${report.title}.csv`,
    };
  }
  const lines = [
    `Meterwerk · ${report.title}`,
    `Zeitraum: ${report.periodFrom.toISOString()} – ${report.periodTo.toISOString()}`,
    `Erstellt: ${report.createdAt.toISOString()}`,
    `Messwerte: ${(content.readings ?? []).length}`,
    "Verbrauchs- und Kostenanalyse, keine rechtsverbindliche Abrechnung.",
  ];
  const text = lines.join("\\n");
  const stream = `BT /F1 12 Tf 50 780 Td (${text.replaceAll(/[()\\]/g, "")}) Tj ET`;
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  return {
    body: pdf,
    contentType: "application/pdf",
    fileName: `${report.title}.pdf`,
  };
}

export async function setAlarmStatus(
  id: string,
  status: "ACKNOWLEDGED" | "RESOLVED",
  comment?: string,
  requested?: string | null,
) {
  const { actor, tenantId } = await access(requested);
  if (actor.role === "USER")
    throw new AccessError(403, "Keine Berechtigung für Alarmänderungen.");
  const alarm = await db.alarm.findFirst({
    where: {
      id,
      tenantId,
      meter: {
        unit: { building: { property: propertyScope(actor, tenantId) } },
      },
    },
  });
  if (!alarm) throw new AccessError(404, "Alarm nicht gefunden.");
  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.alarm.update({
      where: { id },
      data: {
        status,
        comment: comment?.trim() || undefined,
        ...(status === "ACKNOWLEDGED"
          ? { acknowledgedAt: now, acknowledgedBy: actor.id }
          : { resolvedAt: now, resolvedBy: actor.id }),
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: `alarm.${status.toLowerCase()}`,
        entityId: id,
      },
    });
    if (alarm.status !== status)
      await enqueueWebhookEvent(
        tx,
        tenantId,
        status === "ACKNOWLEDGED" ? "alarm.acknowledged" : "alarm.resolved",
        { alarmId: id, meterId: alarm.meterId, status },
      );
    return result;
  });
  if (alarm.status !== status) {
    try {
      await emitRuleEvent(tenantId, {
        trigger: "ALARM_STATUS_CHANGED",
        eventKey: `alarm:${id}:${status}`,
        correlationId: id,
        alarm: { id, status, meterId: alarm.meterId },
      });
    } catch (error) {
      console.error(
        "Rules event failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return { id: updated.id, status: updated.status };
}

export async function addNote(input: unknown, requested?: string | null) {
  const { actor, tenantId } = await access(requested);
  const value = z
    .object({
      targetType: z.enum(["ALARM", "METER", "GATEWAY", "PROPERTY"]),
      entityId: z.string().min(1),
      text: z.string().trim().min(1).max(4000),
      alarmId: z.string().optional(),
    })
    .parse(input);
  const note = await db.note.create({
    data: { tenantId, authorId: actor.id, ...value },
  });
  return { id: note.id, createdAt: note.createdAt.toISOString() };
}

export async function tenantExport(requested?: string | null) {
  const { actor, tenantId } = await access(requested);
  await requireFeature(actor, "ADVANCED_EXPORTS", tenantId);
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "TENANT_ADMIN")
    throw new AccessError(403, "Kein Exportrecht.");
  const [properties, meters, readings, alarms, reports] = await Promise.all([
    db.property.findMany({
      where: propertyScope(actor, tenantId),
      include: { buildings: { include: { units: true } } },
    }),
    db.meter.findMany({ where: meterWhere(tenantId, actor, {}) }),
    db.reading.findMany({
      where: { tenantId, meter: meterWhere(tenantId, actor, {}) },
      take: 10000,
      orderBy: { timestamp: "asc" },
    }),
    db.alarm.findMany({
      where: { tenantId, meter: meterWhere(tenantId, actor, {}) },
    }),
    db.report.findMany({
      where: { tenantId },
      select: { id: true, type: true, title: true, createdAt: true },
    }),
  ]);
  await recordTenantUsage(tenantId, "EXPORT");
  return {
    tenantId,
    exportedAt: new Date().toISOString(),
    properties,
    meters,
    readings,
    alarms,
    reports,
  };
}
