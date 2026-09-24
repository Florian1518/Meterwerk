import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, requirePlatform, tenantScope } from "./policy";
import type { Prisma } from "@/generated/prisma/client";

const caseInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().min(1).max(10000),
    category: z.enum([
      "ACCESS",
      "BILLING",
      "DEVICE",
      "GATEWAY",
      "METER",
      "DATA",
      "REPORTING",
      "API",
      "FIELD_SERVICE",
      "OTHER",
    ]),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  })
  .strict();
async function scopedCase(id: string, requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const row = await db.supportCase.findFirst({ where: { id, tenantId } });
  if (!row) throw new AccessError(404, "Supportfall nicht gefunden.");
  return { actor, tenantId, row };
}
export async function listSupportCases(
  raw: unknown = {},
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const v = z
    .object({
      q: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(raw);
  const where: Prisma.SupportCaseWhereInput = {
    tenantId,
    status: v.status as Prisma.EnumSupportCaseStatusFilter | undefined,
    priority: v.priority as Prisma.EnumSupportCasePriorityFilter | undefined,
    category: v.category as Prisma.EnumSupportCaseCategoryFilter | undefined,
  };
  if (v.q)
    where.OR = [
      { title: { contains: v.q, mode: "insensitive" } },
      { description: { contains: v.q, mode: "insensitive" } },
    ];
  const [items, total] = await db.$transaction([
    db.supportCase.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (v.page - 1) * v.pageSize,
      take: v.pageSize,
      include: {
        timeline: {
          where: { internal: false },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    }),
    db.supportCase.count({ where }),
  ]);
  return {
    items,
    total,
    page: v.page,
    pageSize: v.pageSize,
    pages: Math.ceil(total / v.pageSize),
    actorRole: actor.role,
  };
}
export async function createSupportCase(
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const value = caseInput.parse(raw);
  return db.$transaction(async (tx) => {
    const c = await tx.supportCase.create({
      data: { tenantId, ...value, reportedById: actor.id },
    });
    await tx.supportCaseEvent.create({
      data: {
        tenantId,
        caseId: c.id,
        actorId: actor.id,
        kind: "CREATED",
        body: value.description,
        internal: false,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "support-case.opened",
        entityId: c.id,
      },
    });
    return c;
  });
}
export async function getSupportCase(id: string, requested?: string | null) {
  const { actor, tenantId } = await scopedCase(id, requested);
  const row = await db.supportCase.findFirstOrThrow({
    where: { id, tenantId },
    include: {
      timeline: {
        where:
          actor.role === "SUPER_ADMIN" || actor.role === "TENANT_ADMIN"
            ? {}
            : { internal: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "support-case.view",
      entityId: id,
    },
  });
  return row;
}
export async function updateSupportCase(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId, row } = await scopedCase(id, requested);
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role))
    throw new AccessError(403, "Keine Supportberechtigung.");
  const v = z
    .object({
      status: z
        .enum([
          "OPEN",
          "IN_PROGRESS",
          "WAITING_FOR_CUSTOMER",
          "WAITING_FOR_INTERNAL",
          "RESOLVED",
          "CLOSED",
        ])
        .optional(),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
      comment: z.string().max(5000).optional(),
      internal: z.boolean().default(false),
      assignedToId: z.string().optional(),
    })
    .strict()
    .parse(raw);
  return db.$transaction(async (tx) => {
    const c = await tx.supportCase.update({
      where: { id },
      data: {
        status: v.status,
        priority: v.priority,
        assignedToId: v.assignedToId,
        resolvedAt:
          v.status === "RESOLVED" || v.status === "CLOSED"
            ? new Date()
            : row.resolvedAt,
      },
    });
    if (v.comment)
      await tx.supportCaseEvent.create({
        data: {
          tenantId,
          caseId: id,
          actorId: actor.id,
          kind: v.internal ? "INTERNAL_NOTE" : "COMMENT",
          body: v.comment,
          internal: v.internal,
        },
      });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: v.status
          ? "support-case.status.changed"
          : "support-case.updated",
        entityId: id,
      },
    });
    return c;
  });
}
export async function tenantDiagnostics(requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const [
    tenant,
    users,
    properties,
    meters,
    devices,
    gateways,
    alarms,
    provisionings,
    webhooks,
    reports,
    usage,
  ] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    db.user.count({ where: { tenantId } }),
    db.property.count({ where: { tenantId } }),
    db.meter.count({ where: { tenantId } }),
    db.device.count({ where: { tenantId } }),
    db.gateway.count({ where: { tenantId } }),
    db.alarm.count({ where: { tenantId, status: "OPEN" } }),
    db.gatewayCommand.count({ where: { tenantId, status: "FAILED" } }),
    db.webhookDelivery.count({ where: { tenantId, status: "FAILED" } }),
    db.report.count({ where: { tenantId } }),
    db.tenantUsageCounter.findMany({ where: { tenantId }, take: 20 }),
  ]);
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "support.diagnostics.view",
      entityId: tenantId,
    },
  });
  return {
    tenant,
    users,
    properties,
    meters,
    devices,
    gateways,
    openAlarms: alarms,
    failedProvisionings: provisionings,
    failedWebhooks: webhooks,
    reports,
    apiUsage: usage,
  };
}
export async function systemHealth() {
  const actor = await requireActor();
  requirePlatform(actor);
  const now = new Date();
  const [dbCheck, workers, commands, rollouts, webhooks, reports, errors] =
    await Promise.all([
      db.$executeRawUnsafe("SELECT 1"),
      db.workerHealth.findMany({ take: 20 }),
      db.gatewayCommand.count({ where: { status: "QUEUED" } }),
      db.firmwareRollout.count({
        where: { status: { in: ["RUNNING", "PAUSED"] } },
      }),
      db.webhookDelivery.count({ where: { status: "PENDING" } }),
      db.report.count({
        where: { createdAt: { gte: new Date(now.getTime() - 86400000) } },
      }),
      db.auditEvent.findMany({
        where: { action: { contains: "error" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
  return {
    status: workers.some((w) => w.errorStreak >= 3) ? "DEGRADED" : "HEALTHY",
    database: !!dbCheck,
    workers,
    queues: { commands, rollouts, webhooks, reports },
    recentErrors: errors,
  };
}
export async function diagnosticBundle(requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role))
    throw new AccessError(403, "Keine Diagnoseberechtigung.");
  const diagnostics = await tenantDiagnostics(tenantId);
  const audits = await db.auditEvent.findMany({
    where: { tenantId },
    select: { action: true, entityId: true, createdAt: true, details: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    version: process.env.npm_package_version ?? "unknown",
    tenantId,
    diagnostics,
    audits,
    exportedAt: new Date().toISOString(),
  };
}
export async function supportAction(raw: unknown, requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role))
    throw new AccessError(403, "Keine Supportberechtigung.");
  const v = z
    .object({
      action: z.enum([
        "RETRY_PROVISIONING",
        "RETRY_WEBHOOK",
        "RETRY_REPORT",
        "RETRY_NOTIFICATION",
        "REQUEUE_COMMAND",
        "REQUEUE_WORKER",
      ]),
      entityId: z.string().min(1),
      requestId: z.string().min(1).max(100),
    })
    .strict()
    .parse(raw);
  const action = "support-action." + v.action;
  const prior = await db.auditEvent.findFirst({
    where: { tenantId, action, correlationId: v.requestId },
  });
  if (prior) return { idempotent: true, auditId: prior.id };
  const audit = await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action,
      entityId: v.entityId,
      correlationId: v.requestId,
    },
  });
  return { idempotent: false, auditId: audit.id, queued: true };
}
export async function setMaintenanceMode(raw: unknown) {
  const actor = await requireActor();
  requirePlatform(actor);
  const v = z
    .object({
      tenantId: z.string().optional(),
      enabled: z.boolean(),
      reason: z.string().min(1).max(500),
      endsAt: z.iso.datetime().optional(),
    })
    .strict()
    .parse(raw);
  const row = await db.maintenanceMode.create({
    data: {
      tenantId: v.tenantId,
      enabled: v.enabled,
      reason: v.reason,
      endsAt: v.endsAt ? new Date(v.endsAt) : null,
      createdBy: actor.id,
    },
  });
  await db.auditEvent.create({
    data: {
      tenantId: v.tenantId,
      actorId: actor.id,
      action: v.enabled ? "maintenance.enabled" : "maintenance.disabled",
      entityId: row.id,
    },
  });
  return row;
}
