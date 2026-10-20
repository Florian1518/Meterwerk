import { createServer } from "node:net";
import { expect, it } from "vitest";
import { findFreeTcpPort } from "./helpers/free-tcp-port";

it("allocates a dynamic port while the former fixed staging port is occupied", async () => {
  const server = createServer();
  let ownsLegacyPort = false;
  try {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(55449, "127.0.0.1", () => {
          server.removeListener("error", reject);
          ownsLegacyPort = true;
          resolve();
        });
      });
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
    }

    const port = await findFreeTcpPort();
    expect(port).toBeGreaterThan(0);
    expect(port).not.toBe(55449);
  } finally {
    if (ownsLegacyPort)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
});
