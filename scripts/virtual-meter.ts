import "dotenv/config";
import { db } from "../src/server/db";
import { hashDeviceToken, newDeviceToken } from "../src/server/device-auth";
const base = process.env.APP_URL ?? "http://localhost:3000";
const tenantId = process.env.VIRTUAL_TENANT_ID ?? "demo-tenant-0";
const intervalMs = 15 * 60_000;
const once = process.argv.includes("--once");
const create = process.argv.includes("--create");
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
    await db.deviceCredential.create({
      data: {
        tenantId,
        deviceId: device.id,
        tokenHash: hashDeviceToken(token),
      },
    });
    console.log(
      `Virtual Device erstellt: ${device.externalDeviceId}\nDevice-Token (nur jetzt sichtbar): ${token}`,
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
const token = process.env.VIRTUAL_DEVICE_TOKEN;
if (!token) {
  await db.$disconnect();
  throw new Error(
    "VIRTUAL_DEVICE_TOKEN setzen; der Token wird bei --create nur einmal ausgegeben.",
  );
}
let register = Number(
  (
    await db.reading.findFirst({
      where: { meterId: meter.id },
      orderBy: { timestamp: "desc" },
      select: { registerValue: true },
    })
  )?.registerValue ?? 0,
);
let sequence = Date.now();
async function send() {
  const now = new Date();
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const profile =
    hour < 6
      ? 0.35
      : hour < 9
        ? 1.25
        : hour < 18
          ? 1.0
          : hour < 22
            ? 0.8
            : 0.45;
  const noise = 0.95 + Math.random() * 0.1;
  const consumption = Number((profile * noise).toFixed(6));
  register += consumption;
  const response = await fetch(`${base}/api/v1/ingest/readings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messageId: `virtual-${device!.id}-${sequence++}`,
      timestamp: now.toISOString(),
      value: Number(register.toFixed(6)),
      consumption,
      unit: meter!.measurementUnit,
      quality: "VALID",
      source: "REST",
    }),
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
