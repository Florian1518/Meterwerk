import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, requireManage, tenantScope } from "./policy";
import type { Prisma } from "@/generated/prisma/client";
import { sendMail } from "./mail";

const incidentSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(10000),
    severity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL"]),
    scope: z.enum(["PLATFORM", "TENANT", "SERVICE"]),
    tenantId: z.string().optional(),
    components: z.array(z.string()).max(50).default([]),
  })
  .strict();
async function incidentAccess(id: string, requested?: string | null) {
  const actor = await requireActor();
  const tenantId =
    actor.role === "SUPER_ADMIN"
      ? (requested ?? null)
      : tenantScope(actor, requested);
  const row = await db.incident.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
  });
  if (!row) throw new AccessError(404, "Incident nicht gefunden.");
  return { actor, tenantId, row };
}
export async function createIncident(raw: unknown, requested?: string | null) {
  const actor = await requireActor();
  requireManage(actor);
  const v = incidentSchema.parse(raw);
  const tenantId =
    v.scope === "PLATFORM" ? null : tenantScope(actor, v.tenantId ?? requested);
  const result = await db.$transaction(async (tx) => {
    const i = await tx.incident.create({
      data: {
        ...v,
        tenantId,
        components: v.components as Prisma.InputJsonValue,
        ownerId: actor.id,
      },
    });
    await tx.incidentEvent.create({
      data: {
        incidentId: i.id,
        actorId: actor.id,
        kind: "CREATED",
        body: v.description,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "incident.created",
        entityId: i.id,
      },
    });
    return i;
  });
  if (v.severity === "CRITICAL" && tenantId)
    await notifySupportUsers(tenantId, "Kritischer Incident", v.title);
  return result;
}
export async function listIncidents(requested?: string | null) {
  const actor = await requireActor();
  const tenantId =
    actor.role === "SUPER_ADMIN" ? requested : tenantScope(actor, requested);
  return db.incident.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { timeline: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
}
export async function updateIncident(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId, row } = await incidentAccess(id, requested);
  requireManage(actor);
  const v = z
    .object({
      status: z
        .enum([
          "OPEN",
          "INVESTIGATING",
          "IDENTIFIED",
          "MONITORING",
          "RESOLVED",
          "CLOSED",
        ])
        .optional(),
      severity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL"]).optional(),
      cause: z.string().max(5000).optional(),
      solution: z.string().max(5000).optional(),
      comment: z.string().max(5000).optional(),
      internal: z.boolean().default(false),
    })
    .strict()
    .parse(raw);
  const result = await db.$transaction(async (tx) => {
    const i = await tx.incident.update({
      where: { id },
      data: {
        status: v.status,
        severity: v.severity,
        cause: v.cause,
        solution: v.solution,
        resolvedAt:
          v.status === "RESOLVED" || v.status === "CLOSED"
            ? new Date()
            : row.resolvedAt,
      },
    });
    if (v.comment)
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
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
        action: "incident.updated",
        entityId: id,
      },
    });
    return i;
  });
  if (v.status || v.severity) await notifyOps(tenantId, "incident.status", id);
  return result;
}
export async function notifyOps(
  tenantId: string | null,
  kind: string,
  entityId: string,
) {
  if (!tenantId) return { deduplicated: false };
  const exists = await db.auditEvent.findFirst({
    where: {
      tenantId,
      action: "notification." + kind,
      entityId,
      createdAt: { gte: new Date(Date.now() - 3600000) },
    },
  });
  if (exists) return { deduplicated: true };
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: "system",
      action: "notification." + kind,
      entityId,
    },
  });
  return { deduplicated: false };
}
export async function notifySupportUsers(
  tenantId: string,
  subject: string,
  text: string,
) {
  const users = await db.user.findMany({
    where: {
      tenantId,
      active: true,
      role: { in: ["TENANT_ADMIN", "MANAGER"] },
    },
    select: { email: true },
  });
  const results = await Promise.all(
    users.map((u) =>
      sendMail({ to: u.email, subject, text, template: "SYSTEM" }),
    ),
  );
  return {
    recipients: users.length,
    accepted: results.filter((r) => r.accepted).length,
    provider: results[0]?.provider ?? "none",
  };
}
export function calculateSla(
  startedAt: Date,
  targetResponse: number,
  targetResolution: number,
  now = new Date(),
) {
  const elapsed = Math.max(0, now.getTime() - startedAt.getTime()) / 60000;
  return {
    responseRemainingMinutes: Math.max(0, targetResponse - elapsed),
    resolutionRemainingMinutes: Math.max(0, targetResolution - elapsed),
    responseBreached: elapsed > targetResponse,
    resolutionBreached: elapsed > targetResolution,
  };
}
export async function operationsMetrics(requested?: string | null) {
  const actor = await requireActor();
  const tenantId =
    actor.role === "SUPER_ADMIN" ? requested : tenantScope(actor, requested);
  const where = tenantId ? { tenantId } : { tenantId: null };
  const [metrics, incidents, cases] = await Promise.all([
    db.operationsMetric.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      take: 200,
    }),
    db.incident.count({
      where: tenantId
        ? { tenantId, status: { notIn: ["RESOLVED", "CLOSED"] } }
        : { status: { notIn: ["RESOLVED", "CLOSED"] } },
    }),
    db.supportCase.count({
      where: tenantId
        ? { tenantId, status: { notIn: ["RESOLVED", "CLOSED"] } }
        : { status: { notIn: ["RESOLVED", "CLOSED"] } },
    }),
  ]);
  return {
    metrics,
    openIncidents: incidents,
    openSupportCases: cases,
    windows: [15, 60, 1440, 10080],
  };
}
export async function configureSla(raw: unknown, requested?: string | null) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const v = z
    .object({
      severity: z.string(),
      responseMinutes: z.number().int().positive(),
      resolutionMinutes: z.number().int().positive(),
    })
    .strict()
    .parse(raw);
  return db.slaPolicy.upsert({
    where: { tenantId_severity: { tenantId, severity: v.severity } },
    create: { tenantId, ...v },
    update: v,
  });
}
export async function retryQueueJob(raw: unknown, requested?: string | null) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const v = z
    .object({
      queue: z.enum([
        "WEBHOOK",
        "REPORT",
        "NOTIFICATION",
        "COMMAND",
        "PROVISIONING",
      ]),
      entityId: z.string(),
      requestId: z.string().min(1),
    })
    .strict()
    .parse(raw);
  const action = "queue.retry." + v.queue;
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
  return { idempotent: false, queued: true, auditId: audit.id };
}
