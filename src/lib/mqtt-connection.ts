import { readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import type { IClientOptions } from "mqtt";
import type { ConnectionOptions } from "node:tls";

export async function mqttConnection(
  identity: string,
  env: Record<string, string | undefined> = process.env,
) {
  const url = new URL(env.MQTT_BROKER_URL ?? "mqtt://127.0.0.1:1883");
  const pilot = env.METERWERK_ENV === "pilot";
  const secureTransportRequired = env.METERWERK_ENV
    ? env.METERWERK_ENV === "production" || pilot
    : env.NODE_ENV === "production";
  if (
    !["mqtt:", "mqtts:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "MQTT URL must contain only a supported scheme and endpoint",
    );
  if (
    secureTransportRequired &&
    (url.protocol !== "mqtts:" || env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
  )
    throw new Error("This environment requires validated MQTT TLS.");
  const options: IClientOptions & ConnectionOptions = {
    clientId: identity,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    rejectUnauthorized: true,
    queueQoSZero: false,
  };
  if (url.protocol === "mqtts:") {
    options.minVersion = "TLSv1.2";
    if (env.MQTT_CA_PATH) options.ca = await readFile(env.MQTT_CA_PATH);
    if (pilot && (!env.MQTT_CERT_PATH || !env.MQTT_KEY_PATH))
      throw new Error("Pilot requires client certificate and key");
    if (env.MQTT_CERT_PATH || env.MQTT_KEY_PATH) {
      if (!env.MQTT_CERT_PATH || !env.MQTT_KEY_PATH)
        throw new Error("Incomplete MQTT client identity");
      options.cert = await readFile(env.MQTT_CERT_PATH);
      options.key = await readFile(env.MQTT_KEY_PATH);
      const cert = new X509Certificate(options.cert);
      const cn = cert.subject
        .split("\n")
        .find((line) => line.startsWith("CN="))
        ?.slice(3);
      if (cn !== identity)
        throw new Error("MQTT certificate identity mismatch");
    }
  }
  return { url: url.toString(), options };
}
