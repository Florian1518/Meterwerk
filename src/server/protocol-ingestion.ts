import "server-only";
import { AccessError } from "./policy";
import { authenticateDevice } from "./device-auth";
import { ingestUtility } from "./utility-ingestion";
import { normalizedProtocolReadingSchema, protocols } from "../lib/protocols";

/** Protocol adapters end here. The remainder is the same authenticated Phase-5a ingestion pipeline. */
export async function ingestProtocolReading(
  authorization: string | null,
  raw: unknown,
) {
  const auth = await authenticateDevice(authorization);
  const value = normalizedProtocolReadingSchema.parse(raw);
  if (
    value.deviceId !== auth.device.id ||
    value.tenantId !== auth.device.tenantId
  )
    throw new AccessError(
      403,
      "Gerät oder Mandant passt nicht zum Credential.",
    );
  if (
    value.protocol !== auth.device.protocol &&
    !(value.protocol === "MODBUS_TCP" && auth.device.protocol === "MODBUS")
  )
    throw new AccessError(
      409,
      "Protokoll passt nicht zum konfigurierten Gerät.",
    );
  if (!protocols.includes(value.protocol))
    throw new AccessError(400, "Unbekanntes Protokoll.");
  return ingestUtility(authorization, {
    messageId: value.messageId,
    timestamp: value.timestamp,
    measurements: value.measurements,
  });
}
