import "dotenv/config";
import { VirtualMeter } from "../src/lib/utility-simulator";
import { db } from "../src/server/db";
import { hashDeviceToken, newDeviceToken } from "../src/server/device-auth";
const base = process.env.APP_URL ?? "http://localhost:3000";
const tenantId = process.env.VIRTUAL_TENANT_ID ?? "demo-tenant-0";
const intervalMs = 15 * 60_000;
const once = process.argv.includes("--once");
const create = process.argv.includes("--create");
let createdToken: string | undefined;
const meter = await db.meter.findFirst({
  where: {
    tenantId,
    type:
      (process.env.VIRTUAL_TYPE as "ELECTRICITY" | "WATER" | "GAS" | "HEAT") ??
      "ELECTRICITY",
  },
  orderBy: { serialNumber: "asc" },
});
if (!meter)
  throw new Error(
    "Kein passender Meter für den virtuellen Simulator gefunden.",
  );
let device = await db.device.findFirst({
  where: { tenantId, meterId: meter.id, protocol: "VIRTUAL" },
});
if (!device && create) {
  device = await db.device.create({
    data: {
      tenantId,
      meterId: meter.id,
      externalDeviceId: `virtual-${meter.serialNumber}`,
      manufacturer: "Meterwerk",
      model: "Virtual Meter",
      firmwareVersion: "2.0.0",
      protocol: "VIRTUAL",
      status: "ONLINE",
      installedAt: new Date(),
    },
  });
  if (device) {
    const token = newDeviceToken();
    createdToken = token;
    await db.deviceCredential.create({
      data: {
        tenantId,
        deviceId: device.id,
        tokenHash: hashDeviceToken(token),
      },
    });
    console.log(
      `Virtual Device erstellt: ${device.externalDeviceId}. Credential bleibt ausschließlich im Prozessspeicher.`,
    );
  }
}
if (!device)
  throw new Error(
    "Kein virtueller Device vorhanden. Mit --create einmalig anlegen.",
  );
const credential = await db.deviceCredential.findFirst({
  where: { deviceId: device.id, status: "ACTIVE" },
});
if (!credential) throw new Error("Kein aktives Device-Credential vorhanden.");
// Token is deliberately never read back from a hash. For operation, use VIRTUAL_DEVICE_TOKEN supplied at creation time.
const token = process.env.VIRTUAL_DEVICE_TOKEN ?? createdToken;
if (!token) {
  await db.$disconnect();
  throw new Error(
    "VIRTUAL_DEVICE_TOKEN aus der autorisierten Device-Credential-Verwaltung setzen.",
  );
}
const previous = await db.reading.findFirst({
  where: { tenantId, meterId: meter.id },
  orderBy: { timestamp: "desc" },
  include: { measurements: true },
});
const simulator = new VirtualMeter(
  meter.type,
  previous?.registerValue.toString() ?? "0",
  process.argv.includes("--leak"),
  {
    export: previous?.measurements
      .find((m) => m.metric === "ENERGY_EXPORT")
      ?.value.toString(),
    volume: previous?.measurements
      .find((m) => m.metric === "VOLUME_TOTAL")
      ?.value.toString(),
  },
);
async function send() {
  const now = new Date();
  const response = await fetch(`${base}/api/v1/ingest/readings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(simulator.sample(now)),
  });
  console.log(
    `${now.toISOString()} ${response.status} ${await response.text()}`,
  );
}
await send();
if (!once) {
  console.log(
    `Virtual Meter läuft mit 15-Minuten-Intervall für ${meter.serialNumber}.`,
  );
  setInterval(send, intervalMs);
} else await db.$disconnect();
