import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { connect, type MqttClient } from "mqtt";
import { mqttConnection } from "../src/lib/mqtt-connection";
const clients: MqttClient[] = [];
async function client(id: string) {
  const config = await mqttConnection(id, {
    METERWERK_ENV: "pilot",
    MQTT_BROKER_URL: "mqtts://localhost:8883",
    MQTT_CA_PATH: ".local/pilot-mqtt/ca.crt",
    MQTT_CERT_PATH: `.local/pilot-mqtt/${id}.crt`,
    MQTT_KEY_PATH: `.local/pilot-mqtt/${id}.key`,
  });
  const c = connect(config.url, {
    ...config.options,
    reconnectPeriod: 0,
    protocolVersion: 5,
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.once("connect", () => resolve());
    c.once("error", reject);
  });
  return c;
}
try {
  const a = await client("alpha"),
    b = await client("beta"),
    worker = await client("meterwerk-ingestion");
  const received: string[] = [];
  worker.on("message", (topic) => received.push(topic));
  await worker.subscribeAsync("meterwerk/v1/gateways/+/readings");
  await a.publishAsync("meterwerk/v1/gateways/alpha/readings", "test", {
    qos: 1,
  });
  await assert.rejects(
    a.publishAsync("meterwerk/v1/gateways/beta/readings", "forbidden", {
      qos: 1,
    }),
  );
  const foreignMessages: string[] = [];
  b.on("message", (topic) => foreignMessages.push(topic));
  // Mosquitto can accept SUBSCRIBE, then enforce read ACLs at delivery time.
  await b.subscribeAsync("meterwerk/v1/gateways/alpha/ack");
  await a.subscribeAsync("meterwerk/v1/gateways/alpha/ack");
  const ack = new Promise<void>((resolve) =>
    a.once("message", () => resolve()),
  );
  await worker.publishAsync("meterwerk/v1/gateways/alpha/ack", "test", {
    qos: 1,
  });
  await ack;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(received, ["meterwerk/v1/gateways/alpha/readings"]);
  assert.deepEqual(foreignMessages, []);
  for (const options of [
    { rejectUnauthorized: true },
    {
      rejectUnauthorized: true,
      ca: await readFile(".local/pilot-mqtt/ca.crt"),
    },
  ]) {
    const denied = connect("mqtts://localhost:8883", {
      ...options,
      reconnectPeriod: 0,
      connectTimeout: 2000,
    });
    clients.push(denied);
    await new Promise<void>((resolve, reject) => {
      denied.once("error", () => resolve());
      denied.once("connect", () =>
        reject(new Error("Unauthenticated TLS accepted")),
      );
    });
  }
  console.log(
    "7 real MQTT TLS/ACL checks passed: mutual TLS, own publish, foreign publish denied, foreign read denied, worker receipt, untrusted CA and missing client certificate rejected",
  );
} finally {
  for (const c of clients) c.end(true);
}
