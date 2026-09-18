import { describe, it, expect, vi } from "vitest";
import type { AddressInfo } from "node:net";
import {
  profiles,
  profileSchema,
  modbusConfigSchema,
  defaultConfig,
  getProfile,
  diagnosticStatus,
  offlineAfter,
  type SimulatorFault,
} from "../src/lib/modbus/contracts";
import {
  decodeRegister,
  crc16,
  validateResponse,
} from "../apps/edge-gateway/src/registers";
import { pollHardware, allowEndpoint } from "../apps/edge-gateway/src/hardware";
import { tcpRead } from "../apps/edge-gateway/src/modbus-transport";
import { simulatorServer } from "../apps/edge-gateway/src/simulator";
import { csvCell, csvDocument } from "../src/lib/modbus/csv";
import { ManagedRuntime } from "../apps/edge-gateway/src/managed-runtime";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

describe("gateway restart and offline configuration", () => {
  it("keeps authorized polling beyond control expiry and persists STOP across restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meterwerk-runtime-"));
    const samples: unknown[] = [];
    const file = join(directory, "results.json");
    const create = () =>
      new ManagedRuntime(file, { tcp: [], serial: [] }, async (sample) => {
        samples.push(sample);
      });
    const runtime = create();
    const control = {
      requestId: randomUUID(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      acknowledged: [],
      devices: [
        {
          deviceId: "test",
          revision: 1,
          configuration: defaultConfig,
          profile: profiles[0],
          enabled: true,
          disabled: false,
        },
      ],
      commands: [],
    };
    try {
      await runtime.configure(control);
      const restarted = create();
      await restarted.load();
      expect(restarted.hasDevice("test")).toBe(true);
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120000);
      try {
        await restarted.tick();
      } finally {
        clock.mockRestore();
      }
      expect(samples).toHaveLength(1);
      // Denied endpoints prove cached polling executes without opening a real device.
      expect(samples[0]).toMatchObject({ error: "ENDPOINT_NOT_ALLOWED" });
      await restarted.configure({
        ...control,
        commands: [
          {
            id: "stop",
            deviceId: "test",
            revision: 1,
            action: "STOP",
            expiresAt: control.expiresAt,
          },
        ],
      });
      await restarted.tick();
      const stopped = create();
      await stopped.load();
      await stopped.tick();
      expect(samples).toHaveLength(1);
      expect(stopped.results).toEqual([{ id: "stop", ok: true, error: null }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("Modbus profiles and connection configuration", () => {
  it("contains all fourteen quantities and keeps unknown hardware addresses unverified", () => {
    expect(profiles[0].registers).toHaveLength(14);
    expect(profiles[1].verified).toBe(false);
    expect(profiles[1].registers.every((r) => r.address === null)).toBe(true);
  });
  it("rejects duplicate quantities, invalid lengths and mismatched units", () => {
    const p = profiles[0];
    expect(
      profileSchema.safeParse({
        ...p,
        registers: [p.registers[0], p.registers[0]],
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        ...p,
        registers: [{ ...p.registers[0], length: 1 }],
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        ...p,
        registers: [{ ...p.registers[0], unit: "V" }],
      }).success,
    ).toBe(false);
  });
  it("validates RTU configuration and forbids broadcast slave IDs and 7-bit RTU", () => {
    const c = {
      interface: "RTU",
      profileId: profiles[0].id,
      pollingIntervalMs: 5000,
      timeoutMs: 1000,
      comPort: "COM3",
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "even",
      slaveId: 1,
    };
    expect(modbusConfigSchema.parse(c).interface).toBe("RTU");
    for (const patch of [
      { slaveId: 0 },
      { slaveId: 248 },
      { dataBits: 7 },
      { baudRate: 123 },
      { parity: "mark" },
      { comPort: "../../secret" },
    ])
      expect(modbusConfigSchema.safeParse({ ...c, ...patch }).success).toBe(
        false,
      );
    expect(
      modbusConfigSchema.safeParse({
        ...c,
        comPort: "/dev/serial/by-id/usb-adapter",
      }).success,
    ).toBe(true);
  });
  it("validates TCP endpoints, Unit-ID, intervals and unexpected fields", () => {
    expect(modbusConfigSchema.parse(defaultConfig).interface).toBe("TCP");
    for (const patch of [
      { port: 0 },
      { port: 65536 },
      { unitId: 0 },
      { unitId: 248 },
      { host: "https://example.com/path" },
      { pollingIntervalMs: 10 },
      { timeoutMs: 0 },
      { role: "SUPER_ADMIN" },
    ])
      expect(
        modbusConfigSchema.safeParse({ ...defaultConfig, ...patch }).success,
      ).toBe(false);
  });
  it("requires an explicit local endpoint allowlist", () => {
    expect(() => allowEndpoint(defaultConfig, { tcp: [], serial: [] })).toThrow(
      "ENDPOINT_NOT_ALLOWED",
    );
    expect(() =>
      allowEndpoint(defaultConfig, { tcp: ["127.0.0.1:1502"], serial: [] }),
    ).not.toThrow();
  });
});
describe("register decoding", () => {
  const base = profiles[0].registers[0];
  it("scales uint64 without JS number precision loss", () => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(9007199254740993n);
    expect(decodeRegister(b, { ...base, max: "99999999999999" })).toBe(
      "9007199254.740993",
    );
  });
  it.each(["BE", "LE"] as const)(
    "handles %s byte order with both word orders",
    (byteOrder) => {
      for (const wordOrder of ["BE", "LE"] as const) {
        const value = Buffer.alloc(4);
        value.writeUInt32BE(123456);
        let words = [value.subarray(0, 2), value.subarray(2, 4)];
        if (byteOrder === "LE")
          words = words.map((w) => Buffer.from([w[1], w[0]]));
        if (wordOrder === "LE") words.reverse();
        expect(
          decodeRegister(Buffer.concat(words), {
            ...base,
            dataType: "uint32",
            length: 2,
            scale: "0.01",
            byteOrder,
            wordOrder,
          }),
        ).toBe("1234.560000");
      }
    },
  );
  it("decodes signed registers and floats", () => {
    const b = Buffer.alloc(4);
    b.writeFloatBE(-12.5);
    expect(
      decodeRegister(b, {
        ...base,
        dataType: "float32",
        length: 2,
        scale: "1",
        min: "-100",
      }),
    ).toBe("-12.500000");
    const signed = Buffer.alloc(2);
    signed.writeInt16BE(-123);
    expect(
      decodeRegister(signed, {
        ...base,
        dataType: "int16",
        length: 1,
        scale: "0.1",
        min: "-100",
      }),
    ).toBe("-12.300000");
  });
  it("rejects NaN, infinity and out-of-range quantities", () => {
    const r = profiles[0].registers.find((r) => r.metric === "voltageL1")!;
    for (const value of [NaN, Infinity, 99999]) {
      const b = Buffer.alloc(4);
      b.writeFloatBE(value);
      expect(() => decodeRegister(b, r)).toThrow("UNREALISTIC");
    }
  });
  it("checks a known Modbus CRC and rejects malformed RTU frames", () => {
    expect(crc16(Buffer.from("01030000000a", "hex"))).toBe(0xcdc5);
    const frame = Buffer.from([1, 3, 2, 0, 42, 0, 0]);
    frame.writeUInt16LE(crc16(frame.subarray(0, 5)), 5);
    expect(validateResponse(frame, 1, 3, 1, true).readUInt16BE()).toBe(42);
    frame[4] = 43;
    expect(() => validateResponse(frame, 1, 3, 1, true)).toThrow("CRC");
  });
});
describe("real TCP simulator and hardware polling", () => {
  async function withServer(
    fn: (
      config: typeof defaultConfig,
      setFault: (fault: SimulatorFault) => void,
    ) => Promise<void>,
  ) {
    let fault: SimulatorFault = "NONE";
    const server = simulatorServer({
      fault: async () => fault,
      energy: async () => 12000123456n,
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const config = {
      ...defaultConfig,
      interface: "TCP" as const,
      port: (server.address() as AddressInfo).port,
      timeoutMs: 100,
    };
    try {
      await fn(config, (value) => {
        fault = value;
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
  it("reads all quantities and reconnects after a communication outage", async () => {
    await withServer(async (config, setFault) => {
      const profile = getProfile(config.profileId);
      let sample = await pollHardware("device", 1, config, profile);
      expect(sample.error).toBeNull();
      expect(sample.values).toHaveLength(14);
      expect(sample.values.find((v) => v.metric === "voltageL1")?.value).toBe(
        "230.000000",
      );
      setFault("DISCONNECTED");
      sample = await pollHardware("device", 1, config, profile);
      expect(sample.error).toBe("DISCONNECTED");
      setFault("NONE");
      expect(
        (await pollHardware("device", 1, config, profile)).error,
      ).toBeNull();
    });
  });
  it.each([
    "TIMEOUT",
    "WRONG_SLAVE",
    "DISCONNECTED",
    "INVALID_REGISTER",
    "UNREALISTIC",
    "COMMUNICATION",
  ] as const)("reports %s without fake readings", async (fault) => {
    await withServer(async (config, setFault) => {
      setFault(fault);
      expect((await pollHardware("device", 1, config, profiles[0])).error).toBe(
        fault,
      );
    });
  });
  it("times out for a wrong requested Slave-ID", async () => {
    await withServer(async (config) => {
      expect(config.interface).toBe("TCP");
      await expect(
        tcpRead(
          {
            ...config,
            interface: "TCP",
            host: "127.0.0.1",
            port: config.interface === "TCP" ? config.port : 0,
            unitId: 2,
          },
          profiles[0].registers[0],
        ),
      ).rejects.toThrow("TIMEOUT");
    });
  });
  it("does not connect using an unverified template", async () => {
    expect(
      (
        await pollHardware(
          "device",
          1,
          { ...defaultConfig, profileId: profiles[1].id },
          profiles[1],
        )
      ).error,
    ).toBe("PROFILE");
  });
});
describe("diagnostics and CSV", () => {
  it("transitions WARNING to OFFLINE and recovers ONLINE", () => {
    expect(diagnosticStatus("TIMEOUT", 1)).toBe("WARNING");
    expect(diagnosticStatus("TIMEOUT", 3)).toBe("OFFLINE");
    expect(diagnosticStatus("DISCONNECTED", 1)).toBe("OFFLINE");
    expect(diagnosticStatus(null, 0)).toBe("ONLINE");
    expect(
      offlineAfter({ ...defaultConfig, pollingIntervalMs: 60000 }),
    ).toBeGreaterThan(180000);
  });
  it("quotes semicolons, quotes and spreadsheet formulas", () => {
    expect(csvCell('a;"b')).toBe('"a;""b"');
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell("-12.5")).toBe('"-12.5"');
    expect(
      csvDocument(["UTC", "Wert"], [["2026-09-18T00:00:00Z", "1.234567"]]),
    ).toContain('"1.234567"\r\n');
  });
});
