import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { hashDeviceToken, newDeviceToken } from "../src/server/device-auth";
import { ingestProtocolReading } from "../src/server/protocol-ingestion";
import {
  decodeMbusTelegram,
  decodeWmbusTelegram,
  pulseReading,
  decodeLorawanWebhook,
  mapVendorApiReading,
} from "../src/lib/protocols";
if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = "demo-multi-utility";
const cases = [
  [
    "WATER",
    "MBUS",
    (deviceId: string) =>
      decodeMbusTelegram({
        deviceId,
        tenantId,
        messageId: randomUUID(),
        timestamp: new Date().toISOString(),
        manufacturerCode: "MTR",
        medium: "WATER",
        serialNumber: "M",
        value: "30",
        unit: "m3",
      }),
  ],
  [
    "GAS",
    "WMBUS",
    (deviceId: string) =>
      decodeWmbusTelegram({
        deviceId,
        tenantId,
        messageId: randomUUID(),
        timestamp: new Date().toISOString(),
        utility: "GAS",
        value: "20",
        unit: "m3",
        frameCounter: Date.now(),
        mode: "T",
        securityMode: "NONE",
        rssi: -65,
        snr: 5,
      }),
  ],
  [
    "ELECTRICITY",
    "PULSE",
    (deviceId: string) =>
      pulseReading({
        deviceId,
        tenantId,
        messageId: randomUUID(),
        timestamp: new Date().toISOString(),
        utility: "ELECTRICITY",
        counter: "100",
        previousCounter: "0",
        impulsesPerUnit: "1000",
        unit: "kWh",
      }),
  ],
  [
    "WATER",
    "LORAWAN",
    (deviceId: string) =>
      decodeLorawanWebhook(
        {
          deviceId,
          tenantId,
          messageId: randomUUID(),
          timestamp: new Date().toISOString(),
          devEui: "0011223344556677",
          utility: "WATER",
          payload: { v: 40 },
          frameCounter: Date.now(),
        },
        (p) => [
          {
            metric: "VOLUME_TOTAL",
            value: String((p as { v: number }).v),
            unit: "m3",
          },
        ],
      ),
  ],
  [
    "ELECTRICITY",
    "VENDOR_API",
    (deviceId: string) =>
      mapVendorApiReading(
        {
          deviceId,
          tenantId,
          messageId: randomUUID(),
          timestamp: new Date().toISOString(),
          utility: "ELECTRICITY",
          values: { total: { value: "40", unit: "kWh" } },
        },
        { total: "ENERGY_IMPORT" },
      ),
  ],
] as const;
const changed: { deviceId: string; old: string }[] = [],
  readings: string[] = [],
  credentials: string[] = [];
try {
  for (const [utility, protocol, make] of cases) {
    const device = await db.device.findFirstOrThrow({
      where: { tenantId, meter: { type: utility } },
      orderBy: { id: "asc" },
    });
    const old = device.protocol;
    changed.push({ deviceId: device.id, old });
    await db.device.update({
      where: { id: device.id },
      data: { protocol: protocol as never, status: "ONLINE" },
    });
    const token = newDeviceToken();
    const credential = await db.deviceCredential.create({
      data: {
        tenantId,
        deviceId: device.id,
        tokenHash: hashDeviceToken(token),
      },
    });
    credentials.push(credential.id);
    const frame = make(device.id);
    const result = await ingestProtocolReading(`Bearer ${token}`, frame);
    readings.push(result.id);
    assert.equal(
      (await ingestProtocolReading(`Bearer ${token}`, frame)).duplicate,
      true,
    );
  }
  console.log(
    `${cases.length} protocol integration paths passed: decoder → central ingestion → PostgreSQL → idempotency`,
  );
} finally {
  await db.measurement.deleteMany({ where: { readingId: { in: readings } } });
  await db.reading.deleteMany({ where: { id: { in: readings }, tenantId } });
  await db.deviceCredential.deleteMany({ where: { id: { in: credentials } } });
  for (const item of changed)
    await db.device.update({
      where: { id: item.deviceId },
      data: { protocol: item.old as never },
    });
  await db.$disconnect();
}
