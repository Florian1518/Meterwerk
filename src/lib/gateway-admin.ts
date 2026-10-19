import { dateTime } from "./format";
export const technicalLabels: Record<string, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  WARNING: "Warnung",
  MAINTENANCE: "In Wartung",
  DISABLED: "Deaktiviert",
};
export const lifecycleLabels: Record<string, string> = {
  NEW: "Neu",
  PROVISIONING: "Provisionierung",
  ACTIVE: "Aktiv",
  OFFLINE: "Offline",
  MAINTENANCE: "In Wartung",
  DECOMMISSIONED: "Stillgelegt",
  FAILED: "Fehlgeschlagen",
};
export const healthLabels: Record<string, string> = {
  HEALTHY: "Unauffällig",
  WARNING: "Warnung",
  CRITICAL: "Kritisch",
  UNKNOWN: "Unbekannt",
};
export const complianceLabels: Record<string, string> = {
  COMPLIANT: "Konform",
  WARNING: "Warnung",
  NON_COMPLIANT: "Abweichung",
  UNKNOWN: "Unbekannt",
};
export const meterLabels: Record<string, string> = {
  ELECTRICITY: "Strom",
  WATER: "Wasser",
  GAS: "Gas",
  HEAT: "Wärme",
};
export const utcTime = (value: string | Date | null) =>
  value ? dateTime(value, "UTC") : "—";
export function credentialLabel(
  c: { status: string; expiresAt: Date | string | null },
  now = Date.now(),
) {
  if (c.status === "REVOKED") return "Widerrufen";
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now)
    return "Abgelaufen";
  return c.status === "ACTIVE" ? "Aktiv" : "Unbekannt";
}
