import type { GatewayHeartbeat, ReadingMessage } from "./types";

export const topic = (
  gatewayId: string,
  kind: "readings" | "heartbeat" | "status" | "events",
) => `meterwerk/v1/gateways/${encodeURIComponent(gatewayId)}/${kind}`;
export interface MessageTransport {
  publishReading(message: ReadingMessage): Promise<void>;
  publishHeartbeat(heartbeat: GatewayHeartbeat): Promise<void>;
}
export class MqttTransport implements MessageTransport {
  constructor(
    private readonly gatewayId: string,
    private readonly publish: (topic: string, payload: string) => Promise<void>,
  ) {}
  publishReading(message: ReadingMessage) {
    return this.publish(
      topic(this.gatewayId, "readings"),
      JSON.stringify(message),
    );
  }
  publishHeartbeat(heartbeat: GatewayHeartbeat) {
    return this.publish(
      topic(this.gatewayId, "heartbeat"),
      JSON.stringify(heartbeat),
    );
  }
}
