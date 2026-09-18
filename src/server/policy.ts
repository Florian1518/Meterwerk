export const roles = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "MANAGER",
  "USER",
] as const;
export type Role = (typeof roles)[number];
export type Actor = {
  id: string;
  tenantId: string | null;
  role: Role;
  name: string;
  email: string;
};
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function tenantScope(actor: Actor, requested?: string | null): string {
  if (actor.role === "SUPER_ADMIN") {
    if (!requested) throw new AccessError(400, "Bitte einen Kunden auswählen.");
    return requested;
  }
  if (!actor.tenantId || (requested && requested !== actor.tenantId))
    throw new AccessError(403, "Kein Zugriff auf diesen Mandanten.");
  return actor.tenantId;
}
export function requireManage(actor: Actor) {
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role))
    throw new AccessError(403, "Keine Verwaltungsberechtigung.");
}
export function requirePlatform(actor: Actor) {
  if (actor.role !== "SUPER_ADMIN")
    throw new AccessError(403, "Nur für Plattformadministratoren.");
}
export function propertyScope(actor: Actor, tenantId: string) {
  return {
    tenantId,
    ...(actor.role === "USER"
      ? { grants: { some: { userId: actor.id, tenantId } } }
      : {}),
  };
}
