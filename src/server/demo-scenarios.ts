import "server-only";
import { db } from "./db";
import { requireActor } from "./auth";
import { requirePlatform, type Actor, AccessError } from "./policy";
import { getEnvironment, isDemoEnvironment } from "@/lib/environment";
import { z } from "zod";
import { applyDemoProductState } from "./demo-product-state";

export const DEMO_SCENARIOS = [
  "NORMAL",
  "HIGH_ELECTRICITY",
  "WATER_LEAK",
  "METER_OFFLINE",
  "GATEWAY_OFFLINE",
  "MISSING_DATA",
  "OPEN_ALARM",
  "ACKNOWLEDGED_ALARM",
  "CRITICAL_ANOMALY",
  "MAINTENANCE",
  "METER_REPLACEMENT",
  "SUPPORT_CASE",
  "FIRMWARE_ROLLOUT",
] as const;
export type DemoScenario = (typeof DEMO_SCENARIOS)[number];
export function assertDemoScenarioEnvironment(environment = getEnvironment()) {
  if (!isDemoEnvironment(environment))
    throw new AccessError(
      403,
      "Demo-Szenarien sind nur in DEMO oder TEST verfügbar.",
    );
  return environment;
}
export function assertDemoScenario(value: string): DemoScenario {
  if (!DEMO_SCENARIOS.includes(value as DemoScenario))
    throw new AccessError(400, "Unbekanntes Demo-Szenario.");
  return value as DemoScenario;
}
async function demoTenant(actor: Actor, requested?: string) {
  requirePlatform(actor);
  assertDemoScenarioEnvironment();
  const tenantId = z.enum(["demo-tenant-0", "demo-tenant-1"]).parse(requested);
  if (
    !(await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Demo-Mandant fehlt. Demo-Seed erforderlich.");
  return tenantId;
}
export async function getDemoScenario(actor: Actor, requested?: string) {
  const tenantId = await demoTenant(actor, requested);
  const environment = assertDemoScenarioEnvironment();
  return db.demoScenarioState.findUnique({
    where: { environment_tenantId: { environment, tenantId } },
  });
}
export async function setDemoScenario(
  actor: Actor,
  value: string,
  requested?: string,
) {
  const tenantId = await demoTenant(actor, requested);
  const environment = assertDemoScenarioEnvironment();
  const scenario = z.enum(DEMO_SCENARIOS).parse(value);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
      const previous = await tx.demoScenarioState.findUnique({
        where: { environment_tenantId: { environment, tenantId } },
      });
      // Stable UTC reference persists across reset/apply; visible in API metadata.
      const anchor =
        previous?.activatedAt ??
        new Date(Math.floor(Date.now() / 3600000) * 3600000);
      const metadata = await applyDemoProductState(
        tx,
        tenantId,
        scenario,
        actor.id,
        anchor,
      );
      const state = await tx.demoScenarioState.upsert({
        where: { environment_tenantId: { environment, tenantId } },
        create: {
          environment,
          tenantId,
          scenario,
          activatedAt: anchor,
          updatedBy: actor.id,
          metadata,
        },
        update: { scenario, updatedBy: actor.id, metadata },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: actor.id,
          entityId: state.id,
          action: "demo.scenario.activated",
          details: { environment, scenario, ...metadata },
        },
      });
      return state;
    },
    { timeout: 30000 },
  );
}
export async function resetDemoScenario(actor: Actor, requested?: string) {
  return setDemoScenario(actor, "NORMAL", requested);
}
export async function refreshDemoData(actor: Actor, requested?: string) {
  const state = await getDemoScenario(actor, requested);
  return setDemoScenario(actor, state?.scenario ?? "NORMAL", requested);
}
export async function requireDemoActor() {
  const actor = await requireActor();
  requirePlatform(actor);
  assertDemoScenarioEnvironment();
  return actor;
}
