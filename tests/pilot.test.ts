import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersistentQueue } from "../apps/edge-gateway/src/queue";
import { mqttConnection } from "../src/lib/mqtt-connection";
import { logRecord } from "../src/lib/logger";
import { restoreName, backupAction } from "../scripts/backup";
describe("pilot safety", () => {
  it("rejects a corrupted backup before starting Docker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "meterwerk-backup-"));
    try {
      const path = join(dir, "invalid.dump");
      await writeFile(path, "PGDMPcorrupted");
      await writeFile(`${path}.sha256`, "wrong");
      await expect(backupAction("verify", path)).rejects.toThrow("checksum");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("enforces the byte limit as well as the item limit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "meterwerk-bytes-"));
    try {
      const q = new PersistentQueue<{ messageId: string; data: string }>(
        join(dir, "q"),
        {
          maxItems: 100,
          maxBytes: 100,
          maxAgeMs: 1000,
          warningItems: 50,
          maxAttempts: 2,
          quarantineItems: 1,
        },
      );
      await q.enqueue({ messageId: "large", data: "x".repeat(200) });
      expect(q.size).toBe(0);
      expect(q.status.queueDropped).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("requires TLS for production/pilot but permits isolated staging MQTT", async () => {
    for (const env of [
      { METERWERK_ENV: "pilot" },
      { NODE_ENV: "production" },
      { METERWERK_ENV: "production", MQTT_BROKER_URL: "mqtt://localhost" },
      {
        METERWERK_ENV: "pilot",
        MQTT_BROKER_URL: "mqtts://localhost",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
    ])
      await expect(mqttConnection("a", env)).rejects.toThrow();
    expect(
      (
        await mqttConnection("a", {
          NODE_ENV: "production",
          METERWERK_ENV: "staging",
          MQTT_BROKER_URL: "mqtt://mqtt:1883",
        })
      ).url,
    ).toBe("mqtt://mqtt:1883");
    expect((await mqttConnection("a", {})).options.rejectUnauthorized).toBe(
      true,
    );
    await expect(
      mqttConnection("a", { MQTT_BROKER_URL: "mqtt://name:secret@localhost" }),
    ).rejects.toThrow();
    await expect(
      mqttConnection("a", {
        METERWERK_ENV: "pilot",
        MQTT_BROKER_URL: "mqtts://localhost",
      }),
    ).rejects.toThrow();
  });
  it("does not serialize credentials, errors or bodies into logs", () => {
    const line = JSON.stringify(
      logRecord("ERROR", "test", "rejected", {
        tenantId: "tenant-1",
        gatewayId: "gateway-1",
        messageId: "msg-1",
        password: "hidden",
        token: "hidden",
        privateKey: "hidden",
        error: new Error("hidden"),
        body: "hidden",
      }),
    );
    expect(line).not.toContain("hidden");
    expect(line).toContain("msg-1");
    expect(line).toContain("timestamp");
  });
  it("restricts restore to a separate database name", () => {
    expect(restoreName("meterwerk_restore_test")).toBe(
      "meterwerk_restore_test",
    );
    for (const name of [
      "meterwerk",
      "postgres",
      "meterwerk_restore_a;drop database meterwerk",
      "../x",
    ])
      expect(() => restoreName(name)).toThrow();
  });
  it("bounds queue and quarantine, persists retries and expires old values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "meterwerk-pilot-"));
    const limits = {
      maxItems: 2,
      maxBytes: 10000,
      maxAgeMs: 10000,
      warningItems: 1,
      maxAttempts: 2,
      quarantineItems: 1,
    };
    const clock = vi.spyOn(Date, "now").mockReturnValue(100000);
    try {
      const file = join(dir, "queue.json");
      const q = new PersistentQueue<{ messageId: string }>(file, limits);
      await q.enqueue({ messageId: "a" });
      await q.enqueue({ messageId: "b" });
      await q.enqueue({ messageId: "c" });
      expect(q.size).toBe(2);
      expect(q.status.quarantineSize).toBe(1);
      expect(q.status.queueWarning).toBe(true);
      const fail = vi.fn(async () => {
        throw new Error("offline");
      });
      await expect(q.drain(fail)).rejects.toThrow();
      const reloaded = new PersistentQueue<{ messageId: string }>(file, limits);
      await reloaded.load();
      await reloaded.drain(async () => undefined);
      expect(reloaded.size).toBe(1); // a waits for backoff, b can progress
      clock.mockReturnValue(102000);
      await expect(reloaded.drain(fail)).rejects.toThrow();
      expect(reloaded.size).toBe(0);
      expect(reloaded.status.queueDropped).toBe(1);
      await reloaded.enqueue({ messageId: "d" });
      clock.mockReturnValue(120000);
      await reloaded.drain(async () => undefined);
      expect(reloaded.size).toBe(0);
      expect(reloaded.status.quarantineSize).toBeLessThanOrEqual(1);
    } finally {
      clock.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
