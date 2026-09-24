import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { AccessError, requireManage, tenantScope, type Actor } from "./policy";
import {
  actionSchema,
  matchesRule,
  ruleDefinitionSchema,
  ruleTriggers,
  type RuleEvent,
} from "@/lib/rules";
import type { Prisma, RuleTrigger } from "@/generated/prisma/client";
import { enqueueWebhookEvent } from "./webhooks";
import { sendMail } from "./mail";

const idSchema = z.string().min(1).max(160);
const ruleInputSchema = z
  .object({ tenantId: z.string().optional() })
  .passthrough();
export async function emitRuleEvent(tenantId: string, event: RuleEvent) {
  return processRuleEvent(
    {
      id: "rules-event",
      tenantId,
      role: "TENANT_ADMIN",
      name: "Rules Event",
      email: "rules-event@localhost.invalid",
    },
    tenantId,
    event,
  );
}
async function verifyScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  value: {
    propertyId?: string | null;
    meterId?: string | null;
    gatewayId?: string | null;
    medium?: string | null;
  },
) {
  if (
    value.propertyId &&
    !(await tx.property.findFirst({
      where: { id: value.propertyId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Liegenschaft nicht gefunden.");
  if (value.meterId) {
    const meter = await tx.meter.findFirst({
      where: { id: value.meterId, tenantId },
      select: {
        id: true,
        unit: { select: { building: { select: { propertyId: true } } } },
        type: true,
      },
    });
    if (!meter) throw new AccessError(404, "Zähler nicht gefunden.");
    if (value.propertyId && meter.unit.building.propertyId !== value.propertyId)
      throw new AccessError(400, "Zähler gehört nicht zur Liegenschaft.");
    if (value.medium && meter.type !== value.medium)
      throw new AccessError(400, "Medium stimmt nicht mit dem Zähler überein.");
  }
  if (
    value.gatewayId &&
    !(await tx.gateway.findFirst({
      where: { id: value.gatewayId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Gateway nicht gefunden.");
}

export async function createRule(
  actor: Actor,
  requested: string | null,
  input: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const raw = ruleInputSchema.parse(input);
  delete raw.tenantId;
  const value = ruleDefinitionSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    await verifyScope(tx, tenantId, value);
    const created = await tx.rule.create({
      data: {
        ...value,
        tenantId,
        propertyId: value.propertyId ?? null,
        meterId: value.meterId ?? null,
        gatewayId: value.gatewayId ?? null,
        medium: value.medium ?? null,
        conditions: value.conditions as Prisma.InputJsonValue,
        actions: value.actions as Prisma.InputJsonValue,
      },
    });
    await tx.ruleVersion.create({
      data: {
        tenantId,
        ruleId: created.id,
        version: 1,
        definition: value as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "rules.created",
        entityId: created.id,
        details: { trigger: value.trigger },
      },
    });
    return serializeRule(created);
  });
}
export async function listRules(actor: Actor, requested: string | null) {
  const tenantId = tenantScope(actor, requested);
  const rows = await db.rule.findMany({
    where: { tenantId },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      executions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          status: true,
          startedAt: true,
          finishedAt: true,
          error: true,
        },
      },
    },
  });
  return rows.map(serializeRule);
}
export async function updateRule(
  actor: Actor,
  requested: string | null,
  id: string,
  input: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const parsedId = idSchema.parse(id);
  const raw = ruleInputSchema.parse(input);
  delete raw.tenantId;
  const value = ruleDefinitionSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    await verifyScope(tx, tenantId, value);
    const prior = await tx.rule.findFirst({
      where: { id: parsedId, tenantId },
    });
    if (!prior) throw new AccessError(404, "Regel nicht gefunden.");
    const updated = await tx.rule.update({
      where: { id_tenantId: { id: parsedId, tenantId } },
      data: {
        ...value,
        propertyId: value.propertyId ?? null,
        meterId: value.meterId ?? null,
        gatewayId: value.gatewayId ?? null,
        medium: value.medium ?? null,
        conditions: value.conditions as Prisma.InputJsonValue,
        actions: value.actions as Prisma.InputJsonValue,
      },
    });
    const priorVersion = await tx.ruleVersion.findFirst({
      where: { tenantId, ruleId: updated.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    await tx.ruleVersion.create({
      data: {
        tenantId,
        ruleId: updated.id,
        version: (priorVersion?.version ?? 0) + 1,
        definition: value as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "rules.updated",
        entityId: updated.id,
        details: { trigger: value.trigger },
      },
    });
    return serializeRule(updated);
  });
}
export async function deleteRule(
  actor: Actor,
  requested: string | null,
  id: string,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const parsedId = idSchema.parse(id);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    const row = await tx.rule.findFirst({
      where: { id: parsedId, tenantId },
      select: { id: true },
    });
    if (!row) throw new AccessError(404, "Regel nicht gefunden.");
    await tx.rule.delete({
      where: { id_tenantId: { id: parsedId, tenantId } },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "rules.deleted",
        entityId: parsedId,
      },
    });
    return { id: parsedId };
  });
}

export async function processRuleEvent(
  actor: Actor,
  requested: string | null,
  event: RuleEvent,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const trigger = z.enum(ruleTriggers).parse(event.trigger);
  const eventKey = idSchema.parse(event.eventKey);
  if (event.meter) {
    const meter = await db.meter.findFirst({
      where: { id: event.meter.id, tenantId },
      select: {
        id: true,
        type: true,
        status: true,
        lastContact: true,
        installedAt: true,
        unit: { select: { building: { select: { propertyId: true } } } },
      },
    });
    if (!meter)
      throw new AccessError(404, "Zähler gehört nicht zu diesem Mandanten.");
    event = {
      ...event,
      meter: {
        id: meter.id,
        propertyId: meter.unit.building.propertyId,
        type: meter.type,
        status: meter.status,
        lastContact: meter.lastContact,
        installedAt: meter.installedAt,
      },
    };
  }
  if (event.gateway) {
    const gateway = await db.gateway.findFirst({
      where: { id: event.gateway.id, tenantId },
      select: { id: true, status: true, lastSeenAt: true },
    });
    if (!gateway)
      throw new AccessError(404, "Gateway gehört nicht zu diesem Mandanten.");
    event = { ...event, gateway };
  }
  if (
    event.alarm &&
    !(await db.alarm.findFirst({
      where: { id: event.alarm.id, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Alarm gehört nicht zu diesem Mandanten.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    const previous = await tx.ruleExecution.findMany({
      where: { tenantId, eventKey, trigger },
      orderBy: { executedAt: "asc" },
      select: { ruleId: true, matched: true, actionCount: true },
    });
    if (previous.length) return previous;
    const rules = await tx.rule.findMany({
      where: { tenantId, active: true, trigger },
      orderBy: { priority: "asc" },
    });
    const results: { ruleId: string; matched: boolean; actionCount: number }[] =
      [];
    for (const rule of rules) {
      if (rule.propertyId && rule.propertyId !== event.meter?.propertyId)
        continue;
      if (rule.meterId && rule.meterId !== event.meter?.id) continue;
      if (rule.gatewayId && rule.gatewayId !== event.gateway?.id) continue;
      if (rule.medium && rule.medium !== event.meter?.type) continue;
      const matched = matchesRule(rule.conditions, event);
      let actionCount = 0;
      const executedActions: string[] = [];
      const skippedActions: string[] = [];
      const errors: string[] = [];
      const emailActions: Extract<
        z.infer<typeof actionSchema>,
        { type: "EMAIL" }
      >[] = [];
      const correlationId = event.correlationId ?? randomUUID();
      const startedAt = new Date();
      const recent =
        rule.cooldownSeconds > 0 &&
        (await tx.ruleExecution.count({
          where: {
            tenantId,
            ruleId: rule.id,
            startedAt: {
              gte: new Date(startedAt.getTime() - rule.cooldownSeconds * 1000),
            },
            status: { in: ["RUNNING", "SUCCEEDED"] },
          },
        })) > 0;
      const hourly =
        rule.maxExecutionsPerHour > 0 &&
        (await tx.ruleExecution.count({
          where: {
            tenantId,
            ruleId: rule.id,
            startedAt: { gte: new Date(startedAt.getTime() - 3600000) },
            status: { in: ["RUNNING", "SUCCEEDED"] },
          },
        })) >= rule.maxExecutionsPerHour;
      let executionStatus: "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED" =
        matched ? "RUNNING" : "SKIPPED";
      if (matched && recent) {
        executionStatus = "SKIPPED";
        skippedActions.push("cooldown");
      } else if (matched && hourly) {
        executionStatus = "SKIPPED";
        skippedActions.push("maxExecutionsPerHour");
      }
      if (matched) {
        const actions = z.array(actionSchema).parse(rule.actions);
        const seen = new Set<string>();
        for (const action of actions) {
          const key = JSON.stringify(action);
          if (seen.has(key)) {
            skippedActions.push(action.type + ":duplicate");
            continue;
          }
          seen.add(key);
          if (executionStatus === "SKIPPED") continue;
          if (action.type === "CREATE_ALARM") {
            if (!event.meter)
              throw new AccessError(
                400,
                "Alarmaktion benötigt einen Zählerkontext.",
              );
            await tx.alarm.create({
              data: {
                tenantId,
                meterId: event.meter.id,
                title: action.title,
                severity: action.severity,
              },
            });
            actionCount++;
            executedActions.push(action.type);
          }
          if (action.type === "SET_METER_STATUS") {
            if (!event.meter)
              throw new AccessError(
                400,
                "Statusaktion benötigt einen Zählerkontext.",
              );
            await tx.meter.update({
              where: { id_tenantId: { id: event.meter.id, tenantId } },
              data: { status: action.status },
            });
            actionCount++;
            executedActions.push(action.type);
          }
          if (action.type === "UPDATE_ALARM") {
            const alarmId = action.alarmId ?? event.alarm?.id;
            if (!alarmId)
              throw new AccessError(400, "Alarmaktion benötigt einen Alarm.");
            if (
              !(await tx.alarm.findFirst({
                where: { id: alarmId, tenantId },
                select: { id: true },
              }))
            )
              throw new AccessError(404, "Alarm nicht gefunden.");
            await tx.alarm.update({
              where: { id_tenantId: { id: alarmId, tenantId } },
              data: {
                status: action.status,
                title: action.title,
                severity: action.severity,
              },
            });
            actionCount++;
            executedActions.push(action.type);
          }
          if (action.type === "SET_GATEWAY_STATUS") {
            const gatewayId = action.gatewayId ?? event.gateway?.id;
            if (!gatewayId)
              throw new AccessError(400, "Gatewayaktion benötigt ein Gateway.");
            await tx.gateway.update({
              where: { id_tenantId: { id: gatewayId, tenantId } },
              data: { status: action.status },
            });
            actionCount++;
            executedActions.push(action.type);
          }
          if (action.type === "WEBHOOK") {
            await enqueueWebhookEvent(tx, tenantId, action.event, {
              ...action.payload,
              ruleId: rule.id,
              eventKey,
              correlationId,
            });
            actionCount++;
            executedActions.push(action.type);
          }
          if (action.type === "EMAIL") {
            emailActions.push(action);
            actionCount++;
            executedActions.push(action.type);
          }
        }
        executionStatus = "SUCCEEDED";
      }
      const execution = await tx.ruleExecution.create({
        data: {
          tenantId,
          ruleId: rule.id,
          trigger: trigger as RuleTrigger,
          eventKey,
          matched,
          actionCount,
          details: { event: trigger },
          startedAt,
          finishedAt: new Date(),
          status: executionStatus,
          executedActions: executedActions as Prisma.InputJsonValue,
          skippedActions: skippedActions as Prisma.InputJsonValue,
          error: errors.length ? errors.join("; ") : null,
          correlationId,
          ruleVersion:
            (
              await tx.ruleVersion.findFirst({
                where: { tenantId, ruleId: rule.id },
                orderBy: { version: "desc" },
                select: { version: true },
              })
            )?.version ?? 1,
        },
      });
      if (emailActions.length)
        await tx.ruleActionJob.createMany({
          data: emailActions.map((action) => ({
            tenantId,
            ruleId: rule.id,
            executionId: execution.id,
            type: "EMAIL",
            payload: action as unknown as Prisma.InputJsonValue,
            correlationId,
          })),
        });
      results.push({ ruleId: rule.id, matched, actionCount });
    }
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "rules.evaluated",
        entityId: eventKey,
        details: { trigger, results },
      },
    });
    return results;
  });
}
export async function runScheduledRules(
  actor: Actor,
  requested: string | null,
  now = new Date(),
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const rules = await db.rule.findMany({
    where: { tenantId, active: true, trigger: "SCHEDULED_CHECK" },
    orderBy: { priority: "asc" },
    select: { id: true, propertyId: true, meterId: true, medium: true },
  });
  const scopedMeterIds = rules.flatMap((rule) =>
    rule.meterId ? [rule.meterId] : [],
  );
  const scopedPropertyIds = rules.flatMap((rule) =>
    rule.propertyId ? [rule.propertyId] : [],
  );
  const meters = await db.meter.findMany({
    where: {
      tenantId,
      ...(scopedMeterIds.length || scopedPropertyIds.length
        ? {
            OR: [
              ...(scopedMeterIds.length
                ? [{ id: { in: scopedMeterIds } }]
                : []),
              ...(scopedPropertyIds.length
                ? [
                    {
                      unit: {
                        building: { propertyId: { in: scopedPropertyIds } },
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    },
    select: {
      id: true,
      type: true,
      status: true,
      lastContact: true,
      installedAt: true,
      unit: { select: { building: { select: { propertyId: true } } } },
      readings: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true },
      },
    },
  });
  const results: {
    meterId: string;
    evaluations: { ruleId: string; matched: boolean; actionCount: number }[];
  }[] = [];
  for (const meter of meters) {
    const propertyId = meter.unit.building.propertyId;
    const lastReading = meter.readings[0]?.timestamp ?? null;
    const relevant = rules.filter(
      (rule) =>
        (!rule.meterId || rule.meterId === meter.id) &&
        (!rule.propertyId || rule.propertyId === propertyId) &&
        (!rule.medium || rule.medium === meter.type),
    );
    if (!relevant.length) continue;
    const evaluations = await processRuleEvent(actor, tenantId, {
      trigger: "SCHEDULED_CHECK",
      eventKey: `schedule:${now.toISOString()}:${meter.id}`,
      occurredAt: now,
      meter: {
        id: meter.id,
        propertyId,
        type: meter.type,
        status: meter.status,
        lastContact: meter.lastContact,
        installedAt: meter.installedAt,
      },
      missingMinutes: lastReading
        ? Math.max(0, (now.getTime() - lastReading.getTime()) / 60000)
        : Math.max(0, (now.getTime() - meter.installedAt.getTime()) / 60000),
    });
    results.push({ meterId: meter.id, evaluations });
  }
  return { checkedRules: rules.length, checkedMeters: meters.length, results };
}
export async function ruleExecutions(
  actor: Actor,
  requested: string | null,
  ruleId: string,
) {
  const tenantId = tenantScope(actor, requested);
  const id = idSchema.parse(ruleId);
  const rows = await db.ruleExecution.findMany({
    where: { tenantId, ruleId: id },
    orderBy: { executedAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    ...row,
    executedAt: row.executedAt.toISOString(),
  }));
}

export async function processRuleActionJobs(now = new Date(), limit = 50) {
  const leaseOwner = randomUUID();
  const jobs = await db.ruleActionJob.findMany({
    where: {
      nextAttemptAt: { lte: now },
      OR: [
        { status: { in: ["PENDING", "RETRYING"] } },
        { status: "PROCESSING", lockedUntil: { lte: now } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  const results: { id: string; status: string }[] = [];
  for (const job of jobs) {
    const claimed = await db.ruleActionJob.updateMany({
      where: { id: job.id, tenantId: job.tenantId, status: job.status },
      data: {
        status: "PROCESSING",
        leaseOwner,
        lockedUntil: new Date(now.getTime() + 60000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    try {
      const payload = actionSchema.parse(job.payload);
      if (payload.type !== "EMAIL") throw new Error("Unbekannter Aktionsjob.");
      let failed = false;
      for (const recipient of payload.to) {
        const response = await sendMail({
          to: recipient,
          subject: payload.subject,
          text: payload.body,
          template: payload.template,
        });
        if (!response.accepted) failed = true;
      }
      if (failed)
        throw new Error("Mail-Provider hat die Nachricht nicht angenommen.");
      const completed = await db.ruleActionJob.updateMany({
        where: { id: job.id, tenantId: job.tenantId, leaseOwner },
        data: {
          status: "COMPLETED",
          leaseOwner: null,
          lockedUntil: null,
          lastError: null,
        },
      });
      if (completed.count) results.push({ id: job.id, status: "COMPLETED" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Aktionsjob fehlgeschlagen.";
      const terminal = job.attempts + 1 >= job.maxAttempts;
      const failedUpdate = await db.ruleActionJob.updateMany({
        where: { id: job.id, tenantId: job.tenantId, leaseOwner },
        data: {
          status: terminal ? "FAILED" : "RETRYING",
          leaseOwner: null,
          lockedUntil: null,
          lastError: message.slice(0, 2000),
          nextAttemptAt: new Date(
            now.getTime() + Math.min(3600000, 1000 * 2 ** job.attempts),
          ),
        },
      });
      if (failedUpdate.count && terminal)
        await db.ruleExecution.updateMany({
          where: { id: job.executionId, tenantId: job.tenantId },
          data: {
            status: "FAILED",
            error: message.slice(0, 2000),
            finishedAt: now,
          },
        });
      if (failedUpdate.count)
        results.push({ id: job.id, status: terminal ? "FAILED" : "RETRYING" });
    }
  }
  return results;
}

export async function runRulesWorkerOnce(now = new Date()) {
  await processRuleActionJobs(now);
  const tenants = await db.rule.findMany({
    where: {
      active: true,
      trigger: "SCHEDULED_CHECK",
      OR: [{ nextScheduledAt: null }, { nextScheduledAt: { lte: now } }],
    },
    distinct: ["tenantId"],
    select: { tenantId: true },
  });
  const actor: Actor = {
    id: "rules-worker",
    tenantId: "",
    role: "TENANT_ADMIN",
    name: "Rules Worker",
    email: "rules-worker@localhost.invalid",
  };
  for (const { tenantId } of tenants)
    await runScheduledRules({ ...actor, tenantId }, tenantId, now);
}
function serializeRule(row: {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  active: boolean;
  propertyId: string | null;
  meterId: string | null;
  gatewayId: string | null;
  medium: string | null;
  trigger: string;
  conditions: unknown;
  actions: unknown;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  cooldownSeconds: number;
  nextScheduledAt: Date | null;
  executions?: {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    error: string | null;
  }[];
}) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cooldownSeconds: row.cooldownSeconds,
    nextScheduledAt: row.nextScheduledAt?.toISOString() ?? null,
    executions: row.executions?.map((execution) => ({
      ...execution,
      startedAt: execution.startedAt.toISOString(),
      finishedAt: execution.finishedAt?.toISOString() ?? null,
    })),
  };
}
