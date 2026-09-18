export type GatewayStatus =
  | "ONLINE"
  | "OFFLINE"
  | "WARNING"
  | "MAINTENANCE"
  | "DISABLED";
export type MeterProtocol = "MODBUS_TCP" | "MODBUS_RTU" | "VIRTUAL";
export type ReadingQuality = "VALID" | "ESTIMATED" | "INVALID" | "SUSPECT";

export type ReadingMessage = {
  messageId: string;
  timestamp: string;
  value: number | string;
  consumption?: number | string;
  unit: "kWh" | "m³";
  quality: ReadingQuality;
  source: "MQTT" | "REST";
  deviceId: string;
};

export type GatewayHeartbeat = {
  gatewayId: string;
  timestamp: string;
  agentVersion: string;
  uptime: number;
  connectedDevices: number;
  queueSize: number;
};

export interface MeterDriver {
  connect(): Promise<void>;
  read(): Promise<Record<string, number>>;
  health(): Promise<"ONLINE" | "OFFLINE" | "WARNING">;
  disconnect(): Promise<void>;
}
