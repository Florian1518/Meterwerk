import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, open, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { connect } from "mqtt";
import { z } from "zod";
import { mqttConnection } from "../../../src/lib/mqtt-connection";
import { log } from "../../../src/lib/logger";
const agentVersion = "0.4.1";
if (process.argv.includes("--version")) {
  console.log(agentVersion);
  process.exit(0);
}
import { PersistentQueue } from "./queue";
import { topic } from "./mqtt";
import { signedMessage, envelopeSchema, verifyMessage } from "./wire";
import { energyDecimal, readModbusEnergy } from "./tcp-modbus";
import type { ReadingMessage } from "./types";
import type { Telemetry } from "../../../src/lib/modbus/contracts";
import {
  ManagedRuntime,
  endpointPolicy,
  controlResponseSchema,
} from "./managed-runtime";
const configPath = resolve(
  process.env.EDGE_CONFIG_PATH ?? ".local/edge-config.json",
);
const config = z
  .object({
    gatewayId: z.string(),
    deviceId: z.string(),
    credentialId: z.string(),
    dataDirectory: z.string().optional(),
    privateKeyPath: z.string().optional(),
    receiptPublicKeyPath: z.string().optional(),
    allowedTcpEndpoints: z.array(z.string()).optional(),
    allowedSerialPorts: z.array(z.string()).optional(),
    queueLimits: z
      .object({
        maxItems: z.number().int().positive(),
        maxBytes: z.number().int().positive(),
        maxAgeMs: z.number().int().positive(),
        warningItems: z.number().int().positive(),
        maxAttempts: z.number().int().positive(),
        quarantineItems: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .parse(JSON.parse(await readFile(configPath, "utf8")));
const dataDirectory = resolve(config.dataDirectory ?? dirname(configPath));
await mkdir(dataDirectory, { recursive: true });
const lockPath = resolve(dataDirectory, "edge.lock");
try {
  const lock = await open(lockPath, "wx");
  await lock.writeFile(String(process.pid));
  await lock.close();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  const pid = Number(await readFile(lockPath, "utf8"));
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  if (alive) throw new Error("Edge instance already running");
  await unlink(lockPath);
  const lock = await open(lockPath, "wx");
  await lock.writeFile(String(process.pid));
  await lock.close();
}
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
  });
const privateKey = await readFile(
  config.privateKeyPath ?? resolve(dirname(configPath), "gateway-private.pem"),
  "utf8",
);
const receiptPublicKey = await readFile(
  config.receiptPublicKeyPath ??
    resolve(dirname(configPath), "receipt-public.pem"),
  "utf8",
);
const queue = new PersistentQueue<ReadingMessage | Telemetry>(
  resolve(dataDirectory, "edge-queue.json"),
  config.queueLimits,
);
await queue.load();
const mqttConfig = await mqttConnection(config.gatewayId);
// Load durable state and register listeners before opening the connection.
const client = connect(mqttConfig.url, {
  ...mqttConfig.options,
  manualConnect: true,
});
const ackTopic = `meterwerk/v1/gateways/${config.gatewayId}/ack`;
const configurationTopic = `meterwerk/v1/gateways/${config.gatewayId}/configuration`;
const runtime = new ManagedRuntime(
  resolve(dataDirectory, "hardware-results.json"),
  endpointPolicy(config),
  (sample) => queue.enqueue(sample),
);
await runtime.load();
const requests = new Map<string, number>();
let configurationPending: unknown;
const waiting = new Map<string, () => void>();
client.on("error", () =>
  log("WARN", "edge", "mqtt.connection.error", { gatewayId: config.gatewayId }),
);
let ready = false;
client.on("offline", () => {
  ready = false;
});
client.on("connect", () => {
  client.subscribe([ackTopic, configurationTopic], { qos: 1 }, (error) => {
    ready = !error;
  });
});
client.on("message", (receivedTopic, payload) => {
  try {
    const envelope = envelopeSchema.parse(JSON.parse(payload.toString()));
    if (
      receivedTopic === configurationTopic &&
      envelope.credentialId === "meterwerk-receipt" &&
      verifyMessage(receivedTopic, envelope, receiptPublicKey)
    ) {
      const value = controlResponseSchema.parse(JSON.parse(envelope.body));
      const sent = requests.get(value.requestId);
      if (!sent || Date.now() - sent > 10000) return;
      requests.delete(value.requestId);
      configurationPending = value;
      return;
    }
    if (
      receivedTopic !== ackTopic ||
      envelope.credentialId !== "meterwerk-receipt" ||
      !verifyMessage(receivedTopic, envelope, receiptPublicKey)
    )
      return;
    const ack = z
      .object({
        gatewayId: z.literal(config.gatewayId),
        messageId: z.string(),
        duplicate: z.boolean(),
      })
      .strict()
      .parse(JSON.parse(envelope.body));
    waiting.get(ack.messageId)?.();
  } catch {
    /* Invalid receipts never remove a queued reading. */
  }
});
async function flush() {
  if (!ready) return;
  await queue.drain(async (item) => {
    if (stopping) throw new Error("Agent stopping");
    if (!ready) throw new Error("MQTT offline");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(item.messageId);
        reject(new Error("Commit receipt timeout"));
      }, 3000);
      waiting.set(item.messageId, () => {
        clearTimeout(timer);
        waiting.delete(item.messageId);
        resolve();
      });
      const destination = `meterwerk/v1/gateways/${config.gatewayId}/${"kind" in item ? "telemetry" : "readings"}`;
      client.publish(
        destination,
        signedMessage(destination, config.credentialId, item, privateKey),
        { qos: 1 },
        (error) => {
          if (error) {
            clearTimeout(timer);
            waiting.delete(item.messageId);
            reject(error);
          }
        },
      );
    });
  });
}
let previous: bigint | undefined;
client.connect();
const started = Date.now();
log("INFO", "edge", "agent.started", { gatewayId: config.gatewayId });
let connected = false;
const controlTimer = setInterval(() => {
  if (!ready) return;
  for (const [id, sent] of requests)
    if (Date.now() - sent > 10000) requests.delete(id);
  const requestId = randomUUID();
  requests.set(requestId, Date.now());
  const destination = `meterwerk/v1/gateways/${config.gatewayId}/control`;
  client.publish(
    destination,
    signedMessage(
      destination,
      config.credentialId,
      {
        requestId,
        timestamp: new Date().toISOString(),
        results: runtime.results.slice(0, 50),
      },
      privateKey,
    ),
    { qos: 0 },
  );
  const heartbeatTopic = topic(config.gatewayId, "heartbeat");
  client.publish(
    heartbeatTopic,
    signedMessage(
      heartbeatTopic,
      config.credentialId,
      {
        gatewayId: config.gatewayId,
        timestamp: new Date().toISOString(),
        agentVersion,
        uptime: Math.floor((Date.now() - started) / 1000),
        connectedDevices: runtime.connectedDevices() + (connected ? 1 : 0),
        ...queue.status,
      },
      privateKey,
    ),
    { qos: 0 },
  );
}, 2000);
while (!stopping) {
  if (configurationPending) {
    const pending = configurationPending;
    configurationPending = undefined;
    await runtime.configure(pending);
  }
  await runtime.tick(() => stopping);
  connected = false;
  try {
    if (
      !runtime.hasDevice(config.deviceId) &&
      process.env.METERWERK_ENV !== "pilot" &&
      process.env.NODE_ENV !== "production"
    ) {
      const total = await readModbusEnergy();
      connected = true;
      const delta = previous === undefined ? 0n : total - previous;
      if (delta < 0n) throw new Error("Meter reset requires review");
      await queue.enqueue({
        messageId: randomUUID(),
        deviceId: config.deviceId,
        timestamp: new Date().toISOString(),
        value: energyDecimal(total),
        consumption: energyDecimal(delta),
        unit: "kWh",
        quality: "VALID",
        source: "MQTT",
      });
      previous = total;
    }
  } catch {
    log("WARN", "edge", "modbus.unavailable", {
      gatewayId: config.gatewayId,
      deviceId: config.deviceId,
    });
  }
  try {
    await flush();
  } catch {
    /* Keep the durable queue for the next attempt. */
  }
  log(
    queue.status.queueWarning || queue.status.quarantineSize > 0
      ? "WARN"
      : "DEBUG",
    "edge",
    "queue.status",
    { gatewayId: config.gatewayId, ...queue.status },
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
clearInterval(controlTimer);
client.end(true);
await unlink(lockPath);
