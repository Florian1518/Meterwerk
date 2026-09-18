import "dotenv/config";
import "server-only";
import { readFile } from "node:fs/promises";
import { connect } from "mqtt";
import { ingestGatewayMessage, detectOffline } from "./gateway-ingestion";
import { signedMessage } from "../../apps/edge-gateway/src/wire";
const receiptKey = await readFile(".local/receipt-private.pem", "utf8");
const client = connect(process.env.MQTT_BROKER_URL ?? "mqtt://127.0.0.1:1883", {
  clientId: "meterwerk-ingestion-local",
  reconnectPeriod: 1000,
  connectTimeout: 3000,
});
client.on("error", () => console.error("MQTT worker connection unavailable"));
client.on("connect", () => {
  client.subscribe(
    ["meterwerk/v1/gateways/+/readings", "meterwerk/v1/gateways/+/heartbeat"],
    { qos: 1 },
    (error) => {
      if (error) console.error("MQTT subscription failed");
      else console.log("MQTT ingestion subscribed");
    },
  );
});
let pending = Promise.resolve();
client.on("message", (topic, payload) => {
  pending = pending
    .then(async () => {
      const result = await ingestGatewayMessage(topic, payload);
      if (result) {
        const ackTopic = `meterwerk/v1/gateways/${result.gatewayId}/ack`;
        await client.publishAsync(
          ackTopic,
          signedMessage(ackTopic, "meterwerk-receipt", result, receiptKey),
          { qos: 1 },
        );
      }
    })
    .catch(() =>
      console.error("MQTT message rejected or database unavailable"),
    );
});
let detecting = false;
setInterval(() => {
  if (detecting) return;
  detecting = true;
  void detectOffline()
    .catch(() => console.error("Offline detection failed"))
    .finally(() => {
      detecting = false;
    });
}, 2000);
