import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";

const output = process.env.SYNTHETIC_RECEIVER_LOG;
const readyFile = process.env.SYNTHETIC_RECEIVER_READY_FILE;
if (!output || !readyFile)
  throw new Error("SYNTHETIC_RECEIVER_CONFIGURATION_REQUIRED");
mkdirSync(dirname(output), { recursive: true });

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/alerts") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 8192) request.destroy();
  });
  request.on("end", () => {
    try {
      const payload = JSON.parse(body);
      if (
        payload.environment !== "synthetic" ||
        typeof payload.timestamp !== "string" ||
        typeof payload.classification !== "string" ||
        typeof payload.context !== "string" ||
        typeof payload.correlationId !== "string" ||
        Object.keys(payload).some((key) =>
          [
            "secret",
            "token",
            "password",
            "credential",
            "customer",
            "tenantid",
          ].includes(key.toLowerCase()),
        )
      ) {
        response.writeHead(400).end();
        return;
      }
      const receivedAt = new Date().toISOString();
      appendFileSync(
        output,
        `${JSON.stringify({ ...payload, receivedAt })}\n`,
        { mode: 0o600 },
      );
      response.writeHead(202, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          accepted: true,
          correlationId: payload.correlationId,
          receivedAt,
          receiverId: "synthetic-receiver",
        }),
      );
    } catch {
      response.writeHead(400).end();
    }
  });
});

server.listen(
  Number(process.env.SYNTHETIC_RECEIVER_PORT ?? 0),
  "127.0.0.1",
  () => {
    const address = server.address();
    writeFileSync(readyFile, `${address.port}\n`, { mode: 0o600 });
  },
);

process.on("SIGTERM", () => server.close(() => process.exit(0)));
