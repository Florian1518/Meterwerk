import { randomUUID } from "node:crypto";
import type { DriverCapabilities, MeterDriver } from "./types";
import {
  decodeMbusTelegram,
  decodeWmbusTelegram,
  pulseReading,
  type NormalizedProtocolReading,
} from "../../../src/lib/protocols";

abstract class EventDriver implements MeterDriver {
  protected connected = false;
  abstract getCapabilities(): DriverCapabilities;
  async connect() {
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  async health() {
    return this.connected ? ("ONLINE" as const) : ("OFFLINE" as const);
  }
  async testConnection() {
    return {
      ok: this.connected,
      detail: this.connected ? undefined : "not connected",
    };
  }
  abstract read(): Promise<Record<string, number>>;
}
export class VirtualMBusMeter extends EventDriver {
  private total = 1200;
  constructor(private readonly utility: "WATER" | "GAS" | "HEAT" = "WATER") {
    super();
  }
  async read() {
    if (!this.connected) throw new Error("not connected");
    this.total += 0.01;
    return { totalVolume: this.total };
  }
  getCapabilities(): DriverCapabilities {
    return {
      utility: this.utility,
      protocol: "MBUS",
      metrics: [this.utility === "HEAT" ? "ENERGY_TOTAL" : "VOLUME_TOTAL"],
      mode: "POLLING",
      bidirectional: false,
      manufacturer: "Meterwerk",
      model: "Virtual M-Bus",
    };
  }
  telegram(tenantId: string): NormalizedProtocolReading {
    return decodeMbusTelegram({
      deviceId: "virtual-mbus",
      tenantId,
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      manufacturerCode: "MTR",
      medium: this.utility,
      serialNumber: "MBUS-DEMO",
      value: this.total.toFixed(6),
      unit: this.utility === "HEAT" ? "kWh" : "m3",
    });
  }
}
export class VirtualWMBusMeter extends EventDriver {
  private total = 500;
  constructor(private readonly utility: "WATER" | "GAS" | "HEAT" = "WATER") {
    super();
  }
  async read() {
    if (!this.connected) throw new Error("not connected");
    this.total += 0.005;
    return { totalVolume: this.total };
  }
  getCapabilities(): DriverCapabilities {
    return {
      utility: this.utility,
      protocol: "WMBUS",
      metrics: [this.utility === "HEAT" ? "ENERGY_TOTAL" : "VOLUME_TOTAL"],
      mode: "EVENT",
      bidirectional: false,
      manufacturer: "Meterwerk",
      model: "Virtual wM-Bus",
    };
  }
  telegram(tenantId: string): NormalizedProtocolReading {
    return decodeWmbusTelegram({
      deviceId: "virtual-wmbus",
      tenantId,
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      utility: this.utility,
      value: this.total.toFixed(6),
      unit: this.utility === "HEAT" ? "kWh" : "m3",
      frameCounter: Math.floor(this.total),
      mode: "T",
      securityMode: "NONE",
      rssi: -61,
      snr: 8.2,
    });
  }
}
export class VirtualPulseMeter extends EventDriver {
  private counter = 0;
  constructor(
    private readonly utility: "ELECTRICITY" | "WATER" = "ELECTRICITY",
    private readonly impulsesPerUnit = "1000",
  ) {
    super();
  }
  async read() {
    if (!this.connected) throw new Error("not connected");
    this.counter += 15;
    return { counter: this.counter };
  }
  getCapabilities(): DriverCapabilities {
    return {
      utility: this.utility,
      protocol: "PULSE",
      metrics: [
        this.utility === "ELECTRICITY" ? "ENERGY_IMPORT" : "VOLUME_TOTAL",
        "CONSUMPTION",
      ],
      mode: "EVENT",
      bidirectional: false,
      manufacturer: "Meterwerk",
      model: "Virtual Pulse",
    };
  }
  telegram(
    tenantId: string,
    previousCounter?: string,
    previousTimestamp?: string,
  ): NormalizedProtocolReading {
    return pulseReading({
      deviceId: "virtual-pulse",
      tenantId,
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      utility: this.utility,
      counter: String(this.counter),
      previousCounter,
      previousTimestamp,
      impulsesPerUnit: this.impulsesPerUnit,
      unit: this.utility === "ELECTRICITY" ? "kWh" : "m3",
    });
  }
}
export class VirtualLoRaWANDevice extends EventDriver {
  private total = 0;
  async read() {
    if (!this.connected) throw new Error("not connected");
    this.total += 0.02;
    return { totalVolume: this.total };
  }
  getCapabilities(): DriverCapabilities {
    return {
      utility: "WATER",
      protocol: "LORAWAN",
      metrics: ["VOLUME_TOTAL"],
      mode: "EVENT",
      bidirectional: false,
      manufacturer: "Meterwerk",
      model: "Virtual LoRaWAN",
    };
  }
  webhook(tenantId: string): NormalizedProtocolReading {
    return {
      deviceId: "virtual-lorawan",
      tenantId,
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      protocol: "LORAWAN",
      utility: "WATER",
      measurements: [
        {
          metric: "VOLUME_TOTAL",
          value: this.total.toFixed(6),
          unit: "m3",
          quality: "VALID",
        },
      ],
      signal: { rssi: -72, snr: 6.5 },
      frameCounter: Math.floor(this.total * 100),
    };
  }
}
