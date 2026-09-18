import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  envelopeSchema,
  signedMessage,
  verifyMessage,
} from "../apps/edge-gateway/src/wire";
import { PersistentQueue } from "../apps/edge-gateway/src/queue";
describe("gateway delivery", () => {
  it("binds signatures to topic, credential and body", () => {
    const pair = generateKeyPairSync("ed25519");
    const privateKey = pair.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    const publicKey = pair.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    const envelope = envelopeSchema.parse(
      JSON.parse(
        signedMessage("topic", "credential", { messageId: "one" }, privateKey),
      ),
    );
    expect(verifyMessage("topic", envelope, publicKey)).toBe(true);
    expect(verifyMessage("other", envelope, publicKey)).toBe(false);
    expect(
      verifyMessage("topic", { ...envelope, credentialId: "other" }, publicKey),
    ).toBe(false);
    expect(verifyMessage("topic", { ...envelope, body: "{}" }, publicKey)).toBe(
      false,
    );
  });
  it("retains failed deliveries across restart and rejects corrupted storage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "meterwerk-queue-"));
    const file = join(dir, "queue.json");
    try {
      const queue = new PersistentQueue(file);
      await queue.enqueue({
        messageId: "one",
        deviceId: "device",
        timestamp: new Date().toISOString(),
        value: "1.000000",
        consumption: "0.000001",
        unit: "kWh",
        quality: "VALID",
        source: "MQTT",
      });
      await expect(
        queue.drain(async () => {
          throw new Error("offline");
        }),
      ).rejects.toThrow("offline");
      const restored = new PersistentQueue(file);
      await restored.load();
      expect(restored.size).toBe(1);
      await restored.drain(async () => undefined);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual([]);
      await writeFile(file, "corrupt");
      await expect(new PersistentQueue(file).load()).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
