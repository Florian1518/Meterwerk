import { randomUUID } from "node:crypto";
import {
  modbusConfigSchema,
  profileSchema,
  type ModbusConfig,
  type ModbusProfile,
  type Telemetry,
} from "../../../src/lib/modbus/contracts";
import { decodeRegister, ModbusError } from "./registers";
import { openTransport, type RegisterReader } from "./modbus-transport";
export function allowEndpoint(
  config: ModbusConfig,
  policy: { tcp: string[]; serial: string[] },
) {
  if (
    config.interface === "TCP"
      ? !policy.tcp.includes(`${config.host}:${config.port}`)
      : !policy.serial.includes(config.comPort)
  )
    throw new ModbusError("ENDPOINT_NOT_ALLOWED");
}
export async function pollHardware(
  deviceId: string,
  revision: number,
  config: ModbusConfig,
  profile: ModbusProfile,
  readOverride?: RegisterReader,
): Promise<Telemetry> {
  const started = Date.now();
  const values: Telemetry["values"] = [];
  let error: Telemetry["error"] = null;
  let transport: Awaited<ReturnType<typeof openTransport>> | undefined;
  try {
    modbusConfigSchema.parse(config);
    profileSchema.parse(profile);
    if (
      !profile.verified ||
      profile.id !== config.profileId ||
      !profile.transports.includes(config.interface) ||
      profile.registers.some((r) => r.address === null)
    )
      throw new ModbusError("PROFILE");
    if (!readOverride) transport = await openTransport(config);
    const read = readOverride ?? transport!.read;
    for (const r of profile.registers) {
      const bytes = await read(r);
      values.push({
        metric: r.metric,
        register: r.address!,
        raw: bytes.toString("hex"),
        value: decodeRegister(bytes, r),
        unit: r.unit,
      });
    }
  } catch (cause) {
    error = cause instanceof ModbusError ? cause.code : "COMMUNICATION";
  } finally {
    await transport?.close();
  }
  return {
    kind: "telemetry",
    messageId: randomUUID(),
    deviceId,
    revision,
    timestamp: new Date().toISOString(),
    responseMs: Date.now() - started,
    error,
    values,
  };
}
