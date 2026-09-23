import "server-only";
import { z } from "zod";
import { db } from "./db";
import { AccessError, tenantScope, type Actor } from "./policy";
import type { Prisma } from "@/generated/prisma/client";
import { analytics } from "./analytics";
import { anomalies, benchmarks } from "./analytics-insights";
import { forecast } from "./analytics-forecast";

const id = z.string().min(1).max(160);
const dashboardInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).default(""),
    visibility: z.enum(["PRIVATE", "TENANT", "ROLE_BASED"]),
    roles: z
      .array(z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "MANAGER", "USER"]))
      .max(4)
      .default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.visibility === "ROLE_BASED" && !v.roles.length)
      ctx.addIssue({
        code: "custom",
        path: ["roles"],
        message: "ROLE_BASED benötigt mindestens eine Rolle.",
      });
    if (v.visibility !== "ROLE_BASED" && v.roles.length)
      ctx.addIssue({
        code: "custom",
        path: ["roles"],
        message: "Rollen sind nur für ROLE_BASED erlaubt.",
      });
  });
const widgetInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    type: z.enum([
      "CONSUMPTION",
      "COST",
      "PEAK",
      "BASE_LOAD",
      "PERIOD_COMPARISON",
      "LOAD_PROFILE",
      "ANOMALIES",
      "FORECAST",
      "BENCHMARK",
      "OPEN_ALARMS",
      "METER_STATUS",
      "GATEWAY_STATUS",
    ]),
    dataSource: z.enum([
      "ANALYTICS",
      "ANOMALIES",
      "FORECAST",
      "BENCHMARKS",
      "ALARMS",
      "METERS",
      "GATEWAYS",
    ]),
    medium: z
      .enum(["ELECTRICITY", "WATER", "GAS", "HEAT"])
      .nullable()
      .optional(),
    meterId: id.nullable().optional(),
    propertyId: id.nullable().optional(),
    period: z
      .enum(["15m", "hour", "day", "week", "month", "year"])
      .default("day"),
    aggregation: z.enum(["SUM", "AVG", "MIN", "MAX", "LAST"]).default("SUM"),
    unit: z.string().trim().max(40).nullable().optional(),
    display: z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      )
      .default({}),
    filters: z
      .object({
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        medium: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]).optional(),
        propertyId: id.optional(),
        buildingId: id.optional(),
        meterId: id.optional(),
        aggregation: z.enum(["SUM", "AVG", "MIN", "MAX", "LAST"]).optional(),
      })
      .strict()
      .default({}),
    positionX: z.number().int().min(0).max(100),
    positionY: z.number().int().min(0).max(1000),
    width: z.number().int().min(1).max(12),
    height: z.number().int().min(1).max(20),
  })
  .strict();
async function dashboardAccess(
  actor: Actor,
  tenantId: string,
  dashboardId: string,
  write = false,
) {
  const row = await db.dashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: {
      widgets: { orderBy: [{ positionY: "asc" }, { positionX: "asc" }] },
    },
  });
  if (!row) throw new AccessError(404, "Dashboard nicht gefunden.");
  const allowed =
    row.visibility === "TENANT" ||
    row.ownerId === actor.id ||
    (row.visibility === "ROLE_BASED" && row.roles.includes(actor.role));
  if (!allowed) throw new AccessError(403, "Dashboard ist nicht sichtbar.");
  if (
    write &&
    row.ownerId !== actor.id &&
    !["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role)
  )
    throw new AccessError(403, "Keine Berechtigung für Änderungen.");
  return row;
}
function overlaps(
  a: { positionX: number; positionY: number; width: number; height: number },
  b: { positionX: number; positionY: number; width: number; height: number },
) {
  return (
    a.positionX < b.positionX + b.width &&
    a.positionX + a.width > b.positionX &&
    a.positionY < b.positionY + b.height &&
    a.positionY + a.height > b.positionY
  );
}
export function resolveLayout<
  T extends {
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    id: string;
  },
>(widgets: T[], changed: T) {
  const result = widgets
    .filter((w) => w.id !== changed.id)
    .map((w) => ({ ...w }));
  let nextY = changed.positionY + changed.height + 1;
  for (const item of result
    .filter((w) => overlaps(changed, w))
    .sort((a, b) => a.positionY - b.positionY)) {
    item.positionY = nextY;
    nextY += item.height + 1;
  }
  return [changed, ...result];
}
export async function listDashboards(actor: Actor, requested: string | null) {
  const tenantId = tenantScope(actor, requested);
  const rows = await db.dashboard.findMany({
    where: {
      tenantId,
      OR: [
        { visibility: "TENANT" },
        { ownerId: actor.id },
        { visibility: "ROLE_BASED", roles: { has: actor.role } },
      ],
    },
    include: {
      widgets: { orderBy: [{ positionY: "asc" }, { positionX: "asc" }] },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows;
}
export async function getDashboard(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
) {
  return dashboardAccess(
    actor,
    tenantScope(actor, requested),
    id.parse(dashboardId),
  );
}
export async function exportDashboard(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
) {
  const row = await getDashboard(actor, requested, dashboardId);
  const lines = ["widgetId,title,type,positionX,positionY,width,height"];
  for (const w of row.widgets)
    lines.push(
      [w.id, w.title, w.type, w.positionX, w.positionY, w.width, w.height]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
  return lines.join("\n");
}
export async function widgetData(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
  widgetId: string,
) {
  const tenantId = tenantScope(actor, requested);
  const dashboard = await dashboardAccess(
    actor,
    tenantId,
    id.parse(dashboardId),
  );
  const widget = dashboard.widgets.find((item) => item.id === widgetId);
  if (!widget) throw new AccessError(404, "Widget nicht gefunden.");
  const filters = (widget.filters ?? {}) as {
    from?: string;
    to?: string;
    meterId?: string;
    propertyId?: string;
  };
  const to = filters.to ?? new Date().toISOString();
  const from =
    filters.from ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const common = {
    from,
    to,
    resolution: widget.period,
    timezone: "UTC",
    meterId: filters.meterId ?? widget.meterId ?? undefined,
    propertyId: filters.propertyId ?? widget.propertyId ?? undefined,
  };
  if (widget.type === "ANOMALIES") return anomalies(actor, tenantId, common);
  if (widget.type === "FORECAST")
    return forecast(actor, tenantId, {
      asOf: to,
      horizon:
        widget.period === "month"
          ? "month"
          : widget.period === "week"
            ? "week"
            : "day",
      meterId: common.meterId,
    });
  if (widget.type === "BENCHMARK") return benchmarks(actor, tenantId, common);
  if (widget.type === "OPEN_ALARMS")
    return db.alarm.findMany({
      where: {
        tenantId,
        status: { not: "RESOLVED" },
        ...(common.meterId ? { meterId: common.meterId } : {}),
      },
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        createdAt: true,
      },
      take: 100,
    });
  if (widget.type === "METER_STATUS")
    return db.meter.findMany({
      where: { tenantId, ...(common.meterId ? { id: common.meterId } : {}) },
      select: { id: true, status: true, type: true },
      take: 100,
    });
  if (widget.type === "GATEWAY_STATUS")
    return db.gateway.findMany({
      where: { tenantId },
      select: { id: true, status: true, name: true },
      take: 100,
    });
  return analytics(actor, tenantId, { ...common, portfolio: false });
}
export async function createDashboard(
  actor: Actor,
  requested: string | null,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const value = dashboardInput.parse(raw);
  const owner = await db.user.findFirst({
    where: { id: actor.id, tenantId },
    select: { id: true },
  });
  if (!owner) throw new AccessError(403, "Besitzer muss dem Tenant angehören.");
  const row = await db.dashboard.create({
    data: { ...value, tenantId, ownerId: actor.id, roles: value.roles },
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "dashboard.created",
      entityId: row.id,
    },
  });
  return row;
}
export async function updateDashboard(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const current = await dashboardAccess(
    actor,
    tenantId,
    id.parse(dashboardId),
    true,
  );
  const value = dashboardInput.parse(raw);
  const row = await db.dashboard.update({
    where: { id_tenantId: { id: current.id, tenantId } },
    data: { ...value, roles: value.roles },
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "dashboard.updated",
      entityId: row.id,
    },
  });
  return row;
}
export async function deleteDashboard(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
) {
  const tenantId = tenantScope(actor, requested);
  const current = await dashboardAccess(
    actor,
    tenantId,
    id.parse(dashboardId),
    true,
  );
  await db.dashboard.delete({
    where: { id_tenantId: { id: current.id, tenantId } },
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "dashboard.deleted",
      entityId: current.id,
    },
  });
  return { id: current.id };
}
export async function addWidget(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const current = await dashboardAccess(
    actor,
    tenantId,
    id.parse(dashboardId),
    true,
  );
  const value = widgetInput.parse(raw);
  if (current.widgets.some((w) => overlaps(value, w)))
    throw new AccessError(
      409,
      "Widgetposition kollidiert mit einem anderen Widget.",
    );
  if (
    value.meterId &&
    !(await db.meter.findFirst({
      where: { id: value.meterId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Zähler nicht gefunden.");
  const row = await db.dashboardWidget.create({
    data: {
      ...value,
      tenantId,
      dashboardId: current.id,
      display: value.display as Prisma.InputJsonValue,
      filters: value.filters as Prisma.InputJsonValue,
    },
  });
  return row;
}
export async function updateWidget(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
  widgetId: string,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const current = await dashboardAccess(
    actor,
    tenantId,
    id.parse(dashboardId),
    true,
  );
  const value = widgetInput.parse(raw);
  const existing = current.widgets.find((w) => w.id === widgetId);
  if (!existing) throw new AccessError(404, "Widget nicht gefunden.");
  const collisions = current.widgets.filter(
    (w) => w.id !== widgetId && overlaps(value, w),
  );
  await db.$transaction(async (tx) => {
    const row = await tx.dashboardWidget.updateMany({
      where: { id: widgetId, tenantId, dashboardId: current.id },
      data: {
        ...value,
        display: value.display as Prisma.InputJsonValue,
        filters: value.filters as Prisma.InputJsonValue,
      },
    });
    if (!row.count) throw new AccessError(404, "Widget nicht gefunden.");
    let nextY = value.positionY + value.height + 1;
    for (const collision of collisions.sort(
      (a, b) => a.positionY - b.positionY,
    )) {
      await tx.dashboardWidget.update({
        where: { id_tenantId: { id: collision.id, tenantId } },
        data: { positionY: nextY },
      });
      nextY += collision.height + 1;
    }
  });
  return { id: widgetId };
}
export async function removeWidget(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
  widgetId: string,
) {
  const tenantId = tenantScope(actor, requested);
  const current = await dashboardAccess(
    actor,
    tenantId,
    id.parse(dashboardId),
    true,
  );
  const row = await db.dashboardWidget.deleteMany({
    where: { id: widgetId, tenantId, dashboardId: current.id },
  });
  if (!row.count) throw new AccessError(404, "Widget nicht gefunden.");
  return { id: widgetId };
}
export const refreshIntervals = [0, 30, 60, 300, 900] as const;
export { dashboardInput, widgetInput };

export const dashboardTemplates = [
  "ENERGY",
  "ELECTRICITY",
  "WATER",
  "GAS",
  "HEAT",
  "OPERATIONS",
  "MANAGEMENT",
] as const;
export async function duplicateDashboard(
  actor: Actor,
  requested: string | null,
  dashboardId: string,
  name?: string,
) {
  const tenantId = tenantScope(actor, requested);
  const source = await dashboardAccess(
    actor,
    tenantId,
    id.parse(dashboardId),
    false,
  );
  const copy = await db.dashboard.create({
    data: {
      tenantId,
      ownerId: actor.id,
      name: name?.trim() || `${source.name} (Kopie)`,
      description: source.description,
      visibility: "PRIVATE",
      roles: [],
      widgets: {
        create: source.widgets.map((w) => ({
          tenantId,
          title: w.title,
          type: w.type,
          dataSource: w.dataSource,
          medium: w.medium,
          meterId: w.meterId,
          propertyId: w.propertyId,
          period: w.period,
          aggregation: w.aggregation,
          unit: w.unit,
          display: w.display as Prisma.InputJsonValue,
          filters: w.filters as Prisma.InputJsonValue,
          positionX: w.positionX,
          positionY: w.positionY,
          width: w.width,
          height: w.height,
        })),
      },
    },
    include: { widgets: true },
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "dashboard.duplicated",
      entityId: copy.id,
      details: { sourceId: source.id },
    },
  });
  return copy;
}
export async function createTemplate(
  actor: Actor,
  requested: string | null,
  template: string,
) {
  const name = dashboardTemplates.includes(template as never)
    ? template
    : "ENERGY";
  const dashboard = await createDashboard(actor, requested, {
    name: `Template ${name}`,
    description: `Standardlayout ${name}`,
    visibility: "PRIVATE",
    roles: [],
  });
  const defaults =
    name === "OPERATIONS"
      ? [
          { type: "OPEN_ALARMS", dataSource: "ALARMS", title: "Offene Alarme" },
          { type: "METER_STATUS", dataSource: "METERS", title: "Zählerstatus" },
        ]
      : [
          { type: "CONSUMPTION", dataSource: "ANALYTICS", title: "Verbrauch" },
          { type: "COST", dataSource: "ANALYTICS", title: "Kosten" },
          {
            type: "LOAD_PROFILE",
            dataSource: "ANALYTICS",
            title: "Lastprofil",
          },
        ];
  for (const [index, item] of defaults.entries())
    await addWidget(actor, requested, dashboard.id, {
      ...item,
      period: "day",
      aggregation: "SUM",
      positionX: (index % 2) * 6,
      positionY: Math.floor(index / 2) * 4,
      width: 6,
      height: 3,
    });
  return dashboard;
}
