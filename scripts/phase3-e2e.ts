import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { connect } from "mqtt";
import { db } from "../src/server/db";
import {
  signedMessage,
  envelopeSchema,
  verifyMessage,
} from "../apps/edge-gateway/src/wire";
if (
  process.env.SEED_DEMO !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Local demo only");
const children: ChildProcess[] = [];
const results: { test: string; passed: boolean; detail?: unknown }[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function start(name: string, script: string, server = false) {
  const log = openSync(`.local/${name}.log`, "a");
  const child = spawn(
    process.execPath,
    [
      ...(server ? ["--conditions=react-server"] : []),
      "--import",
      "tsx",
      script,
    ],
    { detached: true, windowsHide: true, stdio: ["ignore", log, log] },
  );
  closeSync(log);
  children.push(child);
  child.unref();
  return child;
}
async function until(
  name: string,
  check: () => Promise<boolean>,
  timeout = 45000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) {
      results.push({ test: name, passed: true });
      console.log(`PASS ${name}`);
      return;
    }
    await pause(1000);
  }
  throw new Error(`Timeout: ${name}`);
}
const deviceId = "demo-modbus-device",
  gatewayId = "demo-edge-gateway";
const device = () =>
  db.device.findUniqueOrThrow({
    where: { id: deviceId },
    select: { status: true },
  });
const gateway = () =>
  db.gateway.findUniqueOrThrow({
    where: { id: gatewayId },
    select: { status: true },
  });
const count = () => db.reading.count({ where: { deviceId, source: "MQTT" } });
const queue = async () =>
  JSON.parse(await readFile(".local/edge-queue.json", "utf8")) as {
    messageId: string;
  }[];
let brokerStopped = false;
let sessionId: string | undefined;
let mqtt: ReturnType<typeof connect> | undefined;
try {
  let previousProcesses: Record<string, number> = {};
  try {
    previousProcesses = JSON.parse(
      await readFile(".local/phase3-processes.json", "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const pid of Object.values(previousProcesses)) {
    let running = true;
    try {
      process.kill(pid, 0);
    } catch {
      running = false;
    }
    if (running)
      throw new Error(
        "Phase-3 processes already running; run node scripts/stop-phase3.mjs first",
      );
  }
  const initialCount = await count();
  const worker = start("mqtt-worker", "src/server/mqtt-worker.ts", true);
  let simulator = start("modbus-simulator", "scripts/modbus-simulator.ts");
  const edge = start("edge-gateway", "apps/edge-gateway/src/cli.ts");
  await until(
    "Gateway ONLINE",
    async () => (await gateway()).status === "ONLINE",
  );
  await until(
    "Device ONLINE and MQTT readings persisted",
    async () =>
      (await device()).status === "ONLINE" &&
      (await count()) >= initialCount + 3,
  );
  const token = randomBytes(32).toString("hex");
  sessionId = createHash("sha256").update(token).digest("hex");
  await db.session.create({
    data: {
      id: sessionId,
      userId: "demo-tenant-0-user-0",
      expiresAt: new Date(Date.now() + 300000),
    },
  });
  const html = async () => {
    const response = await fetch("http://127.0.0.1:3000/dashboard", {
      headers: { cookie: `meterwerk_session=${token}` },
    });
    assert.equal(response.status, 200);
    return response.text();
  };
  const firstHtml = await html();
  assert(firstHtml.includes("MODBUS-DEMO-001"));
  const latest = await db.reading.findFirstOrThrow({
    where: { deviceId },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  await until("Dashboard returns current measurement timestamp", async () => {
    const value = await html();
    return (
      value.includes("MODBUS-DEMO-001") &&
      value !== firstHtml &&
      !value.includes("Ansicht nicht verfügbar")
    );
  });
  simulator.kill();
  await until(
    "Simulator stopped: Device OFFLINE",
    async () => (await device()).status === "OFFLINE",
  );
  assert.equal((await gateway()).status, "ONLINE");
  results.push({
    test: "Gateway remains ONLINE while device is stopped",
    passed: true,
  });
  simulator = start("modbus-simulator", "scripts/modbus-simulator.ts");
  await until(
    "Simulator restarted: Device ONLINE",
    async () => (await device()).status === "ONLINE",
  );
  execFileSync("docker", ["compose", "stop", "mqtt"], { stdio: "pipe" });
  brokerStopped = true;
  await until(
    "MQTT stopped: durable queue grows",
    async () => (await queue()).length >= 4,
  );
  await until(
    "MQTT stopped: Gateway OFFLINE",
    async () => (await gateway()).status === "OFFLINE",
  );
  const queued = await queue();
  const queuedIds = queued.map((item) => item.messageId);
  execFileSync("docker", ["compose", "up", "-d", "--wait", "mqtt"], {
    stdio: "pipe",
  });
  brokerStopped = false;
  await until(
    "MQTT restarted: all queued messages persisted",
    async () =>
      (await db.reading.count({
        where: { deviceId, messageId: { in: queuedIds } },
      })) === queuedIds.length,
  );
  await until(
    "Queue drained and Gateway/Device ONLINE",
    async () =>
      (await queue()).length === 0 &&
      (await gateway()).status === "ONLINE" &&
      (await device()).status === "ONLINE",
  );
  const row = await db.reading.findFirstOrThrow({
    where: { deviceId },
    orderBy: { timestamp: "desc" },
  });
  const key = await readFile(".local/gateway-private.pem", "utf8");
  const receiptKey = await readFile(".local/receipt-public.pem", "utf8");
  mqtt = connect("mqtt://127.0.0.1:1883", { reconnectPeriod: 0 });
  await new Promise<void>((resolve, reject) => {
    mqtt!.once("connect", () => resolve());
    mqtt!.once("error", reject);
  });
  const ackTopic = `meterwerk/v1/gateways/${gatewayId}/ack`;
  await mqtt.subscribeAsync(ackTopic, { qos: 1 });
  const receipt = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Duplicate receipt timeout")),
      10000,
    );
    mqtt!.on("message", (destination, payload) => {
      const envelope = envelopeSchema.parse(JSON.parse(payload.toString()));
      if (
        destination !== ackTopic ||
        !verifyMessage(destination, envelope, receiptKey)
      )
        return;
      const ack = JSON.parse(envelope.body) as {
        messageId: string;
        duplicate: boolean;
      };
      if (ack.messageId === row.messageId && ack.duplicate) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const destination = `meterwerk/v1/gateways/${gatewayId}/readings`;
  await mqtt.publishAsync(
    destination,
    signedMessage(
      destination,
      "demo-edge-credential",
      {
        messageId: row.messageId,
        deviceId,
        timestamp: row.timestamp.toISOString(),
        value: row.registerValue.toFixed(6),
        consumption: row.consumption.toFixed(6),
        unit: "kWh",
        quality: "VALID",
        source: "MQTT",
      },
      key,
    ),
    { qos: 1 },
  );
  await receipt;
  assert.equal(
    await db.reading.count({ where: { deviceId, messageId: row.messageId } }),
    1,
  );
  results.push({
    test: "MQTT duplicate replay acknowledged without duplicate reading",
    passed: true,
  });
  await writeFile(
    ".local/phase3-processes.json",
    JSON.stringify({
      worker: worker.pid,
      simulator: simulator.pid,
      edge: edge.pid,
    }),
  );
  results.push({
    test: "Real Modbus → Edge → MQTT → Ingestion → PostgreSQL → Dashboard",
    passed: true,
    detail: {
      initialCount,
      finalCount: await count(),
      queuedReplayed: queuedIds.length,
      firstTimestamp: latest.timestamp.toISOString(),
    },
  });
} catch (error) {
  results.push({
    test: error instanceof Error ? error.message : "E2E failure",
    passed: false,
  });
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = 1;
} finally {
  if (brokerStopped)
    execFileSync("docker", ["compose", "up", "-d", "--wait", "mqtt"], {
      stdio: "pipe",
    });
  mqtt?.end(true);
  if (sessionId) await db.session.deleteMany({ where: { id: sessionId } });
  await db.$disconnect();
  await writeFile(
    ".local/phase3-results.json",
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
}
