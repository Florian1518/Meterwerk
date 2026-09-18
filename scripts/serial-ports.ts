import { listSerialPorts } from "../apps/edge-gateway/src/modbus-transport";

// Run on the gateway computer, not on the web server.
for (const port of await listSerialPorts()) console.log(port);
