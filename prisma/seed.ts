import "dotenv/config";
import {
  PrismaClient,
  type MeterType,
  type FeatureKey,
  type Prisma,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/server/password";
if (
  process.env.SEED_DEMO !== "true" ||
  !["development", "test", "demo"].includes(
    process.env.METERWERK_ENV ?? process.env.NODE_ENV ?? "development",
  )
)
  throw new Error(
    "Demo-Seed benötigt SEED_DEMO=true und eine Entwicklungsumgebung.",
  );
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 14)
  throw new Error("DEMO_PASSWORD mit mindestens 14 Zeichen setzen.");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const now = new Date();
const today = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);
const previous = new Date(
  Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1),
);
const previousEnd = new Date(
  Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1),
);
const types: MeterType[] = ["ELECTRICITY", "WATER", "GAS", "HEAT"];
try {
  const passwordHash = await hashPassword(password);
  const planDefinitions = [
    {
      id: "plan-basic",
      code: "BASIC" as const,
      name: "Basic",
      maxProperties: 5,
      maxMeters: 100,
      maxUsers: 5,
      maxGateways: 1,
      supportLevel: "STANDARD" as const,
      features: ["REPORTING", "API"] as const,
    },
    {
      id: "plan-professional",
      code: "PROFESSIONAL" as const,
      name: "Professional",
      maxProperties: 50,
      maxMeters: 2000,
      maxUsers: 25,
      maxGateways: 10,
      supportLevel: "PRIORITY" as const,
      features: [
        "REPORTING",
        "ANALYTICS",
        "API",
        "WEBHOOKS",
        "ADVANCED_EXPORTS",
      ] as const,
    },
    {
      id: "plan-enterprise",
      code: "ENTERPRISE" as const,
      name: "Enterprise",
      maxProperties: 2147483647,
      maxMeters: 2147483647,
      maxUsers: 2147483647,
      maxGateways: 2147483647,
      supportLevel: "DEDICATED" as const,
      features: [
        "REPORTING",
        "ANALYTICS",
        "API",
        "WEBHOOKS",
        "ADVANCED_EXPORTS",
      ] as const,
    },
  ];
  for (const definition of planDefinitions) {
    await db.plan.upsert({
      where: { code: definition.code },
      update: {
        name: definition.name,
        maxProperties: definition.maxProperties,
        maxMeters: definition.maxMeters,
        maxUsers: definition.maxUsers,
        maxGateways: definition.maxGateways,
        supportLevel: definition.supportLevel,
      },
      create: {
        id: definition.id,
        code: definition.code,
        name: definition.name,
        maxProperties: definition.maxProperties,
        maxMeters: definition.maxMeters,
        maxUsers: definition.maxUsers,
        maxGateways: definition.maxGateways,
        supportLevel: definition.supportLevel,
        features: {
          create: [
            "REPORTING",
            "ANALYTICS",
            "API",
            "WEBHOOKS",
            "ADVANCED_EXPORTS",
          ].map((feature) => ({
            feature: feature as FeatureKey,
            enabled: (definition.features as readonly string[]).includes(
              feature,
            ),
          })),
        },
      },
    });
  }
  await db.user.upsert({
    where: { email: "admin@meterwerk.demo" },
    update: {},
    create: {
      id: "platform-admin",
      name: "Alex Weber",
      email: "admin@meterwerk.demo",
      role: "SUPER_ADMIN",
      passwordHash,
    },
  });
  for (let t = 0; t < 2; t++) {
    const tenantId = `demo-tenant-${t}`;
    await db.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        name: t === 0 ? "Nordstern Immobilien" : "Rheinblick Quartiere",
        slug: t === 0 ? "nordstern" : "rheinblick",
      },
    });
    await db.subscription.upsert({
      where: { id: `subscription-${tenantId}` },
      update: {
        plan: { connect: { code: "BASIC" as const } },
        status: "ACTIVE",
        endsAt: null,
      },
      create: {
        id: `subscription-${tenantId}`,
        tenant: { connect: { id: tenantId } },
        plan: { connect: { code: "BASIC" as const } },
        status: "ACTIVE",
      },
    });
    for (const [i, role] of (
      ["TENANT_ADMIN", "MANAGER", "USER"] as const
    ).entries()) {
      await db.user.upsert({
        where: { id: `${tenantId}-user-${i}` },
        update: {},
        create: {
          id: `${tenantId}-user-${i}`,
          tenantId,
          role,
          name: ["Lena Hoffmann", "Jonas Becker", "Mia Fischer"][i],
          email: `${["verwaltung", "management", "user"][i]}@${t === 0 ? "nordstern" : "rheinblick"}.demo`,
          passwordHash,
        },
      });
    }
    for (let p = 0; p < 3; p++) {
      const propertyId = `${tenantId}-property-${p}`;
      await db.property.upsert({
        where: { id: propertyId },
        update: {},
        create: {
          id: propertyId,
          tenantId,
          name: (t === 0
            ? [
                "Campus am Stadtpark",
                "Wohnquartier Lindenhof",
                "Gewerbepark West",
              ]
            : ["Rheinterrassen", "Kontor am Hafen", "Quartier Süd"])[p],
          address: ["Parkstraße 24", "Lindenallee 8", "Industriestraße 42"][p],
          city: t === 0 ? "Hamburg" : "Düsseldorf",
        },
      });
      if (p === 0)
        await db.propertyGrant.upsert({
          where: {
            userId_propertyId: { userId: `${tenantId}-user-2`, propertyId },
          },
          update: {},
          create: { tenantId, userId: `${tenantId}-user-2`, propertyId },
        });
      const buildingId = `${propertyId}-building`;
      await db.building.upsert({
        where: { id: buildingId },
        update: {},
        create: {
          id: buildingId,
          tenantId,
          propertyId,
          name: ["Haus A", "Haus B", "Hauptgebäude"][p],
        },
      });
      for (let u = 0; u < 2; u++) {
        const unitId = `${buildingId}-unit-${u}`;
        await db.unit.upsert({
          where: { id: unitId },
          update: {},
          create: {
            id: unitId,
            tenantId,
            buildingId,
            name: `${u === 0 ? "Bürofläche" : "Allgemeinfläche"} ${p + 1}`,
            floor: u === 0 ? "1. OG" : "EG",
            area: u === 0 ? 240 : 120,
          },
        });
        for (const [m, type] of types.entries()) {
          const id = `${unitId}-meter-${m}`;
          const index = p * 8 + u * 4 + m;
          const offline = index === 8 || index === 17;
          const measurementUnit = m === 1 || m === 2 ? "m³" : "kWh";
          await db.meter.upsert({
            where: { id },
            update: {},
            create: {
              id,
              tenantId,
              unitId,
              serialNumber: `${["EL", "WA", "GA", "HE"][m]}-${t + 1}026-${String(index + 1).padStart(4, "0")}`,
              externalDeviceId: `demo-${t}-${index}`,
              type,
              manufacturer: ["EMH", "Kamstrup", "Elster", "Engelmann"][m],
              model: ["eHZ", "MULTICAL 21", "BK-G4", "SensoStar"][m],
              measurementUnit,
              location: "Technikraum UG",
              status: offline ? "OFFLINE" : "ACTIVE",
              lastContact: new Date(
                now.getTime() - (offline ? 30 * 3600000 : 120000),
              ),
              installedAt: new Date("2024-02-15T00:00:00Z"),
              demoPricePerUnit: [0.32, 2.15, 1.12, 0.14][m],
            },
          });
          const dates: Date[] = [];
          for (
            let d = previous.getTime();
            d < previousEnd.getTime();
            d += 86400000
          )
            dates.push(new Date(d));
          for (
            let d = today.getTime() - 34 * 86400000;
            d <= now.getTime();
            d += 3600000
          )
            dates.push(new Date(d));
          let register = 18000 + index * 132;
          const readings: Prisma.ReadingCreateManyInput[] = [];
          for (const timestamp of dates) {
            if (offline && timestamp.getTime() > now.getTime() - 30 * 3600000)
              continue;
            const daily = timestamp < previousEnd;
            const hour = timestamp.getUTCHours();
            const base =
              [4.8, 0.055, 0.28, 3.4][m] * (1 + p * 0.4 + u * 0.15 + t * 0.2);
            const variation =
              0.85 + 0.2 * Math.sin(timestamp.getTime() / 86400000 + index);
            const profile = daily
              ? 24 * 1.15
              : hour >= 7 && hour < 19
                ? 1.45
                : 0.55;
            const spike = index === 0 && timestamp >= today ? 1.9 : 1;
            const consumption = Number(
              (base * variation * profile * spike).toFixed(6),
            );
            register += consumption;
            readings.push({
              tenantId,
              meterId: id,
              timestamp,
              registerValue: register.toFixed(6),
              consumption,
              measurementUnit,
              source: "DEMO",
              quality: index % 7 === 0 && hour === 3 ? "ESTIMATED" : "VALID",
            });
          }
          for (let i = 0; i < readings.length; i += 500)
            await db.reading.createMany({
              data: readings.slice(i, i + 500),
              skipDuplicates: true,
            });
          if (offline || index === 0)
            await db.alarm.upsert({
              where: { id: `${id}-alarm` },
              update: {},
              create: {
                id: `${id}-alarm`,
                tenantId,
                meterId: id,
                title: offline
                  ? "Zähler seit über 24 h offline"
                  : "Erhöhter Tagesverbrauch",
                severity: offline ? "MEDIUM" : "HIGH",
              },
            });
        }
      }
    }
  }
  console.log(
    "Demo bereit: 2 Mandanten, 7 Benutzer, 6 Liegenschaften, 12 Einheiten und 48 Zähler. Passwörter stammen aus DEMO_PASSWORD.",
  );
} finally {
  await db.$disconnect();
}
