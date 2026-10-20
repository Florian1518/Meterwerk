import "server-only";
import { createPublicKey } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@/generated/prisma/client";
import {
  modbusConfigSchema,
  profileSchema,
  profiles,
} from "@/lib/modbus/contracts";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, requirePlatform, tenantScope } from "./policy";

export const readinessMessages = {
  TENANT_MISSING: "Kunde fehlt.",
  PROPERTY_MISSING: "Direkte Liegenschaft fehlt.",
  MASTER_DATA_INVALID: "Gateway-Stammdaten sind unvollständig.",
  NOT_PROVISIONING: "Gateway muss in Provisionierung sein.",
  PROVISIONING_NOT_STARTED: "Beginn der Provisionierung fehlt.",
  SIGNATURE_CREDENTIAL_MISSING: "Gültiges aktives Signatur-Credential fehlt.",
  PUBLIC_KEY_INVALID: "Gültige Ed25519-Public-Key-Identität fehlt.",
  COMMUNICATION_IDENTITY_MISSING: "Gültige Kommunikationsidentität fehlt.",
  EXTERNAL_ENABLEMENT_MISSING:
    "Externe Broker-Freischaltung ist nicht bestätigt.",
  REVOCATION_PENDING: "Ein externer Widerruf ist noch nicht bestätigt.",
  CURRENT_CONTACT_MISSING:
    "Akzeptierter Kontakt nach Beginn dieses Provisionierungsversuchs fehlt.",
  INSTALLATION_UNCONFIRMED: "Installation vor Ort ist nicht bestätigt.",
  DEVICE_MISSING: "Mindestens ein geeignetes Gerät muss zugeordnet sein.",
  PROPERTY_INCONSISTENT:
    "Geräte und Gateway gehören nicht derselben Liegenschaft an.",
  DEVICE_NOT_READY: "Ein zugeordnetes Gerät ist nicht betriebsbereit.",
  MODBUS_CONFIGURATION_MISSING: "Gültige Modbus-Konfiguration fehlt.",
  MODBUS_PROFILE_UNVERIFIED: "Verifiziertes Modbus-Profil fehlt.",
  MODBUS_REVIEW_MISSING:
    "Messungsbestätigung der aktuellen Konfiguration fehlt.",
  MODBUS_UNIT_UNCONFIRMED: "Nutzungseinheit ist nicht bestätigt.",
  MODBUS_INCOMPLETE: "Modbus-Inbetriebnahme ist nicht abgeschlossen.",
  COMMISSIONING_COMMAND_UNRESOLVED:
    "Offener oder fehlgeschlagener Inbetriebnahmeauftrag ist ungeklärt.",
} as const;
export type ReadinessCode = keyof typeof readinessMessages;

// Internal transaction query. Public callers authenticate below; activation
// calls this inside its serializable mutation after acquiring hierarchy locks.
export async function gatewayReadinessInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  gatewayId: string,
) {
  const gateway = await tx.gateway.findFirst({
    where: { id: gatewayId, tenantId },
    include: {
      tenant: { select: { id: true } },
      property: { select: { id: true, tenantId: true } },
      credentials: true,
      communicationIdentities: true,
      devices: {
        include: {
          meter: { include: { unit: { include: { building: true } } } },
          modbusConfig: true,
        },
      },
    },
  });
  if (!gateway) throw new AccessError(404, "Gateway nicht gefunden.");
  const now = new Date();
  const codes = new Set<ReadinessCode>();
  const block = (condition: boolean, code: ReadinessCode) => {
    if (condition) codes.add(code);
  };
  block(!gateway.tenant, "TENANT_MISSING");
  block(!gateway.property, "PROPERTY_MISSING");
  block(
    !gateway.name.trim() ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(gateway.externalGatewayId) ||
      !gateway.manufacturer.trim() ||
      !gateway.model.trim(),
    "MASTER_DATA_INVALID",
  );
  block(gateway.lifecycleStatus !== "PROVISIONING", "NOT_PROVISIONING");
  block(!gateway.provisioningStartedAt, "PROVISIONING_NOT_STARTED");
  const active = gateway.credentials.filter(
    (c) =>
      c.status === "ACTIVE" &&
      !c.revokedAt &&
      (!c.expiresAt || c.expiresAt > now),
  );
  block(!active.length, "SIGNATURE_CREDENTIAL_MISSING");
  block(
    !active.some((c) => {
      try {
        return (
          c.publicKey.startsWith("-----BEGIN PUBLIC KEY-----") &&
          createPublicKey(c.publicKey).asymmetricKeyType === "ed25519"
        );
      } catch {
        return false;
      }
    }),
    "PUBLIC_KEY_INVALID",
  );
  const identities = gateway.communicationIdentities;
  const valid = identities.filter(
    (i) =>
      i.notBefore <= now &&
      i.expiresAt > now &&
      !i.revocationRequestedAt &&
      !i.revocationConfirmedAt &&
      i.commonName === gateway.id,
  );
  block(!valid.length, "COMMUNICATION_IDENTITY_MISSING");
  block(
    !valid.some((i) => i.enabledConfirmedAt !== null),
    "EXTERNAL_ENABLEMENT_MISSING",
  );
  block(
    identities.some(
      (i) => !!i.revocationRequestedAt && !i.revocationConfirmedAt,
    ),
    "REVOCATION_PENDING",
  );
  const contact = gateway.provisioningStartedAt
    ? await tx.auditEvent.findFirst({
        where: {
          tenantId,
          entityId: gatewayId,
          actorId: gatewayId,
          action: "gateway.heartbeat",
          createdAt: { gt: gateway.provisioningStartedAt },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    : null;
  block(!gateway.firstContactAt || !contact, "CURRENT_CONTACT_MISSING");
  const installation = gateway.installedAt
    ? await tx.auditEvent.findFirst({
        where: {
          tenantId,
          entityId: gatewayId,
          action: "gateway.installation.confirm",
          createdAt: gateway.installedAt,
        },
        select: { id: true },
      })
    : null;
  block(!installation, "INSTALLATION_UNCONFIRMED");
  block(
    !gateway.devices.some(
      (d) =>
        !["FAILED", "DECOMMISSIONED"].includes(d.lifecycleStatus) &&
        d.status !== "DISABLED",
    ),
    "DEVICE_MISSING",
  );
  for (const d of gateway.devices) {
    block(
      d.meter.unit.building.propertyId !== gateway.propertyId,
      "PROPERTY_INCONSISTENT",
    );
    block(
      ["FAILED", "DECOMMISSIONED"].includes(d.lifecycleStatus) ||
        d.status === "DISABLED",
      "DEVICE_NOT_READY",
    );
    if (d.protocol !== "MODBUS") {
      block(d.lifecycleStatus !== "ACTIVE", "DEVICE_NOT_READY");
      continue;
    }
    const c = d.modbusConfig;
    const config = modbusConfigSchema.safeParse(c?.configuration);
    const profile = profileSchema.safeParse(c?.profile);
    block(!config.success, "MODBUS_CONFIGURATION_MISSING");
    block(
      !profile.success ||
        !profile.data.verified ||
        !config.success ||
        profile.data.id !== config.data.profileId ||
        !profiles.some(
          (p) =>
            p.id === profile.data.id &&
            p.verified &&
            isDeepStrictEqual(p, profile.data),
        ),
      "MODBUS_PROFILE_UNVERIFIED",
    );
    block(!c || c.reviewedRevision !== c.revision, "MODBUS_REVIEW_MISSING");
    block(
      !c ||
        c.confirmedUnitId !== d.meter.unitId ||
        d.meter.measurementUnit !== "kWh",
      "MODBUS_UNIT_UNCONFIRMED",
    );
    block(!c?.completedAt || c.state !== "ACTIVE", "MODBUS_INCOMPLETE");
    const unresolved = await tx.gatewayCommand.count({
      where: {
        tenantId,
        gatewayId,
        deviceId: d.id,
        revision: c?.revision,
        action: { in: ["TEST", "READ", "START", "STOP", "CONFIGURE"] },
        status: { notIn: ["SUCCEEDED", "CANCELLED"] },
      },
    });
    block(unresolved > 0, "COMMISSIONING_COMMAND_UNRESOLVED");
  }
  const steps = [
    [
      "Liegenschaft zugeordnet",
      ["TENANT_MISSING", "PROPERTY_MISSING", "PROPERTY_INCONSISTENT"],
    ],
    [
      "Provisionierung gestartet",
      ["PROVISIONING_NOT_STARTED", "MASTER_DATA_INVALID"],
    ],
    [
      "Signaturidentität registriert",
      ["SIGNATURE_CREDENTIAL_MISSING", "PUBLIC_KEY_INVALID"],
    ],
    ["Kommunikationsidentität registriert", ["COMMUNICATION_IDENTITY_MISSING"]],
    [
      "Externe Kommunikationsfreischaltung bestätigt",
      ["EXTERNAL_ENABLEMENT_MISSING", "REVOCATION_PENDING"],
    ],
    [
      "Erster Kontakt empfangen; Kontakt im aktuellen Versuch nachgewiesen",
      ["CURRENT_CONTACT_MISSING"],
    ],
    ["Installation bestätigt", ["INSTALLATION_UNCONFIRMED"]],
    ["Geräte zugeordnet", ["DEVICE_MISSING"]],
    [
      "Geräte-/Modbus-Inbetriebnahme abgeschlossen",
      [
        "DEVICE_NOT_READY",
        "MODBUS_CONFIGURATION_MISSING",
        "MODBUS_PROFILE_UNVERIFIED",
        "MODBUS_REVIEW_MISSING",
        "MODBUS_UNIT_UNCONFIRMED",
        "MODBUS_INCOMPLETE",
        "COMMISSIONING_COMMAND_UNRESOLVED",
      ],
    ],
  ] as const;
  return {
    ready: codes.size === 0,
    blockers: [...codes].map((code) => ({
      code,
      message: readinessMessages[code],
    })),
    steps: steps.map(([label, blockers]) => ({
      label,
      status: blockers.some((code) => codes.has(code))
        ? ("BLOCKED" as const)
        : ("FULFILLED" as const),
    })),
    currentContactAt: contact?.createdAt ?? null,
  };
}

export async function getGatewayProvisioningReadiness(
  gatewayId: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const tenantId = tenantScope(actor, requested);
  return db.$transaction(
    (tx) => gatewayReadinessInTransaction(tx, tenantId, gatewayId),
    { isolationLevel: "RepeatableRead" },
  );
}
