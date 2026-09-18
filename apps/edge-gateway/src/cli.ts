import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connect } from "mqtt";
import { z } from "zod";
import { PersistentQueue } from "./queue";
import { topic } from "./mqtt";
import { signedMessage, envelopeSchema, verifyMessage } from "./wire";
import { energyDecimal, readModbusEnergy } from "./tcp-modbus";
const config = z
  .object({
    gatewayId: z.string(),
    deviceId: z.string(),
    credentialId: z.string(),
  })
  .parse(JSON.parse(await readFile(".local/edge-config.json", "utf8")));
const privateKey = await readFile(".local/gateway-private.pem", "utf8");
const receiptPublicKey = await readFile(".local/receipt-public.pem", "utf8");
const queue = new PersistentQueue(".local/edge-queue.json");
await queue.load();
const client = connect(process.env.MQTT_BROKER_URL ?? "mqtt://127.0.0.1:1883", {
  clientId: `edge-${config.gatewayId}`,
  reconnectPeriod: 1000,
  connectTimeout: 3000,
  queueQoSZero: false,
});
const ackTopic = `meterwerk/v1/gateways/${config.gatewayId}/ack`;
const waiting = new Map<string, () => void>();
client.on("error", () => undefined);
let ready = false;
client.on("offline", () => {
  ready = false;
});
client.on("connect", () => {
  client.subscribe(ackTopic, { qos: 1 }, (error) => {
    ready = !error;
  });
});
client.on("message", (receivedTopic, payload) => {
  try {
    const envelope = envelopeSchema.parse(JSON.parse(payload.toString()));
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
      const destination = topic(config.gatewayId, "readings");
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
const started = Date.now();
console.log(`Edge gateway ${config.gatewayId} started`);
while (true) {
  let connected = false;
  try {
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
  } catch {
    console.log("Modbus device unavailable");
  }
  if (ready) {
    const destination = topic(config.gatewayId, "heartbeat");
    client.publish(
      destination,
      signedMessage(
        destination,
        config.credentialId,
        {
          gatewayId: config.gatewayId,
          timestamp: new Date().toISOString(),
          agentVersion: "0.3.0",
          uptime: Math.floor((Date.now() - started) / 1000),
          connectedDevices: connected ? 1 : 0,
          queueSize: queue.size,
        },
        privateKey,
      ),
      { qos: 0 },
    );
  }
  try {
    await flush();
  } catch {
    /* Keep the durable queue for the next attempt. */
  }
  console.log(
    `Edge poll: device=${connected ? "ONLINE" : "OFFLINE"}, queue=${queue.size}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
