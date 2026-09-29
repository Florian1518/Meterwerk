import "dotenv/config";
import "server-only";
import { readFile } from "node:fs/promises";
import { connect } from "mqtt";
import { ingestGatewayMessage, detectOffline } from "./gateway-ingestion";
import { signedMessage } from "../../apps/edge-gateway/src/wire";
import { mqttConnection } from "../lib/mqtt-connection";
import { log } from "../lib/logger";
import { recordWorkerHealth } from "./system-status";
import { deliverNextWebhook } from "./webhooks";
import { db } from "./db";
const receiptKey = await readFile(
  process.env.MQTT_RECEIPT_KEY_PATH ?? ".local/receipt-private.pem",
  "utf8",
);
const mqttConfig = await mqttConnection("meterwerk-ingestion");
const client = connect(mqttConfig.url, mqttConfig.options);
let subscribed = false,
  errorStreak = 0;
let lastErrorAt = 0;
let lastIngestionAt: Date | null = null;
client.on("error", () => log("ERROR", "ingestion", "mqtt.connection.error"));
client.on("offline", () => {
  subscribed = false;
});
client.on("connect", () => {
  client.subscribe(
    [
      "meterwerk/v1/gateways/+/readings",
      "meterwerk/v1/gateways/+/heartbeat",
      "meterwerk/v1/gateways/+/telemetry",
      "meterwerk/v1/gateways/+/control",
    ],
    { qos: 1 },
    (error) => {
      subscribed = !error;
      log(
        error ? "ERROR" : "INFO",
        "ingestion",
        error ? "mqtt.subscription.failed" : "mqtt.subscribed",
      );
    },
  );
});
let pending = Promise.resolve();
client.on("message", (topic, payload) => {
  pending = pending
    .then(async () => {
      const result = await ingestGatewayMessage(topic, payload);
      lastIngestionAt = new Date();
      if (result) {
        log("DEBUG", "ingestion", "message.accepted", {
          gatewayId: result.gatewayId,
          ...("messageId" in result ? { messageId: result.messageId } : {}),
        });
        const ackTopic = `meterwerk/v1/gateways/${result.gatewayId}/${"control" in result ? "configuration" : "ack"}`;
        await client.publishAsync(
          ackTopic,
          signedMessage(
            ackTopic,
            "meterwerk-receipt",
            "control" in result ? result.control : result,
            receiptKey,
          ),
          { qos: 1 },
        );
      }
    })
    .catch(() => {
      if (Date.now() - lastErrorAt > 60000) errorStreak = 0;
      errorStreak++;
      lastErrorAt = Date.now();
      log("WARN", "ingestion", "message.rejected");
    });
});
let detecting = false;
const timer = setInterval(() => {
  if (detecting) return;
  detecting = true;
  if (Date.now() - lastErrorAt > 60000) errorStreak = 0;
  void detectOffline()
    .then(() =>
      recordWorkerHealth(
        client.connected,
        subscribed,
        errorStreak,
        lastIngestionAt,
      ),
    )
    .catch(() => log("ERROR", "ingestion", "monitor.failed"))
    .finally(() => {
      detecting = false;
    });
}, 2000);
let deliveringWebhook = false;
const webhookTimer = setInterval(() => {
  if (deliveringWebhook) return;
  deliveringWebhook = true;
  void deliverNextWebhook()
    .catch(() => log("WARN", "webhooks", "delivery.worker.failed"))
    .finally(() => {
      deliveringWebhook = false;
    });
}, 1000);
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    clearInterval(webhookTimer);
    void (async () => {
      await pending;
      await recordWorkerHealth(
        false,
        false,
        errorStreak,
        lastIngestionAt,
      ).catch(() => undefined);
      try {
        await new Promise<void>((resolve, reject) =>
          client.end(true, (error) => (error ? reject(error) : resolve())),
        );
      } finally {
        await db.$disconnect();
      }
      log("INFO", "ingestion", "worker.stopped");
    })().catch(() => {
      log("ERROR", "ingestion", "worker.shutdown.failed");
      process.exitCode = 1;
      client.end(true);
      void db.$disconnect();
    });
  });
