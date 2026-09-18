import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EdgeGatewayAgent,
  PersistentQueue,
  VirtualModbusMeter,
  topic,
} from "../apps/edge-gateway/src";

describe("edge gateway foundation", () => {
  it("uses versioned tenant-independent MQTT topics", () =>
    expect(topic("gw/a", "readings")).toBe(
      "meterwerk/v1/gateways/gw%2Fa/readings",
    ));
  it("reads virtual Modbus data and publishes through the transport", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meterwerk-edge-test-"));
    const sent: string[] = [];
    const driver = new VirtualModbusMeter();
    const agent = new EdgeGatewayAgent(
      "gw-1",
      "dev-1",
      driver,
      {
        publishReading: async (x) => {
          sent.push(x.messageId);
        },
        publishHeartbeat: async () => undefined,
      },
      new PersistentQueue(join(directory, "queue.json")),
    );
    try {
      await agent.start();
      await agent.poll();
      expect(sent).toHaveLength(1);
    } finally {
      await agent.stop();
      await rm(directory, { recursive: true });
    }
  });
});
