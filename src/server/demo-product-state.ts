import "server-only";
import Decimal from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";
import type { DemoScenario } from "./demo-scenarios";
import { anomalyFor } from "./analytics-insights";

// A separate, deterministic synthetic property keeps scenario resets away from
// manually maintained data. No credentials, commands or external delivery jobs.
export async function applyDemoProductState(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scenario: DemoScenario,
  actorId: string,
  anchor: Date,
) {
  const id = (kind: string) => `scenario-${tenantId}-${kind}`;
  const propertyId = id("property");
  const unitId = id("unit");
  const meterId = id("electricity");
  const waterId = id("water");
  const gatewayId = id("gateway");
  const deviceId = id("device");
  const from = new Date(anchor.getTime() - 48 * 3600000);
  await tx.property.upsert({
    where: { id: propertyId },
    update: {},
    create: {
      id: propertyId,
      tenantId,
      name: "Demo-Szenarien",
      address: "Synthetische Testadresse",
      city: "Teststadt",
    },
  });
  await tx.building.upsert({
    where: { id: id("building") },
    update: {},
    create: {
      id: id("building"),
      tenantId,
      propertyId,
      name: "Szenario-Gebäude",
    },
  });
  await tx.unit.upsert({
    where: { id: unitId },
    update: {},
    create: {
      id: unitId,
      tenantId,
      buildingId: id("building"),
      name: "Testfläche",
      floor: "EG",
      area: "100",
    },
  });
  for (const [key, type, measurementUnit] of [
    ["electricity", "ELECTRICITY", "kWh"],
    ["water", "WATER", "m³"],
  ] as const) {
    await tx.meter.upsert({
      where: { id: id(key) },
      update: { status: "ACTIVE", lastContact: anchor },
      create: {
        id: id(key),
        tenantId,
        unitId,
        serialNumber: id(key),
        type,
        measurementUnit,
        manufacturer: "Meterwerk Demo",
        model: "Synthetic",
        location: "Testfläche",
        installedAt: from,
        demoPricePerUnit: "0",
        lastContact: anchor,
      },
    });
  }
  await tx.gateway.upsert({
    where: { id: gatewayId },
    update: { status: "ONLINE", lastSeenAt: anchor },
    create: {
      id: gatewayId,
      tenantId,
      name: "Szenario-Gateway (synthetisch)",
      externalGatewayId: gatewayId,
      manufacturer: "Meterwerk Demo",
      model: "Synthetic",
      installedAt: from,
      status: "ONLINE",
      lastSeenAt: anchor,
    },
  });
  await tx.device.upsert({
    where: { id: deviceId },
    update: { status: "ONLINE", lifecycleStatus: "ACTIVE", lastSeenAt: anchor },
    create: {
      id: deviceId,
      tenantId,
      meterId,
      gatewayId,
      externalDeviceId: deviceId,
      manufacturer: "Meterwerk Demo",
      model: "Synthetic",
      protocol: "VIRTUAL",
      installedAt: from,
      status: "ONLINE",
      lifecycleStatus: "ACTIVE",
      lastSeenAt: anchor,
    },
  });
  // Only IDs owned by this fixture are removed. Restrictive references fail the
  // transaction instead of silently deleting user-created descendants.
  const owned = { tenantId, id: { startsWith: `scenario-${tenantId}-` } };
  await tx.workOrder.deleteMany({ where: owned });
  await tx.maintenanceWindow.deleteMany({ where: owned });
  await tx.supportCase.deleteMany({ where: owned });
  await tx.firmwareRollout.deleteMany({ where: owned });
  await tx.meterReplacement.deleteMany({ where: owned });
  await tx.reading.deleteMany({
    where: { tenantId, meterId: { in: [meterId, waterId, id("replacement")] } },
  });
  await tx.alarm.deleteMany({ where: owned });
  await tx.analyticsAnomaly.deleteMany({ where: owned });
  await tx.meter.deleteMany({ where: { tenantId, id: id("replacement") } });
  const readings: Prisma.ReadingCreateManyInput[] = [];
  for (const [target, unit, base] of [
    [meterId, "kWh", "2"],
    [waterId, "m³", "0.02"],
  ]) {
    let register = new Decimal("1000");
    for (let hour = 0; hour < 48; hour++) {
      const timestamp = new Date(from.getTime() + hour * 3600000);
      const consumption = new Decimal(base).mul(
        target === meterId &&
          ["HIGH_ELECTRICITY", "CRITICAL_ANOMALY"].includes(scenario)
          ? 10
          : target === waterId && scenario === "WATER_LEAK"
            ? 20
            : target === waterId &&
                (timestamp.getUTCHours() < 6 || timestamp.getUTCHours() >= 23)
              ? 0
              : 1,
      );
      register = register.plus(consumption);
      if (
        scenario === "MISSING_DATA" &&
        target === meterId &&
        hour >= 30 &&
        hour < 36
      )
        continue;
      readings.push({
        id: id(`${target === meterId ? "e" : "w"}-${hour}`),
        tenantId,
        meterId: target,
        timestamp,
        registerValue: register.toFixed(6),
        consumption: consumption.toFixed(6),
        measurementUnit: unit,
        source: "DEMO",
        receivedAt: timestamp,
      });
    }
  }
  await tx.reading.createMany({ data: readings });
  if (scenario === "METER_OFFLINE") {
    await tx.meter.update({
      where: { id: meterId },
      data: { status: "OFFLINE", lastContact: from },
    });
    await tx.device.update({
      where: { id: deviceId },
      data: { status: "OFFLINE", lifecycleStatus: "OFFLINE", lastSeenAt: from },
    });
  }
  if (scenario === "GATEWAY_OFFLINE") {
    await tx.gateway.update({
      where: { id: gatewayId },
      data: { status: "OFFLINE", lastSeenAt: from },
    });
    await tx.device.update({
      where: { id: deviceId },
      data: { status: "OFFLINE", lifecycleStatus: "OFFLINE", lastSeenAt: from },
    });
  }
  if (["OPEN_ALARM", "ACKNOWLEDGED_ALARM", "WATER_LEAK"].includes(scenario))
    await tx.alarm.create({
      data: {
        id: id("alarm"),
        tenantId,
        meterId: scenario === "WATER_LEAK" ? waterId : meterId,
        title:
          scenario === "WATER_LEAK"
            ? "Synthetischer kontinuierlicher Wasserverbrauch"
            : "Synthetischer Demo-Alarm",
        severity: "HIGH",
        status: scenario === "ACKNOWLEDGED_ALARM" ? "ACKNOWLEDGED" : "OPEN",
        createdAt: anchor,
        acknowledgedAt: scenario === "ACKNOWLEDGED_ALARM" ? anchor : null,
        acknowledgedBy: scenario === "ACKNOWLEDGED_ALARM" ? actorId : null,
      },
    });
  if (["CRITICAL_ANOMALY", "WATER_LEAK"].includes(scenario)) {
    const leak =
      scenario === "WATER_LEAK"
        ? anomalyFor(
            tenantId,
            { id: waterId, type: "WATER", propertyId },
            readings
              .filter((r) => r.meterId === waterId)
              .map((r) => ({
                timestamp: r.timestamp as Date,
                value: new Decimal(String(r.consumption)),
              })),
            [
              {
                timestamp: new Date(from.getTime() - 3600000),
                value: new Decimal("0.02"),
              },
            ],
            from,
            anchor,
            "UTC",
          ).find((a) => a.type === "WATER_LEAK_INDICATOR")
        : undefined;
    if (scenario === "WATER_LEAK" && !leak)
      throw new Error("Synthetic leak detection failed");
    await tx.analyticsAnomaly.create({
      data: {
        id: id("anomaly"),
        tenantId,
        meterId: scenario === "WATER_LEAK" ? waterId : meterId,
        propertyId,
        type: leak?.type ?? "CONSUMPTION_SPIKE",
        medium: scenario === "WATER_LEAK" ? "WATER" : "ELECTRICITY",
        severity: "CRITICAL",
        windowFrom: from,
        windowTo: anchor,
        measuredValue: leak?.measuredValue ?? "960",
        expectedValue: leak?.expectedValue ?? "96",
        description: "Deterministische synthetische Demo-Anomalie",
        fingerprint: id("anomaly"),
        detectedAt: anchor,
      },
    });
  }
  if (scenario === "MAINTENANCE") {
    await tx.meter.update({
      where: { id: meterId },
      data: { status: "MAINTENANCE" },
    });
    await tx.device.update({
      where: { id: deviceId },
      data: { status: "MAINTENANCE", lifecycleStatus: "MAINTENANCE" },
    });
    await tx.maintenanceWindow.create({
      data: {
        id: id("maintenance"),
        tenantId,
        deviceId,
        startsAt: from,
        endsAt: new Date(anchor.getTime() + 86400000),
        reason: "Synthetische Wartung",
        createdBy: actorId,
      },
    });
    await tx.workOrder.create({
      data: {
        id: id("workorder"),
        tenantId,
        number: id("workorder"),
        title: "Demo-Wartung",
        description: "Synthetischer Wartungsauftrag",
        type: "MAINTENANCE",
        propertyId,
        meterId,
        status: "DRAFT",
      },
    });
  }
  if (scenario === "METER_REPLACEMENT") {
    await tx.meter.create({
      data: {
        id: id("replacement"),
        tenantId,
        unitId,
        serialNumber: id("replacement"),
        type: "ELECTRICITY",
        measurementUnit: "kWh",
        manufacturer: "Meterwerk Demo",
        model: "Synthetic replacement",
        location: "Testfläche",
        installedAt: anchor,
        demoPricePerUnit: "0",
      },
    });
    await tx.meter.update({
      where: { id: meterId },
      data: { status: "MAINTENANCE" },
    });
    await tx.meterReplacement.create({
      data: {
        id: id("replacement-history"),
        tenantId,
        oldMeterId: meterId,
        newMeterId: id("replacement"),
        removedAt: anchor,
        installedAt: anchor,
        removedRegister: "1096",
        installedRegister: "0",
        reason: "Synthetischer Demo-Wechsel",
        actorId,
      },
    });
  }
  if (scenario === "SUPPORT_CASE")
    await tx.supportCase.create({
      data: {
        id: id("support"),
        tenantId,
        title: "Demo-Supportfall",
        description: "Reproduzierbarer synthetischer Supportfall",
        category: "DEVICE",
        propertyId,
        deviceId,
        reportedById: actorId,
      },
    });
  if (scenario === "FIRMWARE_ROLLOUT")
    await tx.firmwareRollout.create({
      data: {
        id: id("rollout"),
        tenantId,
        targetVersion: "demo-2.0.0",
        status: "DRAFT",
        createdBy: actorId,
        criteria: { synthetic: true, delivery: false },
        targets: { create: { id: id("rollout-target"), tenantId, deviceId } },
      },
    });
  return {
    propertyId,
    meterId,
    waterId,
    gatewayId,
    deviceId,
    from: from.toISOString(),
    to: anchor.toISOString(),
    timezone: "UTC",
    synthetic: true,
  };
}
