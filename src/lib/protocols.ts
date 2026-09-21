import { z } from "zod";
import Decimal from "decimal.js";
import type { MetricName, UtilityType } from "./utility";

export const protocols = [
  "MODBUS_RTU",
  "MODBUS_TCP",
  "MBUS",
  "WMBUS",
  "PULSE",
  "LORAWAN",
  "REST",
  "MQTT",
  "VENDOR_API",
] as const;
export type Protocol = (typeof protocols)[number];
export type ProtocolCapabilities = {
  utility: UtilityType;
  protocol: Protocol;
  metrics: MetricName[];
  mode: "POLLING" | "EVENT";
  bidirectional: boolean;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
};
export const protocolConfigSchema = z.discriminatedUnion("protocol", [
  z
    .object({
      protocol: z.literal("MODBUS_RTU"),
      port: z.string().min(1),
      baudRate: z.number().int().positive(),
      slaveId: z.number().int().min(1).max(247),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("MODBUS_TCP"),
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      unitId: z.number().int().min(1).max(247),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("MBUS"),
      port: z.string().min(1),
      baudRate: z.number().int().positive(),
      primaryAddress: z.number().int().min(0).max(250),
      secondaryAddress: z
        .string()
        .regex(/^[0-9A-Fa-f]{8,16}$/)
        .optional(),
      manufacturerCode: z.string().max(8),
      medium: z.enum(["WATER", "GAS", "HEAT", "ELECTRICITY"]),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("WMBUS"),
      deviceId: z.string().min(4).max(32),
      manufacturerCode: z.string().max(8),
      mode: z.enum(["OMS", "T", "C", "S"]),
      securityMode: z.enum(["NONE", "OMS_AES128"]),
      encryptionKeyRef: z.string().max(160).optional(),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("PULSE"),
      impulsesPerUnit: z.string().regex(/^\d+(\.\d{1,6})?$/),
      unit: z.string().min(1).max(12),
      utility: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]),
      debounceMs: z.number().int().min(0).max(60000),
      inputChannel: z.string().min(1).max(32),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("LORAWAN"),
      devEui: z.string().regex(/^[0-9A-Fa-f]{16}$/),
      networkServer: z.string().url(),
      decoderProfile: z.string().min(1),
      webhookSecretRef: z.string().max(160).optional(),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("REST"),
      endpoint: z.string().url(),
      authRef: z.string().min(1),
      pollSeconds: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("MQTT"),
      broker: z.string().url(),
      topic: z.string().min(1),
      credentialRef: z.string().min(1),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("VENDOR_API"),
      endpoint: z.string().url(),
      authRef: z.string().min(1),
      mode: z.enum(["POLLING", "EVENT"]),
      mappingProfile: z.string().min(1),
      rateLimitPerMinute: z.number().int().positive(),
    })
    .strict(),
]);
export type ProtocolConfig = z.infer<typeof protocolConfigSchema>;
export const normalizedProtocolReadingSchema = z
  .object({
    deviceId: z.string().min(1),
    tenantId: z.string().min(1),
    messageId: z.string().min(1).max(160),
    timestamp: z.iso.datetime({ offset: true }),
    protocol: z.enum(protocols),
    utility: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]),
    measurements: z
      .array(
        z.object({
          metric: z.string().min(1),
          value: z.string(),
          unit: z.string().min(1),
          quality: z.enum(["VALID", "ESTIMATED", "INVALID", "SUSPECT"]),
        }),
      )
      .min(1)
      .max(64),
    signal: z
      .object({ rssi: z.number().optional(), snr: z.number().optional() })
      .optional(),
    frameCounter: z.number().int().nonnegative().optional(),
  })
  .strict();
export type NormalizedProtocolReading = z.infer<
  typeof normalizedProtocolReadingSchema
>;
export function decodeMbusTelegram(input: {
  deviceId: string;
  tenantId: string;
  messageId: string;
  timestamp: string;
  manufacturerCode: string;
  medium: UtilityType;
  serialNumber: string;
  value: string;
  unit: string;
  flow?: string;
}): NormalizedProtocolReading {
  const metric =
    input.medium === "HEAT"
      ? "ENERGY_TOTAL"
      : input.medium === "ELECTRICITY"
        ? "ENERGY_IMPORT"
        : "VOLUME_TOTAL";
  const measurements = [
    { metric, value: input.value, unit: input.unit, quality: "VALID" as const },
    ...(input.flow
      ? [
          {
            metric: "FLOW_RATE",
            value: input.flow,
            unit: "m3/h",
            quality: "VALID" as const,
          },
        ]
      : []),
  ];
  return normalizedProtocolReadingSchema.parse({
    deviceId: input.deviceId,
    tenantId: input.tenantId,
    messageId: input.messageId,
    timestamp: input.timestamp,
    protocol: "MBUS",
    utility: input.medium,
    measurements,
  });
}
export function decodeWmbusTelegram(input: {
  deviceId: string;
  tenantId: string;
  messageId: string;
  timestamp: string;
  utility: UtilityType;
  value: string;
  unit: string;
  rssi?: number;
  snr?: number;
  frameCounter: number;
  mode: "OMS" | "T" | "C" | "S";
  securityMode: "NONE" | "OMS_AES128";
}): NormalizedProtocolReading {
  const metric =
    input.utility === "HEAT"
      ? "ENERGY_TOTAL"
      : input.utility === "ELECTRICITY"
        ? "ENERGY_IMPORT"
        : "VOLUME_TOTAL";
  return normalizedProtocolReadingSchema.parse({
    deviceId: input.deviceId,
    tenantId: input.tenantId,
    messageId: input.messageId,
    timestamp: input.timestamp,
    protocol: "WMBUS",
    utility: input.utility,
    measurements: [
      { metric, value: input.value, unit: input.unit, quality: "VALID" },
    ],
    signal: { rssi: input.rssi, snr: input.snr },
    frameCounter: input.frameCounter,
  });
}
export function pulseReading(input: {
  deviceId: string;
  tenantId: string;
  messageId: string;
  timestamp: string;
  utility: UtilityType;
  counter: string;
  previousCounter?: string;
  previousTimestamp?: string;
  impulsesPerUnit: string;
  unit: string;
  rollover?: string;
}): NormalizedProtocolReading {
  let current = new Decimal(input.counter);
  const previous =
    input.previousCounter === undefined
      ? null
      : new Decimal(input.previousCounter);
  if (previous && current.lt(previous)) {
    if (!input.rollover)
      throw new Error("Pulse counter rollover is not configured");
    current = current.plus(input.rollover);
  }
  const delta = previous ? current.minus(previous) : new Decimal(0);
  const consumption = delta.div(input.impulsesPerUnit);
  const metric =
    input.utility === "ELECTRICITY"
      ? "ENERGY_IMPORT"
      : input.utility === "HEAT"
        ? "ENERGY_TOTAL"
        : "VOLUME_TOTAL";
  const measurements = [
    {
      metric,
      value: consumption.toFixed(6),
      unit: input.unit,
      quality: "VALID" as const,
    },
    ...(["WATER", "GAS"].includes(input.utility)
      ? [
          {
            metric: "CONSUMPTION",
            value: consumption.toFixed(6),
            unit: input.unit,
            quality: "VALID" as const,
          },
        ]
      : []),
  ];
  if (
    input.previousTimestamp &&
    new Date(input.timestamp) > new Date(input.previousTimestamp)
  ) {
    const hours =
      (new Date(input.timestamp).getTime() -
        new Date(input.previousTimestamp).getTime()) /
      3600000;
    if (hours > 0)
      measurements.push({
        metric:
          input.utility === "ELECTRICITY" || input.utility === "HEAT"
            ? "ACTIVE_POWER"
            : "FLOW_RATE",
        value: consumption.div(hours).toFixed(6),
        unit:
          input.utility === "ELECTRICITY" || input.utility === "HEAT"
            ? "kW"
            : "m3/h",
        quality: "VALID",
      });
  }
  return normalizedProtocolReadingSchema.parse({
    deviceId: input.deviceId,
    tenantId: input.tenantId,
    messageId: input.messageId,
    timestamp: input.timestamp,
    protocol: "PULSE",
    utility: input.utility,
    measurements,
  });
}
export function decodeLorawanWebhook(
  input: {
    deviceId: string;
    tenantId: string;
    messageId: string;
    timestamp: string;
    devEui: string;
    utility: UtilityType;
    payload: unknown;
    rssi?: number;
    snr?: number;
    frameCounter: number;
  },
  decoder: (
    payload: unknown,
  ) => { metric: string; value: string; unit: string }[],
): NormalizedProtocolReading {
  return normalizedProtocolReadingSchema.parse({
    deviceId: input.deviceId,
    tenantId: input.tenantId,
    messageId: input.messageId,
    timestamp: input.timestamp,
    protocol: "LORAWAN",
    utility: input.utility,
    measurements: decoder(input.payload).map((x) => ({
      ...x,
      quality: "VALID",
    })),
    signal: { rssi: input.rssi, snr: input.snr },
    frameCounter: input.frameCounter,
  });
}
export function mapVendorApiReading(
  input: {
    deviceId: string;
    tenantId: string;
    messageId: string;
    timestamp: string;
    utility: UtilityType;
    values: Record<string, { value: string; unit: string }>;
  },
  mapping: Record<string, string>,
): NormalizedProtocolReading {
  return normalizedProtocolReadingSchema.parse({
    deviceId: input.deviceId,
    tenantId: input.tenantId,
    messageId: input.messageId,
    timestamp: input.timestamp,
    protocol: "VENDOR_API",
    utility: input.utility,
    measurements: Object.entries(input.values).map(([source, v]) => ({
      metric: mapping[source] ?? source,
      value: v.value,
      unit: v.unit,
      quality: "VALID",
    })),
  });
}
