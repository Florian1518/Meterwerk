import "dotenv/config";
import { db } from "./db";
import { verifyPassword } from "./password";
import { readFile } from "node:fs/promises";
try {
  const gateway = await db.gateway.findUnique({
    where: { id: "demo-edge-gateway" },
    select: { id: true, status: true, lastSeenAt: true },
  });
  const device = await db.device.findUnique({
    where: { id: "demo-modbus-device" },
    select: {
      id: true,
      status: true,
      lastSeenAt: true,
      meter: { select: { serialNumber: true } },
    },
  });
  const account = await db.user.findUniqueOrThrow({
    where: { email: "verwaltung@nordstern.demo" },
    select: { passwordHash: true },
  });
  const loginValid = await verifyPassword(
    account.passwordHash,
    process.env.DEMO_PASSWORD ?? "",
  );
  const queue = JSON.parse(
    await readFile(".local/edge-queue.json", "utf8"),
  ) as unknown[];
  console.log(
    JSON.stringify(
      {
        gateway,
        device,
        queueSize: queue.length,
        readings: await db.reading.count({
          where: { deviceId: "demo-modbus-device", source: "MQTT" },
        }),
        loginValid,
      },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
