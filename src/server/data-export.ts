import "server-only";
import { db } from "./db";
import { AccessError, propertyScope, tenantScope, type Actor } from "./policy";
import { csvLine, exportFilterSchema } from "@/lib/data-export";
import type { Prisma } from "@/generated/prisma/client";

export async function exportReadings(
  actor: Actor,
  requested: string | null,
  input: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const filter = exportFilterSchema.parse(input);
  const scope = propertyScope(actor, tenantId);
  if (
    filter.propertyId &&
    !(await db.property.findFirst({
      where: { ...scope, id: filter.propertyId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Liegenschaft nicht gefunden.");
  if (
    filter.meterId &&
    !(await db.meter.findFirst({
      where: {
        id: filter.meterId,
        tenantId,
        unit: { building: { property: scope } },
      },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Zähler nicht gefunden.");
  const startedAt = new Date();
  const where: Prisma.ReadingWhereInput = {
    tenantId,
    timestamp: { gte: new Date(filter.from), lt: new Date(filter.to) },
    receivedAt: { lte: startedAt },
    meter: {
      tenantId,
      ...(filter.meterId ? { id: filter.meterId } : {}),
      ...(filter.medium ? { type: filter.medium } : {}),
      unit: {
        building: {
          property: {
            ...scope,
            ...(filter.propertyId ? { id: filter.propertyId } : {}),
          },
        },
      },
    },
  };
  const page = (after?: string) =>
    db.reading.findMany({
      where: { ...where, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      take: 1000,
      select: {
        id: true,
        meterId: true,
        timestamp: true,
        registerValue: true,
        meterValue: true,
        consumption: true,
        measurementUnit: true,
        source: true,
        quality: true,
        meter: {
          select: {
            serialNumber: true,
            type: true,
            unit: { select: { building: { select: { propertyId: true } } } },
          },
        },
      },
    });
  // First query runs before headers so database failures return a normal API error.
  let rows = await page();
  let first = true;
  let cancelled = false;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (first) {
          first = false;
          controller.enqueue(
            encoder.encode(
              "\uFEFF" +
                csvLine([
                  "id",
                  "meterId",
                  "serialNumber",
                  "propertyId",
                  "medium",
                  "timestamp",
                  "registerValue",
                  "meterValue",
                  "consumption",
                  "measurementUnit",
                  "source",
                  "quality",
                  "timezone",
                  "fromInclusive",
                  "toExclusive",
                ]),
            ),
          );
          return;
        }
        const current = rows;
        if (!current.length) {
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(
            current
              .map((row) =>
                csvLine([
                  row.id,
                  row.meterId,
                  row.meter.serialNumber,
                  row.meter.unit.building.propertyId,
                  row.meter.type,
                  row.timestamp.toISOString(),
                  row.registerValue.toString(),
                  row.meterValue?.toString() ?? "",
                  row.consumption.toString(),
                  row.measurementUnit,
                  row.source,
                  row.quality,
                  "UTC",
                  new Date(filter.from).toISOString(),
                  new Date(filter.to).toISOString(),
                ]),
              )
              .join(""),
          ),
        );
        rows =
          current.length === 1000 && !cancelled
            ? await page(current.at(-1)!.id)
            : [];
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    cancel() {
      cancelled = true;
      rows = [];
    },
  });
}
