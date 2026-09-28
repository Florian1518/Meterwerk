import "dotenv/config";
import "server-only";
import { db } from "./db";
import { newDeviceToken, hashDeviceToken } from "./device-auth";
import { ingestUtility } from "./utility-ingestion";
import { utilities } from "../lib/utility";
import { VirtualMeter } from "../lib/utility-simulator";
import { changePlan } from "./licensing";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.SEED_DEMO !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw new Error("Nur ausdrücklich freigegebene lokale Demo-Datenbank.");
const tenantId = "demo-multi-utility";
try {
  await db.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: "Multi-Utility Demo", slug: tenantId },
  });
  // The normal ingestion path enforces licensing, including for a synthetic tenant.
  // Preserve an existing subscription instead of overwriting its plan.
  if (!(await db.subscription.findFirst({ where: { tenantId } }))) {
    await changePlan(
      {
        id: "demo-seed",
        tenantId: null,
        role: "SUPER_ADMIN",
        name: "Demo seed",
        email: "seed@example.invalid",
      },
      { tenantId, plan: "BASIC" },
    );
  }
  await db.property.upsert({
    where: { id: `${tenantId}-property` },
    update: {},
    create: {
      id: `${tenantId}-property`,
      tenantId,
      name: "Demo-Liegenschaft",
      address: "Virtueller Standort 1",
      city: "Demo",
    },
  });
  await db.building.upsert({
    where: { id: `${tenantId}-building` },
    update: {},
    create: {
      id: `${tenantId}-building`,
      tenantId,
      propertyId: `${tenantId}-property`,
      name: "Demo-Gebäude",
    },
  });
  await db.unit.upsert({
    where: { id: `${tenantId}-unit` },
    update: {},
    create: {
      id: `${tenantId}-unit`,
      tenantId,
      buildingId: `${tenantId}-building`,
      name: "Technik",
      floor: "EG",
      area: "100",
    },
  });
  for (const type of utilities) {
    const id = `${tenantId}-${type}`;
    await db.meter.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        unitId: `${tenantId}-unit`,
        type,
        serialNumber: id,
        manufacturer: "Meterwerk",
        model: `Virtual${type}`,
        measurementUnit: ["WATER", "GAS"].includes(type) ? "m³" : "kWh",
        location: "Demo-Technikraum",
        installedAt: new Date(),
        demoPricePerUnit: "0",
      },
    });
    await db.device.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        meterId: id,
        externalDeviceId: id,
        manufacturer: "Meterwerk",
        model: "Virtueller Zähler",
        protocol: "VIRTUAL",
        status: "ONLINE",
        installedAt: new Date(),
      },
    });
    if (!(await db.tariff.findFirst({ where: { tenantId, utility: type } }))) {
      const prices = {
        ELECTRICITY: "0.32",
        WATER: "2.10",
        GAS: "1.20",
        HEAT: "0.10",
      };
      await db.$transaction(async (tx) => {
        const tariff = await tx.tariff.create({
          data: {
            tenantId,
            utility: type,
            validFrom: new Date(
              Date.UTC(
                new Date().getUTCFullYear(),
                new Date().getUTCMonth(),
                1,
              ),
            ),
            unit: ["WATER", "GAS"].includes(type) ? "m3" : "kWh",
            price: prices[type],
            basePerDay: "0",
          },
        });
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorId: "demo-seed",
            action: "utility.tariff.create",
            entityId: tariff.id,
          },
        });
      });
    }
    const token = newDeviceToken();
    const credential = await db.deviceCredential.create({
      data: { tenantId, deviceId: id, tokenHash: hashDeviceToken(token) },
    });
    try {
      const previous = await db.reading.findFirst({
        where: { tenantId, meterId: id },
        orderBy: { timestamp: "desc" },
        include: { measurements: true },
      });
      const simulator = new VirtualMeter(
        type,
        previous?.registerValue.toString() ?? "0",
        process.argv.includes("--leak") && type === "WATER",
        {
          export: previous?.measurements
            .find((m) => m.metric === "ENERGY_EXPORT")
            ?.value.toString(),
          volume: previous?.measurements
            .find((m) => m.metric === "VOLUME_TOTAL")
            ?.value.toString(),
        },
      );
      const now = Date.now();
      // 24 hours at quarter-hour resolution, all through the authenticated ingestion service.
      for (let i = previous ? 95 : 0; i <= 96; i++) {
        const timestamp = new Date(now - (96 - i) * 900000);
        if (previous && timestamp <= previous.timestamp) continue;
        await ingestUtility(`Bearer ${token}`, simulator.sample(timestamp));
      }
      console.log(`${type}: Simulation durch normale Ingestion abgeschlossen.`);
    } finally {
      await db.deviceCredential.update({
        where: { id: credential.id },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }
  }
} finally {
  await db.$disconnect();
}
