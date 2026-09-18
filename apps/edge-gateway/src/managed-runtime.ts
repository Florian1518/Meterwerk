import { z } from "zod";
import { readFile, writeFile, rename } from "node:fs/promises";
import {
  modbusConfigSchema,
  profileSchema,
  commandAction,
  type Telemetry,
  type ModbusConfig,
  errorSchema,
} from "../../../src/lib/modbus/contracts";
import { allowEndpoint, pollHardware } from "./hardware";
import { ModbusError } from "./registers";
import { randomUUID } from "node:crypto";
const commandSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  action: commandAction,
  revision: z.number().int(),
  expiresAt: z.iso.datetime(),
});
export const controlResponseSchema = z.object({
  requestId: z.string().uuid(),
  expiresAt: z.iso.datetime(),
  acknowledged: z.array(z.string()).max(50),
  devices: z
    .array(
      z.object({
        deviceId: z.string(),
        revision: z.number().int().positive(),
        configuration: modbusConfigSchema,
        profile: profileSchema,
        enabled: z.boolean(),
        disabled: z.boolean(),
      }),
    )
    .max(200),
  commands: z.array(commandSchema).max(50),
});
type Control = z.infer<typeof controlResponseSchema>;
const resultsSchema = z.array(
  z.object({ id: z.string(), ok: z.boolean(), error: errorSchema.nullable() }),
);
export class ManagedRuntime {
  private state: Control | null = null;
  private nextPoll = new Map<string, number>();
  private lastContact = new Map<string, number>();
  private commands = new Map<string, z.infer<typeof commandSchema>>();
  results: z.infer<typeof resultsSchema> = [];
  constructor(
    private file: string,
    private policy: { tcp: string[]; serial: string[] },
    private enqueue: (value: Telemetry) => Promise<void>,
  ) {}
  async load() {
    try {
      this.results = resultsSchema.parse(
        JSON.parse(await readFile(this.file, "utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    try {
      this.state = controlResponseSchema.parse(
        JSON.parse(await readFile(`${this.file}.configuration`, "utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  private async save() {
    if (this.state) {
      await writeFile(
        `${this.file}.configuration.tmp`,
        JSON.stringify(this.state),
      );
      await rename(
        `${this.file}.configuration.tmp`,
        `${this.file}.configuration`,
      );
    }
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.results));
    await rename(`${this.file}.tmp`, this.file);
  }
  hasDevice(id: string) {
    return this.state?.devices.some((d) => d.deviceId === id) ?? false;
  }
  connectedDevices() {
    return [...this.lastContact.values()].filter((t) => Date.now() - t < 15000)
      .length;
  }
  async configure(raw: unknown) {
    const value = controlResponseSchema.parse(raw);
    if (Date.parse(value.expiresAt) < Date.now())
      throw new Error("Expired configuration");
    this.results = this.results.filter(
      (r) => !value.acknowledged.includes(r.id),
    );
    this.state = value;
    await this.save();
    this.commands = new Map(value.commands.map((c) => [c.id, c]));
  }
  private async poll(device: Control["devices"][number]) {
    let sample: Telemetry;
    try {
      allowEndpoint(device.configuration, this.policy);
      sample = await pollHardware(
        device.deviceId,
        device.revision,
        device.configuration,
        device.profile,
      );
    } catch (error) {
      sample = {
        kind: "telemetry",
        messageId: randomUUID(),
        deviceId: device.deviceId,
        revision: device.revision,
        timestamp: new Date().toISOString(),
        responseMs: 0,
        error: error instanceof ModbusError ? error.code : "COMMUNICATION",
        values: [],
      };
    }
    await this.enqueue(sample);
    if (!sample.error) this.lastContact.set(device.deviceId, Date.now());
    else this.lastContact.delete(device.deviceId);
    return sample;
  }
  async tick(shouldStop: () => boolean = () => false) {
    const snapshot = this.state;
    if (!snapshot) return;
    // Previously authorized polling continues offline into the durable queue.
    // Commands still require their own fresh expiry and a signed control response.
    for (const command of this.commands.values()) {
      if (shouldStop()) break;
      if (
        this.results.some((r) => r.id === command.id) ||
        Date.parse(command.expiresAt) < Date.now()
      )
        continue;
      const device = snapshot.devices.find(
        (d) =>
          d.deviceId === command.deviceId && d.revision === command.revision,
      );
      let error: Telemetry["error"] = "PROFILE";
      if (device && (!device.disabled || command.action === "STOP")) {
        if (command.action === "STOP") {
          device.enabled = false;
          error = null;
        } else {
          const sample = await this.poll(device);
          error = sample.error;
          if (command.action === "START" && !error) {
            device.enabled = true;
            this.nextPoll.set(
              device.deviceId,
              Date.now() + device.configuration.pollingIntervalMs,
            );
          }
        }
      }
      this.results.push({ id: command.id, ok: error === null, error });
      await this.save();
    }
    for (const device of snapshot.devices) {
      if (shouldStop()) break;
      if (
        device.enabled &&
        !device.disabled &&
        (this.nextPoll.get(device.deviceId) ?? 0) <= Date.now()
      ) {
        await this.poll(device);
        this.nextPoll.set(
          device.deviceId,
          Date.now() + device.configuration.pollingIntervalMs,
        );
      }
    }
  }
}
export function endpointPolicy(raw: {
  allowedTcpEndpoints?: string[];
  allowedSerialPorts?: string[];
}) {
  return {
    tcp: raw.allowedTcpEndpoints ?? ["127.0.0.1:1502"],
    serial: raw.allowedSerialPorts ?? [],
  };
}
export function describeConnection(config: ModbusConfig) {
  return config.interface === "TCP"
    ? `${config.host}:${config.port} / Unit ${config.unitId}`
    : `${config.comPort} / ${config.baudRate} / Slave ${config.slaveId}`;
}
