import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "./db";
import { AccessError } from "./policy";
import { requireProductionSecrets } from "./security-config";

const idSchema = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);
export async function correlationId() {
  const value = (await headers()).get("x-correlation-id");
  return value && idSchema.safeParse(value).success ? value : randomUUID();
}
export function safeError(
  error: unknown,
  context: {
    service: string;
    requestId?: string;
    tenantId?: string | null;
    deviceId?: string;
    gatewayId?: string;
  },
) {
  return {
    errorClass:
      error instanceof Error ? error.constructor.name : "UnknownError",
    message: "Operation failed",
    service: context.service,
    requestId: context.requestId,
    tenantId: context.tenantId,
    deviceId: context.deviceId,
    gatewayId: context.gatewayId,
  };
}
const counters = new Map<string, { count: number; startedAt: number }>();
export function metric(name: string, labels: Record<string, string> = {}) {
  const key = `${name}:${JSON.stringify(labels)}`;
  const current = counters.get(key) ?? { count: 0, startedAt: Date.now() };
  current.count++;
  counters.set(key, current);
  return {
    name,
    labels,
    count: current.count,
    windowSeconds: Math.max(1, (Date.now() - current.startedAt) / 1000),
  };
}
export function metricsSnapshot() {
  return [...counters.entries()].map(([key, value]) => ({ key, ...value }));
}
export async function liveHealth() {
  return {
    status: "ok",
    service: "meterwerk-web",
    time: new Date().toISOString(),
  };
}
export async function readyHealth() {
  try {
    requireProductionSecrets();
    await db.$queryRaw`SELECT 1`;
    return { status: "ready", postgres: true, time: new Date().toISOString() };
  } catch {
    throw new AccessError(503, "Dienst ist noch nicht bereit.");
  }
}
