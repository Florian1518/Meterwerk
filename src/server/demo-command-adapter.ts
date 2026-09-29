import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requirePlatform, type Actor } from "./policy";
import { assertDemoScenarioEnvironment } from "./demo-scenarios";

// Explicitly invoked local adapter. Never polls real devices or opens a socket.
export async function runDemoCommandAdapter(actor: Actor, requested: string) {
  requirePlatform(actor);
  assertDemoScenarioEnvironment();
  const tenantId = z.enum(["demo-tenant-0", "demo-tenant-1"]).parse(requested);
  return db.$transaction(async (tx) => {
    const commands = await tx.gatewayCommand.findMany({
      where: {
        tenantId,
        deviceId: `scenario-${tenantId}-device`,
        device: { protocol: "VIRTUAL" },
        status: "QUEUED",
        action: "STATUS_REQUEST",
        expiresAt: { gt: new Date() },
      },
    });
    let completed = 0;
    for (const command of commands) {
      const changed = await tx.gatewayCommand.updateMany({
        where: { id: command.id, tenantId, status: "QUEUED" },
        data: { status: "SUCCEEDED", completedAt: new Date() },
      });
      if (!changed.count) continue;
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: actor.id,
          entityId: command.id,
          action: "demo.command.simulated",
          details: {
            adapter: "local-test",
            action: command.action,
            externalDelivery: false,
          },
        },
      });
      completed++;
    }
    return { completed, externalDelivery: false };
  });
}
