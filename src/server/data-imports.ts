import "server-only";
import { safeUploadName } from "@/lib/attachment-validation";
import { createHash } from "node:crypto";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { AccessError, requireManage, tenantScope, type Actor } from "./policy";
import { getTenantEntitlements, quotaLabels, type Quota } from "./licensing";
import {
  parseCsv,
  parseGermanDecimal,
  parseImportTimestamp,
} from "@/lib/csv-import";
import type { Prisma } from "@/generated/prisma/client";
const defaultDb = db;

function countErrorRows(errors: { row: number }[], rowCount: number) {
  return errors.some((error) => error.row === 0)
    ? rowCount
    : new Set(errors.map((error) => error.row)).size;
}

export async function importHistory(
  actor: Actor,
  requested: string | null,
  input: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const { cursor } = z
    .object({ cursor: z.string().min(1).max(160).optional() })
    .parse(input);
  const rows = await db.dataImport.findMany({
    where: { tenantId, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { id: "desc" },
    take: 26,
    select: {
      id: true,
      fileName: true,
      actorId: true,
      actorName: true,
      resource: true,
      createdAt: true,
      rowCount: true,
      successCount: true,
      errorCount: true,
      skippedCount: true,
      status: true,
      expiresAt: true,
    },
  });
  return {
    items: rows.slice(0, 25).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status:
        row.status === "PREVIEWED" && row.expiresAt <= new Date()
          ? "EXPIRED"
          : row.status,
    })),
    nextCursor: rows.length > 25 ? rows[24]!.id : null,
  };
}

export async function skipImportErrors(
  actor: Actor,
  requested: string | null,
  id: string,
  input: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const parsedId = z.string().min(1).max(160).parse(id);
  const value = z
    .object({
      rows: z.array(z.number().int().min(2).max(2001)).min(1).max(2000),
      reason: z.string().trim().min(10).max(1000),
    })
    .parse(input);
  const selected = new Set(value.rows);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    const batch = await tx.dataImport.findFirst({
      where: { id: parsedId, tenantId, actorId: actor.id },
    });
    if (!batch) throw new AccessError(404, "Importvorschau nicht gefunden.");
    if (batch.status !== "PREVIEWED" || batch.expiresAt <= new Date())
      throw new AccessError(409, "Vorschau ist verarbeitet oder abgelaufen.");
    const errors = z
      .array(
        z.object({
          row: z.number(),
          field: z.string().optional(),
          message: z.string(),
        }),
      )
      .parse(batch.errors);
    if (errors.some((error) => error.row === 0))
      throw new AccessError(
        409,
        "Datei- oder Zuordnungsfehler müssen zuerst korrigiert werden.",
      );
    if ([...selected].some((row) => !errors.some((error) => error.row === row)))
      throw new AccessError(
        409,
        "Nur vorhandene fehlerhafte Zeilen können übersprungen werden.",
      );
    const skipped = [
      ...new Set([...(batch.skippedRows as number[]), ...selected]),
    ];
    const allRows = z
      .array(z.record(z.string(), z.unknown()))
      .parse(batch.stagedData);
    const remaining = allRows
      .map((data, index) => ({ data, row: index + 2 }))
      .filter(({ row }) => !skipped.includes(row));
    const referenceErrors = await checkTenantReferences(
      tenantId,
      z.enum(importResources).parse(batch.resource),
      remaining.map((row) => row.data),
      tx,
    );
    const nextErrors = [
      ...errors.filter((error) => !selected.has(error.row)),
      ...referenceErrors.map((error) => ({
        ...error,
        row: remaining[error.row - 2]!.row,
      })),
    ].filter(
      (error, index, all) =>
        all.findIndex(
          (other) =>
            other.row === error.row &&
            other.field === error.field &&
            other.message === error.message,
        ) === index,
    );
    await tx.dataImport.update({
      where: { id_tenantId: { id: parsedId, tenantId } },
      data: {
        skippedRows: skipped,
        skippedCount: skipped.length,
        errors: nextErrors,
        errorCount: countErrorRows(nextErrors, remaining.length),
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "data_import.rows_skipped",
        entityId: batch.id,
        details: { rows: [...selected], reason: value.reason },
      },
    });
    return {
      skippedCount: skipped.length,
      errors: nextErrors.slice(0, 100),
      errorCount: nextErrors.length,
      canConfirm: nextErrors.length === 0 && remaining.length > 0,
      preview: remaining.slice(0, 10).map((row) => row.data),
    };
  });
}

export const importResources = [
  "properties",
  "buildings",
  "units",
  "meters",
  "devices",
  "gateways",
  "readings",
] as const;
export type ImportResource = (typeof importResources)[number];
type Field = {
  required: boolean;
  type: "text" | "decimal" | "date" | "enum";
  values?: readonly string[];
};
const optionalText: Field = { required: false, type: "text" };
const requiredText: Field = { required: true, type: "text" };
const requiredDecimal: Field = { required: true, type: "decimal" };
const optionalDecimal: Field = { required: false, type: "decimal" };
const requiredDate: Field = { required: true, type: "date" };
const requiredEnum = (...values: string[]): Field => ({
  required: true,
  type: "enum",
  values,
});
const optionalEnum = (...values: string[]): Field => ({
  required: false,
  type: "enum",
  values,
});
const definitions: Record<ImportResource, Record<string, Field>> = {
  properties: {
    id: optionalText,
    name: requiredText,
    address: requiredText,
    city: requiredText,
  },
  buildings: { id: optionalText, propertyId: requiredText, name: requiredText },
  units: {
    id: optionalText,
    buildingId: requiredText,
    name: requiredText,
    floor: requiredText,
    area: requiredDecimal,
  },
  meters: {
    id: optionalText,
    unitId: requiredText,
    serialNumber: requiredText,
    externalDeviceId: optionalText,
    type: requiredEnum("ELECTRICITY", "WATER", "GAS", "HEAT"),
    manufacturer: requiredText,
    model: requiredText,
    measurementUnit: requiredText,
    location: requiredText,
    status: optionalEnum("ACTIVE", "OFFLINE", "MAINTENANCE"),
    installedAt: requiredDate,
    demoPricePerUnit: requiredDecimal,
  },
  devices: {
    id: optionalText,
    meterId: requiredText,
    gatewayId: optionalText,
    externalDeviceId: requiredText,
    manufacturer: requiredText,
    model: requiredText,
    firmwareVersion: optionalText,
    protocol: requiredEnum(
      "VIRTUAL",
      "REST",
      "MQTT",
      "MODBUS",
      "MBUS",
      "WMBUS",
      "LORAWAN",
      "VENDOR_API",
      "MODBUS_RTU",
      "MODBUS_TCP",
      "PULSE",
    ),
    status: optionalEnum(
      "ONLINE",
      "OFFLINE",
      "WARNING",
      "MAINTENANCE",
      "DISABLED",
    ),
    installedAt: requiredDate,
  },
  gateways: {
    id: optionalText,
    name: requiredText,
    externalGatewayId: requiredText,
    manufacturer: requiredText,
    model: requiredText,
    firmwareVersion: optionalText,
    status: optionalEnum(
      "ONLINE",
      "OFFLINE",
      "WARNING",
      "MAINTENANCE",
      "DISABLED",
    ),
    installedAt: requiredDate,
  },
  readings: {
    meterId: requiredText,
    deviceId: optionalText,
    messageId: optionalText,
    timestamp: requiredDate,
    registerValue: requiredDecimal,
    meterValue: optionalDecimal,
    consumption: requiredDecimal,
    measurementUnit: requiredText,
    source: optionalEnum("DEMO", "REST", "MQTT", "GATEWAY", "MANUAL"),
  },
};
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

export function fieldsForImport(resource: ImportResource) {
  return Object.entries(definitions[resource]).map(([field, spec]) => ({
    field,
    required: spec.required,
    type: spec.type,
  }));
}

function normalizeValue(value: string, field: string, spec: Field): unknown {
  const input = value.trim();
  if (!input) return spec.required ? undefined : null;
  if (spec.type === "decimal") {
    const plain = parseGermanDecimal(input);
    if (plain === null) return undefined;
    const decimal = new Decimal(plain);
    if (field !== "meterValue" && decimal.isNegative()) return undefined;
    const [precision, scale] =
      field === "area"
        ? [12, 2]
        : field === "demoPricePerUnit"
          ? [10, 4]
          : [20, 6];
    if (
      decimal.decimalPlaces() > scale! ||
      decimal.abs().gte(new Decimal(10).pow(precision! - scale!))
    )
      return undefined;
    return plain;
  }
  if (spec.type === "date")
    return parseImportTimestamp(input)?.toISOString() ?? undefined;
  if (spec.type === "enum") return input.toUpperCase();
  if (field === "id" || field.endsWith("Id")) return input;
  return input;
}

function validateRows(
  resource: ImportResource,
  headers: string[],
  rawRows: string[][],
  mapping: Record<string, string>,
) {
  const fields = definitions[resource];
  const errors: { row: number; field?: string; message: string }[] = [];
  for (const [field, spec] of Object.entries(fields)) {
    if (
      spec.required &&
      (!mapping[field] || !headers.includes(mapping[field]!))
    )
      errors.push({
        row: 0,
        field,
        message: `Pflichtspalte „${field}“ ist nicht zugeordnet.`,
      });
  }
  if (rawRows.length > MAX_ROWS)
    errors.push({
      row: 0,
      message: `Maximal ${MAX_ROWS.toLocaleString("de-DE")} Datenzeilen pro Import.`,
    });
  const rows = rawRows.slice(0, MAX_ROWS).map((cells, index) => {
    const data: Record<string, unknown> = {};
    for (const [field, spec] of Object.entries(fields)) {
      const column = mapping[field];
      if (!column || !headers.includes(column)) continue;
      const raw = cells[headers.indexOf(column)] ?? "";
      const value = normalizeValue(raw, field, spec);
      if (value === undefined)
        errors.push({
          row: index + 2,
          field,
          message:
            spec.type === "decimal"
              ? `Ungültige Dezimalzahl „${raw}“.`
              : spec.type === "date"
                ? `Ungültiger Zeitstempel „${raw}“; Datum/Uhrzeit benötigen eine Zeitzone.`
                : `Pflichtwert „${field}“ fehlt oder ist ungültig.`,
        });
      else if (
        value !== null &&
        spec.type === "enum" &&
        !spec.values?.includes(String(value))
      )
        errors.push({
          row: index + 2,
          field,
          message: `Ungültiger Wert „${raw}“ für ${field}.`,
        });
      else if (value !== undefined) data[field] = value;
    }
    if (resource === "meters" && data.status == null) data.status = "ACTIVE";
    if (resource === "devices" && data.status == null)
      data.status = "MAINTENANCE";
    if (resource === "gateways" && data.status == null)
      data.status = "MAINTENANCE";
    if (resource === "readings" && data.source == null) data.source = "MANUAL";
    return data;
  });
  return { rows, errors };
}

async function checkTenantReferences(
  tenantId: string,
  resource: ImportResource,
  rows: Record<string, unknown>[],
  db: Prisma.TransactionClient = defaultDb,
) {
  const errors: { row: number; field?: string; message: string }[] = [];
  const ids = (field: string) => [
    ...new Set(
      rows
        .map((row) => row[field])
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  const available = async (
    field: string,
    lookup: (values: string[]) => Promise<string[]>,
  ) => {
    const values = ids(field);
    const found = new Set(await lookup(values));
    rows.forEach((row, i) => {
      const value = row[field];
      if (typeof value === "string" && !found.has(value))
        errors.push({
          row: i + 2,
          field,
          message: `Zuordnung „${field}“ wurde in diesem Mandanten nicht gefunden.`,
        });
    });
  };
  if (resource === "buildings")
    await available("propertyId", async (values) =>
      (
        await db.property.findMany({
          where: { id: { in: values }, tenantId },
          select: { id: true },
        })
      ).map((x) => x.id),
    );
  if (resource === "units")
    await available("buildingId", async (values) =>
      (
        await db.building.findMany({
          where: { id: { in: values }, tenantId },
          select: { id: true },
        })
      ).map((x) => x.id),
    );
  if (resource === "meters")
    await available("unitId", async (values) =>
      (
        await db.unit.findMany({
          where: { id: { in: values }, tenantId },
          select: { id: true },
        })
      ).map((x) => x.id),
    );
  if (resource === "devices" || resource === "readings")
    await available("meterId", async (values) =>
      (
        await db.meter.findMany({
          where: { id: { in: values }, tenantId },
          select: { id: true },
        })
      ).map((x) => x.id),
    );
  if (resource === "devices" || resource === "readings") {
    const deviceIds = ids("deviceId");
    if (deviceIds.length) {
      const devices = await db.device.findMany({
        where: { id: { in: deviceIds }, tenantId },
        select: { id: true, meterId: true },
      });
      const byId = new Map(
        devices.map((device) => [device.id, device.meterId]),
      );
      rows.forEach((row, i) => {
        const deviceId = row.deviceId;
        if (
          typeof deviceId === "string" &&
          (!byId.has(deviceId) || byId.get(deviceId) !== row.meterId)
        )
          errors.push({
            row: i + 2,
            field: "deviceId",
            message:
              "Device fehlt, gehört zu einem anderen Mandanten oder ist einem anderen Zähler zugeordnet.",
          });
      });
    }
  }
  if (resource === "devices") {
    const gatewayIds = ids("gatewayId");
    if (gatewayIds.length) {
      const found = new Set(
        (
          await db.gateway.findMany({
            where: { id: { in: gatewayIds }, tenantId },
            select: { id: true },
          })
        ).map((x) => x.id),
      );
      rows.forEach((row, i) => {
        if (typeof row.gatewayId === "string" && !found.has(row.gatewayId))
          errors.push({
            row: i + 2,
            field: "gatewayId",
            message: "Gateway wurde in diesem Mandanten nicht gefunden.",
          });
      });
    }
  }
  if (resource === "readings") {
    const meters = await db.meter.findMany({
      where: { id: { in: ids("meterId") }, tenantId },
      select: { id: true, measurementUnit: true },
    });
    const units = new Map(
      meters.map((meter) => [meter.id, meter.measurementUnit]),
    );
    rows.forEach((row, i) => {
      if (
        typeof row.meterId === "string" &&
        units.has(row.meterId) &&
        units.get(row.meterId) !== row.measurementUnit
      )
        errors.push({
          row: i + 2,
          field: "measurementUnit",
          message: `Einheit stimmt nicht mit dem Zähler überein (${units.get(row.meterId)}).`,
        });
    });
  }
  const uniqueFields: Partial<Record<ImportResource, string[]>> = {
    properties: ["id"],
    buildings: ["id"],
    units: ["id"],
    meters: ["id", "serialNumber", "externalDeviceId"],
    gateways: ["id", "externalGatewayId"],
    devices: ["id", "externalDeviceId"],
  };
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const keys = (uniqueFields[resource] ?? []).flatMap((field) =>
      typeof row[field] === "string" && row[field]
        ? [`${field}:${row[field]}`]
        : [],
    );
    if (resource === "readings")
      keys.push(
        typeof row.messageId === "string" && typeof row.deviceId === "string"
          ? `message:${row.deviceId}:${row.messageId}`
          : `reading:${row.meterId}:${row.timestamp}:${row.source}`,
      );
    if (resource === "properties")
      keys.push(
        `property:${[row.name, row.address, row.city].map(normalizeNaturalKey).join(":")}`,
      );
    if (resource === "buildings")
      keys.push(`building:${row.propertyId}:${normalizeNaturalKey(row.name)}`);
    if (resource === "units")
      keys.push(`unit:${row.buildingId}:${normalizeNaturalKey(row.name)}`);
    for (const key of keys) {
      if (seen.has(key))
        errors.push({
          row: i + 2,
          message: `Doppelter Datensatz innerhalb der Datei (erste Zeile ${seen.get(key)}).`,
        });
      else seen.set(key, i + 2);
    }
  });
  const duplicateValue = (field: string, value: unknown, row: number) => {
    if (typeof value === "string" && value)
      errors.push({
        row,
        field,
        message: `Dieser Wert ist im Mandanten bereits vorhanden (${value}). Es wird nichts überschrieben.`,
      });
  };
  const existsNaturalKey = async (
    lookup: () => Promise<{ key: string }[]>,
    keyFor: (row: Record<string, unknown>) => string,
  ) => {
    const existing = new Set((await lookup()).map((row) => row.key));
    rows.forEach((row, i) => {
      if (existing.has(keyFor(row)))
        errors.push({
          row: i + 2,
          message:
            "Ein gleichartiger Datensatz ist im Mandanten bereits vorhanden; es wird nichts überschrieben.",
        });
    });
  };
  if (resource === "properties")
    await existsNaturalKey(
      async () =>
        (
          await db.property.findMany({
            where: { tenantId },
            select: { name: true, address: true, city: true },
          })
        ).map((row) => ({
          key: `property:${[row.name, row.address, row.city].map(normalizeNaturalKey).join(":")}`,
        })),
      (row) =>
        `property:${[row.name, row.address, row.city].map(normalizeNaturalKey).join(":")}`,
    );
  if (resource === "buildings")
    await existsNaturalKey(
      async () =>
        (
          await db.building.findMany({
            where: { tenantId },
            select: { propertyId: true, name: true },
          })
        ).map((row) => ({
          key: `building:${row.propertyId}:${normalizeNaturalKey(row.name)}`,
        })),
      (row) => `building:${row.propertyId}:${normalizeNaturalKey(row.name)}`,
    );
  if (resource === "units")
    await existsNaturalKey(
      async () =>
        (
          await db.unit.findMany({
            where: { tenantId },
            select: { buildingId: true, name: true },
          })
        ).map((row) => ({
          key: `unit:${row.buildingId}:${normalizeNaturalKey(row.name)}`,
        })),
      (row) => `unit:${row.buildingId}:${normalizeNaturalKey(row.name)}`,
    );
  if (resource === "meters") {
    const serials = ids("serialNumber");
    const existing = new Set(
      (
        await db.meter.findMany({
          where: { tenantId, serialNumber: { in: serials } },
          select: { serialNumber: true },
        })
      ).map((x) => x.serialNumber),
    );
    rows.forEach((row, i) => {
      if (existing.has(String(row.serialNumber)))
        duplicateValue("serialNumber", row.serialNumber, i + 2);
    });
    const externalIds = ids("externalDeviceId");
    if (externalIds.length) {
      const existingExternal = new Set(
        (
          await db.meter.findMany({
            where: { tenantId, externalDeviceId: { in: externalIds } },
            select: { externalDeviceId: true },
          })
        )
          .map((row) => row.externalDeviceId)
          .filter((value): value is string => Boolean(value)),
      );
      rows.forEach((row, i) => {
        if (
          typeof row.externalDeviceId === "string" &&
          existingExternal.has(row.externalDeviceId)
        )
          duplicateValue("externalDeviceId", row.externalDeviceId, i + 2);
      });
    }
  }
  if (resource === "gateways") {
    const externalIds = ids("externalGatewayId");
    const existing = new Set(
      (
        await db.gateway.findMany({
          where: { tenantId, externalGatewayId: { in: externalIds } },
          select: { externalGatewayId: true },
        })
      ).map((x) => x.externalGatewayId),
    );
    rows.forEach((row, i) => {
      if (existing.has(String(row.externalGatewayId)))
        duplicateValue("externalGatewayId", row.externalGatewayId, i + 2);
    });
  }
  if (resource === "devices") {
    const externalIds = ids("externalDeviceId");
    const existing = new Set(
      (
        await db.device.findMany({
          where: { tenantId, externalDeviceId: { in: externalIds } },
          select: { externalDeviceId: true },
        })
      ).map((x) => x.externalDeviceId),
    );
    rows.forEach((row, i) => {
      if (existing.has(String(row.externalDeviceId)))
        duplicateValue("externalDeviceId", row.externalDeviceId, i + 2);
    });
  }
  if (resource === "readings") {
    const meters = [...new Set(rows.map((row) => String(row.meterId)))];
    const existing = await db.reading.findMany({
      where: {
        tenantId,
        meterId: { in: meters },
        timestamp: {
          in: rows.flatMap((row) =>
            typeof row.timestamp === "string" &&
            parseImportTimestamp(row.timestamp)
              ? [new Date(row.timestamp)]
              : [],
          ),
        },
        source: {
          in: [...new Set(rows.map((row) => String(row.source)))] as (
            | "DEMO"
            | "REST"
            | "MQTT"
            | "GATEWAY"
            | "MANUAL"
          )[],
        },
      },
      select: { meterId: true, timestamp: true, source: true },
    });
    const keys = new Set(
      existing.map(
        (reading) =>
          `${reading.meterId}:${reading.timestamp.toISOString()}:${reading.source}`,
      ),
    );
    rows.forEach((row, i) => {
      if (keys.has(`${row.meterId}:${row.timestamp}:${row.source}`))
        errors.push({
          row: i + 2,
          message:
            "Messwert mit Zähler, Zeitpunkt und Quelle existiert bereits; es wird nichts überschrieben.",
        });
    });
    const messages = rows.filter(
      (row) =>
        typeof row.deviceId === "string" && typeof row.messageId === "string",
    );
    if (messages.length) {
      const existingMessages = await db.reading.findMany({
        where: {
          tenantId,
          deviceId: {
            in: [...new Set(messages.map((row) => String(row.deviceId)))],
          },
          messageId: {
            in: [...new Set(messages.map((row) => String(row.messageId)))],
          },
        },
        select: { deviceId: true, messageId: true },
      });
      const messageKeys = new Set(
        existingMessages.map((row) => `${row.deviceId}:${row.messageId}`),
      );
      rows.forEach((row, i) => {
        if (
          typeof row.deviceId === "string" &&
          typeof row.messageId === "string" &&
          messageKeys.has(`${row.deviceId}:${row.messageId}`)
        )
          errors.push({
            row: i + 2,
            field: "messageId",
            message:
              "Diese messageId wurde für das Device bereits verarbeitet.",
          });
      });
    }
  }
  const explicitIds = ids("id");
  if (explicitIds.length) {
    const existingIds =
      resource === "properties"
        ? await db.property.findMany({
            where: { id: { in: explicitIds } },
            select: { id: true },
          })
        : resource === "buildings"
          ? await db.building.findMany({
              where: { id: { in: explicitIds } },
              select: { id: true },
            })
          : resource === "units"
            ? await db.unit.findMany({
                where: { id: { in: explicitIds } },
                select: { id: true },
              })
            : resource === "meters"
              ? await db.meter.findMany({
                  where: { id: { in: explicitIds } },
                  select: { id: true },
                })
              : resource === "devices"
                ? await db.device.findMany({
                    where: { id: { in: explicitIds } },
                    select: { id: true },
                  })
                : resource === "gateways"
                  ? await db.gateway.findMany({
                      where: { id: { in: explicitIds } },
                      select: { id: true },
                    })
                  : [];
    const foundIds = new Set(existingIds.map((row) => row.id));
    rows.forEach((row, i) => {
      if (typeof row.id === "string" && foundIds.has(row.id))
        errors.push({
          row: i + 2,
          field: "id",
          message:
            "Diese ID ist bereits vergeben; es wird nichts überschrieben.",
        });
    });
  }
  return errors;
}

function normalizeNaturalKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("de-DE");
}

export async function previewCsvImport(
  actor: Actor,
  file: File,
  requested: string | null,
  resourceValue: string,
  mappingValue: unknown,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const resource = z.enum(importResources).parse(resourceValue);
  if (!(file instanceof File) || file.size === 0)
    throw new AccessError(400, "Bitte eine CSV-Datei auswählen.");
  if (file.size > MAX_FILE_BYTES)
    throw new AccessError(413, "CSV-Datei darf höchstens 5 MB groß sein.");
  if (
    !safeUploadName(file.name) ||
    !file.name.toLowerCase().endsWith(".csv") ||
    !["text/csv", "text/plain", "application/vnd.ms-excel", ""].includes(
      file.type,
    )
  )
    throw new AccessError(415, "CSV-Dateityp oder Dateiname nicht erlaubt.");
  const mapping = z.record(z.string(), z.string().max(160)).parse(mappingValue);
  let parsed;
  let fileBytes: Uint8Array;
  try {
    fileBytes = new Uint8Array(await file.arrayBuffer());
    const text = new TextDecoder("utf-8", { fatal: true }).decode(fileBytes);
    if (text.includes("\0") || /^\s*(?:MZ|#!|<)/.test(text))
      throw new AccessError(415, "CSV-Inhalt nicht erlaubt.");
    parsed = parseCsv(text);
  } catch (error) {
    throw new AccessError(
      400,
      error instanceof TypeError
        ? "Datei muss gültiges UTF-8 enthalten."
        : error instanceof Error
          ? error.message
          : "CSV-Datei ist ungültig.",
    );
  }
  if (!parsed.rows.length)
    throw new AccessError(400, "Die CSV-Datei enthält keine Datenzeilen.");
  const validation = validateRows(
    resource,
    parsed.headers,
    parsed.rows,
    mapping,
  );
  const errors = [
    ...validation.errors,
    ...(await checkTenantReferences(tenantId, resource, validation.rows)),
  ];
  const fingerprint = createHash("sha256")
    .update(fileBytes)
    .update(JSON.stringify(Object.fromEntries(Object.entries(mapping).sort())))
    .digest("hex");
  const alreadyImported = await db.dataImport.findFirst({
    where: { tenantId, fingerprint, status: "COMPLETED" },
    select: { id: true },
  });
  if (alreadyImported)
    throw new AccessError(
      409,
      "Diese Datei mit derselben Spaltenzuordnung wurde bereits importiert.",
    );
  const batch = await db.$transaction(async (tx) => {
    const batch = await tx.dataImport.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorName: actor.name,
        fileName: file.name
          .replaceAll("\\", "/")
          .split("/")
          .at(-1)!
          .slice(0, 255),
        resource,
        fingerprint,
        stagedData: validation.rows as Prisma.InputJsonValue,
        errors: errors as Prisma.InputJsonValue,
        rowCount: parsed.rows.length,
        errorCount: countErrorRows(errors, parsed.rows.length),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "data_import.previewed",
        entityId: batch.id,
      },
    });
    return batch;
  });
  return {
    id: batch.id,
    resource,
    headers: parsed.headers,
    fields: fieldsForImport(resource),
    delimiter: parsed.delimiter,
    rowCount: batch.rowCount,
    preview: validation.rows.slice(0, 10),
    errors: errors.slice(0, 100),
    errorCount: errors.length,
    canConfirm: errors.length === 0,
    expiresAt: batch.expiresAt.toISOString(),
  };
}

const quotaByResource: Partial<Record<ImportResource, Quota>> = {
  properties: "properties",
  buildings: "buildings",
  units: "units",
  meters: "meters",
  devices: "devices",
  gateways: "gateways",
};

export async function confirmCsvImport(
  actor: Actor,
  id: string,
  requested: string | null,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const parsedId = z.string().min(1).max(160).parse(id);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      const batch = await tx.dataImport.findFirst({
        where: { id: parsedId, tenantId, actorId: actor.id },
      });
      if (!batch) throw new AccessError(404, "Importvorschau nicht gefunden.");
      if (batch.status !== "PREVIEWED")
        throw new AccessError(
          409,
          "Diese Importvorschau wurde bereits verarbeitet.",
        );
      if (batch.expiresAt <= new Date())
        throw new AccessError(
          410,
          "Importvorschau ist abgelaufen. Bitte laden Sie die Datei erneut hoch.",
        );
      const errors = Array.isArray(batch.errors) ? batch.errors : [];
      if (errors.length)
        throw new AccessError(
          409,
          "Import enthält Fehler. Bitte korrigieren Sie die Datei und erstellen eine neue Vorschau.",
        );
      const rows = z
        .array(z.record(z.string(), z.unknown()))
        .parse(batch.stagedData)
        .filter(
          (_, index) => !(batch.skippedRows as number[]).includes(index + 2),
        );
      const resource = z.enum(importResources).parse(batch.resource);
      // Until the import contract supports explicit property selection, gateway
      // inventory and gateway-bound devices must use the checked admin services.
      if (
        resource === "gateways" ||
        (resource === "devices" && rows.some((row) => !!row.gatewayId))
      )
        throw new AccessError(
          409,
          "Gateway-Import und Gateway-Gerätezuordnung sind bis zum geprüften Provisioning-Import gesperrt.",
        );
      if (!rows.length)
        throw new AccessError(
          409,
          "Keine Datenzeilen zur Übernahme vorhanden.",
        );
      const referenceErrors = await checkTenantReferences(
        tenantId,
        resource,
        rows,
        tx,
      );
      if (referenceErrors.length)
        throw new AccessError(
          409,
          "Datenbestand hat sich geändert. Bitte neue Vorschau erstellen.",
        );
      if (resource === "readings") {
        // Confirm-time checks close the gap if a meter changed after preview.
        const meterIds = [...new Set(rows.map((row) => String(row.meterId)))];
        const meters = await tx.meter.findMany({
          where: { tenantId, id: { in: meterIds } },
          select: { id: true, measurementUnit: true },
        });
        const units = new Map(
          meters.map((meter) => [meter.id, meter.measurementUnit]),
        );
        for (const row of rows)
          if (
            !units.has(String(row.meterId)) ||
            units.get(String(row.meterId)) !== row.measurementUnit
          )
            throw new AccessError(
              409,
              "Zählerzuordnung oder Einheit hat sich nach der Vorschau geändert. Bitte erneut prüfen.",
            );
        const keys = new Set<string>();
        for (const row of rows) {
          const key = `${row.meterId}:${row.timestamp}:${row.source}`;
          if (keys.has(key))
            throw new AccessError(
              409,
              "Der Import enthält doppelte Messwerte.",
            );
          keys.add(key);
        }
        const sources = [...new Set(rows.map((row) => String(row.source)))];
        const existingReadings = await tx.reading.findMany({
          where: {
            tenantId,
            meterId: { in: meterIds },
            timestamp: {
              in: rows.map((row) => new Date(String(row.timestamp))),
            },
            source: {
              in: sources as (
                | "DEMO"
                | "REST"
                | "MQTT"
                | "GATEWAY"
                | "MANUAL"
              )[],
            },
          },
          select: { meterId: true, timestamp: true, source: true },
        });
        const existingKeys = new Set(
          existingReadings.map(
            (row) =>
              `${row.meterId}:${row.timestamp.toISOString()}:${row.source}`,
          ),
        );
        if (
          rows.some((row) =>
            existingKeys.has(`${row.meterId}:${row.timestamp}:${row.source}`),
          )
        )
          throw new AccessError(
            409,
            "Mindestens ein Messwert existiert bereits. Es wurden keine Daten importiert.",
          );
      }
      const quota = quotaByResource[resource];
      if (quota) {
        const entitlements = await getTenantEntitlements(tenantId, tx);
        const count =
          resource === "properties"
            ? await tx.property.count({ where: { tenantId } })
            : resource === "buildings"
              ? await tx.building.count({ where: { tenantId } })
              : resource === "units"
                ? await tx.unit.count({ where: { tenantId } })
                : resource === "meters"
                  ? await tx.meter.count({ where: { tenantId } })
                  : resource === "devices"
                    ? await tx.device.count({ where: { tenantId } })
                    : await tx.gateway.count({ where: { tenantId } });
        const limit = entitlements.limits[quota];
        if (count + rows.length > limit)
          throw new AccessError(
            409,
            `Der Import überschreitet das Limit für ${quotaLabels[quota]} (${count} vorhanden, ${rows.length} im Import, Limit ${limit}). Es wurden keine Daten übernommen.`,
          );
      }
      for (const row of rows)
        await createImportedRow(tx, tenantId, resource, row);
      await tx.dataImport.update({
        where: { id_tenantId: { id: batch.id, tenantId } },
        data: {
          status: "COMPLETED",
          successCount: rows.length,
          errorCount: 0,
          completedAt: new Date(),
          stagedData: [],
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: actor.id,
          action: "data_import.completed",
          entityId: batch.id,
        },
      });
      return {
        id: batch.id,
        resource,
        imported: rows.length,
        status: "COMPLETED" as const,
      };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

async function createImportedRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: ImportResource,
  row: Record<string, unknown>,
) {
  const id = typeof row.id === "string" ? row.id : undefined;
  const data = { ...row };
  delete data.id;
  switch (resource) {
    case "properties":
      await tx.property.create({
        data: {
          ...data,
          ...(id ? { id } : {}),
          tenantId,
        } as Prisma.PropertyUncheckedCreateInput,
      });
      break;
    case "buildings":
      await tx.building.create({
        data: {
          ...data,
          ...(id ? { id } : {}),
          tenantId,
        } as Prisma.BuildingUncheckedCreateInput,
      });
      break;
    case "units":
      await tx.unit.create({
        data: {
          ...data,
          ...(id ? { id } : {}),
          area: String(data.area),
          tenantId,
        } as Prisma.UnitUncheckedCreateInput,
      });
      break;
    case "meters":
      await tx.meter.create({
        data: {
          ...data,
          ...(id ? { id } : {}),
          installedAt: new Date(String(data.installedAt)),
          demoPricePerUnit: String(data.demoPricePerUnit),
          tenantId,
        } as Prisma.MeterUncheckedCreateInput,
      });
      break;
    case "gateways":
      await tx.gateway.create({
        data: {
          ...data,
          ...(id ? { id } : {}),
          installedAt: new Date(String(data.installedAt)),
          status: String(data.status) as "MAINTENANCE",
          tenantId,
        } as Prisma.GatewayUncheckedCreateInput,
      });
      break;
    case "devices":
      await tx.device.create({
        data: {
          ...data,
          ...(id ? { id } : {}),
          installedAt: new Date(String(data.installedAt)),
          status: String(data.status) as "MAINTENANCE",
          protocol: String(data.protocol) as "VIRTUAL",
          tenantId,
          profileId: null,
        } as Prisma.DeviceUncheckedCreateInput,
      });
      break;
    case "readings":
      await tx.reading.create({
        data: {
          ...data,
          timestamp: new Date(String(data.timestamp)),
          registerValue: String(data.registerValue),
          ...(data.meterValue == null
            ? { meterValue: null }
            : { meterValue: String(data.meterValue) }),
          consumption: String(data.consumption),
          source: String(data.source) as "MANUAL",
          tenantId,
        } as Prisma.ReadingUncheckedCreateInput,
      });
      break;
  }
}
