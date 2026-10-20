import "server-only";
import { z } from "zod";
import { requireActor } from "./auth";
import { requirePlatform, tenantScope } from "./policy";
import {
  assignGatewayProperty,
  changeGatewayLifecycle,
  confirmGatewayInstallation,
} from "./gateway-lifecycle";
import {
  registerGatewayPublicKey,
  manageGatewayCredential,
} from "./gateway-credentials";
import {
  registerGatewayCommunicationIdentity,
  confirmGatewayCommunicationIdentity,
} from "./gateway-communication-identity";

export async function mutateGatewayProvisioning(id: string, raw: unknown) {
  const actor = await requireActor();
  requirePlatform(actor);
  const value = z
    .object({
      tenantId: z.string().min(1),
      confirmed: z.literal(true),
      operation: z.enum([
        "LIFECYCLE",
        "PROPERTY",
        "INSTALLATION",
        "PUBLIC_KEY",
        "COMMUNICATION_REGISTER",
        "COMMUNICATION_CONFIRM",
        "REVOKE_SIGNATURE",
      ]),
      data: z.unknown(),
    })
    .strict()
    .parse(raw);
  const tenantId = tenantScope(actor, value.tenantId);
  switch (value.operation) {
    case "LIFECYCLE":
      return changeGatewayLifecycle(id, value.data, tenantId);
    case "PROPERTY":
      return assignGatewayProperty(id, value.data, tenantId);
    case "INSTALLATION":
      return confirmGatewayInstallation(id, value.data, tenantId);
    case "PUBLIC_KEY":
      return registerGatewayPublicKey(id, value.data, tenantId);
    case "COMMUNICATION_REGISTER":
      return registerGatewayCommunicationIdentity(id, value.data, tenantId);
    case "COMMUNICATION_CONFIRM":
      return confirmGatewayCommunicationIdentity(id, value.data, tenantId);
    case "REVOKE_SIGNATURE": {
      const data = z
        .object({ credentialId: z.string().min(1) })
        .strict()
        .parse(value.data);
      return manageGatewayCredential(
        id,
        { operation: "REVOKE", ...data },
        tenantId,
      );
    }
  }
}
