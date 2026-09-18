import "dotenv/config";
import "server-only";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { db } from "./db";
if (
  process.env.SEED_DEMO !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Local demo database required");
await mkdir(".local", { recursive: true });
async function keypair(name: string) {
  let privateKey: string;
  try {
    privateKey = await readFile(`.local/${name}-private.pem`, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    privateKey = generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    await writeFile(`.local/${name}-private.pem`, privateKey, {
      flag: "wx",
      mode: 0o600,
    });
  }
  const publicKey = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" })
    .toString();
  await writeFile(`.local/${name}-public.pem`, publicKey);
  return publicKey;
}
try {
  const publicKey = await keypair("gateway");
  await keypair("receipt");
  const tenantId = "demo-tenant-0",
    gatewayId = "demo-edge-gateway",
    deviceId = "demo-modbus-device",
    meterId = "demo-modbus-meter",
    credentialId = "demo-edge-credential";
  await db.$transaction(async (tx) => {
    await tx.gateway.upsert({
      where: { id: gatewayId },
      update: {},
      create: {
        id: gatewayId,
        tenantId,
        name: "Demo Edge Gateway",
        externalGatewayId: gatewayId,
        manufacturer: "Meterwerk",
        model: "Local Edge",
        status: "OFFLINE",
        installedAt: new Date(),
      },
    });
    await tx.meter.upsert({
      where: { id: meterId },
      update: {},
      create: {
        id: meterId,
        tenantId,
        unitId: "demo-tenant-0-property-0-building-unit-0",
        serialNumber: "MODBUS-DEMO-001",
        type: "ELECTRICITY",
        manufacturer: "Meterwerk",
        model: "Modbus TCP Simulator",
        measurementUnit: "kWh",
        location: "Lokaler Simulator",
        status: "OFFLINE",
        installedAt: new Date(),
        demoPricePerUnit: "0.32",
      },
    });
    await tx.device.upsert({
      where: { id: deviceId },
      update: {},
      create: {
        id: deviceId,
        tenantId,
        meterId,
        gatewayId,
        externalDeviceId: deviceId,
        manufacturer: "Meterwerk",
        model: "Modbus TCP",
        protocol: "MODBUS",
        status: "OFFLINE",
        installedAt: new Date(),
      },
    });
    const credential = await tx.gatewayCredential.findUnique({
      where: { id: credentialId },
    });
    if (
      credential &&
      (credential.publicKey !== publicKey ||
        credential.tenantId !== tenantId ||
        credential.gatewayId !== gatewayId ||
        credential.status !== "ACTIVE")
    )
      throw new Error(
        "Existing gateway credential differs; explicit rotation required",
      );
    if (!credential) {
      await tx.gatewayCredential.create({
        data: { id: credentialId, tenantId, gatewayId, publicKey },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: "demo-seed",
          action: "gateway.provision",
          entityId: gatewayId,
        },
      });
    }
  });
  await writeFile(
    ".local/edge-config.json",
    JSON.stringify({ gatewayId, deviceId, credentialId }),
  );
  console.log(`Demo provisioned: ${gatewayId}, ${deviceId}, MODBUS-DEMO-001`);
} finally {
  await db.$disconnect();
}
