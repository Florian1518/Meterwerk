import { createServer } from "node:net";

export async function reserveFreeTcpPort(): Promise<{
  port: number;
  release: () => Promise<void>;
}> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    throw new Error("Could not allocate a local TCP port for the test.");
  }
  const { port } = address;
  let released = false;
  return {
    port,
    release: async () => {
      if (released) return;
      released = true;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

export async function findFreeTcpPort(): Promise<number> {
  const reservation = await reserveFreeTcpPort();
  await reservation.release();
  return reservation.port;
}
