import type { MeterDriver } from "./types";

export type RegisterMap = {
  totalEnergyImport: number;
  powerActive: number;
  voltageL1: number;
  voltageL2: number;
  voltageL3: number;
  currentL1: number;
  currentL2: number;
  currentL3: number;
  frequency: number;
};

export class ModbusDriver implements MeterDriver {
  constructor(
    private readonly config: {
      protocol: "MODBUS_TCP" | "MODBUS_RTU";
      host?: string;
      port?: number;
      slaveId?: number;
      registerMap: RegisterMap;
    },
  ) {}
  async connect() {
    /* transport-specific connector is intentionally injected later */
  }
  async read(): Promise<Record<string, number>> {
    throw new Error(
      `Modbus transport not configured for ${this.config.protocol}`,
    );
  }
  async health() {
    return "WARNING" as const;
  }
  async disconnect() {}
}

export class VirtualModbusMeter implements MeterDriver {
  private connected = false;
  private total = 12000;
  async connect() {
    this.connected = true;
  }
  async read() {
    if (!this.connected) throw new Error("not connected");
    const power = 250 + Math.random() * 900;
    this.total += power / 360000;
    return {
      totalEnergyImport: this.total,
      powerActive: power,
      voltageL1: 230 + Math.random(),
      voltageL2: 231 + Math.random(),
      voltageL3: 229 + Math.random(),
      currentL1: power / 230,
      currentL2: power / 231,
      currentL3: power / 229,
      frequency: 50 + (Math.random() - 0.5) * 0.05,
    };
  }
  async health() {
    return this.connected ? ("ONLINE" as const) : ("OFFLINE" as const);
  }
  async disconnect() {
    this.connected = false;
  }
}
