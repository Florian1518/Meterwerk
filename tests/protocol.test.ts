import { describe, expect, it } from "vitest";
import {
  decodeMbusTelegram,
  decodeWmbusTelegram,
  mapVendorApiReading,
  pulseReading,
  decodeLorawanWebhook,
  protocolConfigSchema,
} from "../src/lib/protocols";
import {
  VirtualMBusMeter,
  VirtualWMBusMeter,
  VirtualPulseMeter,
  VirtualLoRaWANDevice,
} from "../apps/edge-gateway/src/protocol-drivers";
describe("protocol adapters", () => {
  const base = {
    deviceId: "d",
    tenantId: "t",
    messageId: "m",
    timestamp: "2026-09-21T00:00:00Z",
  };
  it("decodes M-Bus and wM-Bus without vendor assumptions", () => {
    expect(
      decodeMbusTelegram({
        ...base,
        manufacturerCode: "MTR",
        medium: "WATER",
        serialNumber: "1",
        value: "12.3",
        unit: "m3",
      }).measurements[0].metric,
    ).toBe("VOLUME_TOTAL");
    expect(
      decodeWmbusTelegram({
        ...base,
        utility: "HEAT",
        value: "4",
        unit: "kWh",
        frameCounter: 4,
        mode: "T",
        securityMode: "NONE",
      }).signal,
    ).toEqual({ rssi: undefined, snr: undefined });
  });
  it("calculates pulse consumption, flow and rollover with Decimal", () => {
    const value = pulseReading({
      ...base,
      utility: "WATER",
      counter: "5",
      previousCounter: "999",
      previousTimestamp: "2026-09-20T23:00:00Z",
      impulsesPerUnit: "10",
      rollover: "1000",
      unit: "m3",
    });
    expect(value.measurements[0].value).toBe("0.600000");
    expect(value.measurements[2].metric).toBe("FLOW_RATE");
  });
  it("supports exchangeable LoRaWAN and vendor mappings", () => {
    expect(
      decodeLorawanWebhook(
        {
          ...base,
          devEui: "0011223344556677",
          utility: "WATER",
          payload: { v: 3 },
          frameCounter: 8,
        },
        (p) => [
          {
            metric: "VOLUME_TOTAL",
            value: String((p as { v: number }).v),
            unit: "m3",
          },
        ],
      ).protocol,
    ).toBe("LORAWAN");
    expect(
      mapVendorApiReading(
        {
          ...base,
          utility: "ELECTRICITY",
          values: { total: { value: "2", unit: "kWh" } },
        },
        { total: "ENERGY_IMPORT" },
      ).measurements[0].metric,
    ).toBe("ENERGY_IMPORT");
  });
  it("validates protocol-specific configuration and never requires secrets inline", () => {
    expect(
      protocolConfigSchema.parse({
        protocol: "MBUS",
        port: "COM3",
        baudRate: 2400,
        primaryAddress: 1,
        manufacturerCode: "MTR",
        medium: "WATER",
      }).protocol,
    ).toBe("MBUS");
    expect(() =>
      protocolConfigSchema.parse({
        protocol: "WMBUS",
        deviceId: "x",
        manufacturerCode: "MTR",
        mode: "T",
        securityMode: "OMS_AES128",
        encryptionKey: "secret",
      }),
    ).toThrow();
  });
  it("runs all protocol simulators as drivers", async () => {
    for (const driver of [
      new VirtualMBusMeter(),
      new VirtualWMBusMeter(),
      new VirtualPulseMeter(),
      new VirtualLoRaWANDevice(),
    ]) {
      await driver.connect();
      expect((await driver.testConnection()).ok).toBe(true);
      expect(driver.getCapabilities().protocol).toBeTruthy();
      await driver.read();
      await driver.disconnect();
    }
  });
});
