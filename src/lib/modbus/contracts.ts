import { z } from "zod";
import simulator from "./profiles/simulator-three-phase.json";
import template from "./profiles/three-phase-template.json";
export const metricSchema = z.enum([
  "energyImport",
  "energyExport",
  "powerTotal",
  "powerL1",
  "powerL2",
  "powerL3",
  "voltageL1",
  "voltageL2",
  "voltageL3",
  "currentL1",
  "currentL2",
  "currentL3",
  "frequency",
  "powerFactor",
]);
export type Metric = z.infer<typeof metricSchema>;
export const numericString = z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/);
export const registerSchema = z
  .object({
    metric: metricSchema,
    description: z.string().min(1).max(160),
    unit: z.enum(["kWh", "W", "V", "A", "Hz", "1"]),
    address: z.number().int().min(0).max(65535).nullable(),
    functionCode: z.union([z.literal(3), z.literal(4)]),
    dataType: z.enum([
      "uint16",
      "int16",
      "uint32",
      "int32",
      "uint64",
      "int64",
      "float32",
      "float64",
    ]),
    length: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    byteOrder: z.enum(["BE", "LE"]),
    wordOrder: z.enum(["BE", "LE"]),
    scale: numericString.refine((v) => Number(v) !== 0),
    min: numericString,
    max: numericString,
  })
  .strict()
  .superRefine((r, ctx) => {
    const lengths = {
      uint16: 1,
      int16: 1,
      uint32: 2,
      int32: 2,
      uint64: 4,
      int64: 4,
      float32: 2,
      float64: 4,
    };
    if (
      r.length !== lengths[r.dataType] ||
      (r.address !== null && r.address + r.length > 65536) ||
      Number(r.min) > Number(r.max)
    )
      ctx.addIssue({
        code: "custom",
        message: "Registerlänge, Adresse oder Wertebereich ungültig.",
      });
    const expected = r.metric.startsWith("energy")
      ? "kWh"
      : r.metric.startsWith("voltage")
        ? "V"
        : r.metric.startsWith("current")
          ? "A"
          : r.metric === "frequency"
            ? "Hz"
            : r.metric === "powerFactor"
              ? "1"
              : "W";
    if (r.unit !== expected)
      ctx.addIssue({
        code: "custom",
        message: "Einheit passt nicht zur Messgröße.",
      });
  });
export const serialSchema = z
  .object({
    baudRate: z.union([
      z.literal(1200),
      z.literal(2400),
      z.literal(4800),
      z.literal(9600),
      z.literal(19200),
      z.literal(38400),
      z.literal(57600),
      z.literal(115200),
    ]),
    dataBits: z.literal(8),
    parity: z.enum(["none", "even", "odd"]),
    stopBits: z.union([z.literal(1), z.literal(2)]),
    slaveId: z.number().int().min(1).max(247),
  })
  .strict();
export const profileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    manufacturer: z.string().min(1).max(160),
    model: z.string().min(1).max(160),
    protocol: z.literal("MODBUS"),
    transports: z.array(z.enum(["RTU", "TCP"])).min(1),
    verified: z.boolean(),
    description: z.string().max(500),
    defaults: serialSchema,
    registers: z.array(registerSchema).min(1).max(32),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (new Set(p.registers.map((r) => r.metric)).size !== p.registers.length)
      ctx.addIssue({
        code: "custom",
        message: "Messgrößen müssen eindeutig sein.",
      });
    if (p.verified && p.registers.some((r) => r.address === null))
      ctx.addIssue({
        code: "custom",
        message: "Freigegebene Profile benötigen Registeradressen.",
      });
  });
export type ModbusProfile = z.infer<typeof profileSchema>;
export type RegisterDefinition = z.infer<typeof registerSchema>;
export const profiles = [
  profileSchema.parse(simulator),
  profileSchema.parse(template),
];
export function getProfile(id: string) {
  const p = profiles.find((p) => p.id === id);
  if (!p) throw new Error("Unbekanntes Modbus-Profil");
  return p;
}
const common = {
  profileId: z.string().min(1).max(80),
  pollingIntervalMs: z.number().int().min(1000).max(3600000),
  timeoutMs: z.number().int().min(100).max(10000),
};
export const modbusConfigSchema = z.discriminatedUnion("interface", [
  z
    .object({
      ...common,
      interface: z.literal("RTU"),
      comPort: z
        .string()
        .regex(
          /^(COM[1-9]\d{0,3}|\/dev\/(tty[A-Za-z0-9._-]+|serial\/by-id\/[A-Za-z0-9._:-]+))$/,
        ),
      ...serialSchema.shape,
    })
    .strict(),
  z
    .object({
      ...common,
      interface: z.literal("TCP"),
      host: z
        .string()
        .min(1)
        .max(253)
        .regex(/^[A-Za-z0-9.:-]+$/),
      port: z.number().int().min(1).max(65535),
      unitId: z.number().int().min(1).max(247),
    })
    .strict(),
]);
export type ModbusConfig = z.infer<typeof modbusConfigSchema>;
export const defaultConfig = {
  interface: "TCP",
  host: "127.0.0.1",
  port: 1502,
  unitId: 1,
  profileId: "simulator-three-phase-v1",
  pollingIntervalMs: 5000,
  timeoutMs: 1000,
} satisfies ModbusConfig;
export const faultSchema = z.enum([
  "NONE",
  "WRONG_SLAVE",
  "TIMEOUT",
  "DISCONNECTED",
  "INVALID_REGISTER",
  "UNREALISTIC",
  "COMMUNICATION",
]);
export type SimulatorFault = z.infer<typeof faultSchema>;
export const errorSchema = z.enum([
  "TIMEOUT",
  "WRONG_SLAVE",
  "DISCONNECTED",
  "INVALID_REGISTER",
  "UNREALISTIC",
  "CRC",
  "COMMUNICATION",
  "PROFILE",
  "ENDPOINT_NOT_ALLOWED",
]);
export const rawValueSchema = z
  .object({
    metric: metricSchema,
    register: z.number().int().min(0).max(65535),
    raw: z.string().regex(/^[0-9a-f]{4,16}$/),
    value: numericString,
    unit: z.enum(["kWh", "W", "V", "A", "Hz", "1"]),
  })
  .strict();
export const telemetrySchema = z
  .object({
    kind: z.literal("telemetry"),
    messageId: z.string().uuid(),
    deviceId: z.string().min(1),
    revision: z.number().int().positive(),
    timestamp: z.iso.datetime(),
    responseMs: z.number().int().min(0).max(600000),
    error: errorSchema.nullable(),
    values: z.array(rawValueSchema).max(32),
  })
  .strict();
export type Telemetry = z.infer<typeof telemetrySchema>;
export const commandAction = z.enum(["TEST", "READ", "START", "STOP"]);
export const controlRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    timestamp: z.iso.datetime(),
    results: z
      .array(
        z
          .object({
            id: z.string(),
            ok: z.boolean(),
            error: errorSchema.nullable(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export function diagnosticStatus(
  error: string | null,
  consecutiveErrors: number,
) {
  return !error
    ? "ONLINE"
    : consecutiveErrors >= 3 || error === "DISCONNECTED"
      ? "OFFLINE"
      : "WARNING";
}
export function offlineAfter(config: ModbusConfig) {
  return Math.max(15000, config.pollingIntervalMs * 3 + config.timeoutMs * 32);
}
