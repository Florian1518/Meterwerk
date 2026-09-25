import "server-only";
import { db } from "./db";
import { requireActor } from "./auth";
import { requirePlatform, type Actor, AccessError } from "./policy";
import { getEnvironment, isDemoEnvironment } from "@/lib/environment";

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
export async function getDemoScenario(actor: Actor) {
  requirePlatform(actor);
  const environment = assertDemoScenarioEnvironment();
  return db.demoScenarioState.findUnique({ where: { environment } });
}
export async function setDemoScenario(actor: Actor, value: string) {
  requirePlatform(actor);
  const environment = assertDemoScenarioEnvironment();
  const scenario = assertDemoScenario(value);
  const state = await db.demoScenarioState.upsert({
    where: { environment },
    create: { environment, scenario, updatedBy: actor.id },
    update: { scenario, updatedBy: actor.id, activatedAt: new Date() },
  });
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: state.id,
      action: "demo.scenario.activated",
      details: { environment, scenario },
    },
  });
  return state;
}
export async function resetDemoScenario(actor: Actor) {
  return setDemoScenario(actor, "NORMAL");
}
export async function refreshDemoData(actor: Actor) {
  requirePlatform(actor);
  const environment = assertDemoScenarioEnvironment();
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: environment,
      action: "demo.data.refreshed",
      details: { environment, seed: 20260925 },
    },
  });
  return {
    environment,
    seed: 20260925,
    refreshedAt: new Date(),
    scenario:
      (await db.demoScenarioState.findUnique({ where: { environment } }))
        ?.scenario ?? "NORMAL",
  };
}
export async function requireDemoActor() {
  const actor = await requireActor();
  requirePlatform(actor);
  assertDemoScenarioEnvironment();
  return actor;
}
