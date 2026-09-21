import "server-only";
import type { Prisma } from "../generated/prisma/client";
import {
  normalize,
  profiles,
  type UtilityType,
  type MetricName,
} from "../lib/utility";
export const modbusMetrics: Record<string, MetricName> = {
  energyImport: "ENERGY_IMPORT",
  energyExport: "ENERGY_EXPORT",
  powerTotal: "ACTIVE_POWER",
  powerL1: "ACTIVE_POWER_L1",
  powerL2: "ACTIVE_POWER_L2",
  powerL3: "ACTIVE_POWER_L3",
  voltageL1: "VOLTAGE_L1",
  voltageL2: "VOLTAGE_L2",
  voltageL3: "VOLTAGE_L3",
  currentL1: "CURRENT_L1",
  currentL2: "CURRENT_L2",
  currentL3: "CURRENT_L3",
  frequency: "FREQUENCY",
  powerFactor: "POWER_FACTOR",
};
// Called inside the already authenticated transport transaction.
export async function recordPrimaryMeasurement(
  tx: Prisma.TransactionClient,
  reading: {
    id: string;
    tenantId: string;
    meterId: string;
    registerValue: Prisma.Decimal;
    measurementUnit: string;
    quality: "VALID" | "INVALID" | "SUSPECT" | "ESTIMATED";
  },
) {
  const meter = await tx.meter.findUniqueOrThrow({
    where: { id_tenantId: { id: reading.meterId, tenantId: reading.tenantId } },
    select: { type: true },
  });
  const row = normalize(meter.type as UtilityType, {
    metric: profiles[meter.type].primary,
    value: reading.registerValue.toFixed(6),
    unit: reading.measurementUnit,
    quality: reading.quality,
  });
  await tx.measurement.create({
    data: { ...row, tenantId: reading.tenantId, readingId: reading.id },
  });
}
