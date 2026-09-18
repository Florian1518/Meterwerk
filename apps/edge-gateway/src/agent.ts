import { randomUUID } from "node:crypto";
import { PersistentQueue } from "./queue";
import type { GatewayHeartbeat, MeterDriver, ReadingMessage } from "./types";
import type { MessageTransport } from "./mqtt";

export class EdgeGatewayAgent {
  private startedAt = Date.now();
  constructor(
    private readonly gatewayId: string,
    private readonly deviceId: string,
    private readonly driver: MeterDriver,
    private readonly transport: MessageTransport,
    private readonly queue = new PersistentQueue(),
  ) {}
  async poll() {
    const values = await this.driver.read();
    const message: ReadingMessage = {
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      value: values.totalEnergyImport,
      consumption: values.powerActive / 360000,
      unit: "kWh",
      quality: "VALID",
      source: "MQTT",
      deviceId: this.deviceId,
    };
    await this.queue.enqueue(message);
    await this.flush();
    return message;
  }
  async flush() {
    await this.queue.drain((item) => this.transport.publishReading(item));
  }
  heartbeat(): GatewayHeartbeat {
    return {
      gatewayId: this.gatewayId,
      timestamp: new Date().toISOString(),
      agentVersion: "0.1.0",
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      connectedDevices: 1,
      queueSize: this.queue.size,
    };
  }
  async start() {
    await this.driver.connect();
  }
  async stop() {
    await this.driver.disconnect();
  }
}
