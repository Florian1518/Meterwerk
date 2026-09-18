import { describe, expect, it } from "vitest";
import {
  tenantScope,
  requireManage,
  requirePlatform,
  propertyScope,
  type Actor,
} from "../src/server/policy";
const actor: Actor = {
  id: "u",
  tenantId: "a",
  role: "TENANT_ADMIN",
  name: "A",
  email: "a@example.com",
};
describe("Mandanten- und Rollenprüfung", () => {
  it("leitet den Mandanten aus der Sitzung ab", () =>
    expect(tenantScope(actor)).toBe("a"));
  it.each(["TENANT_ADMIN", "MANAGER", "USER"] as const)(
    "verweigert fremde Mandanten für %s",
    (role) =>
      expect(() => tenantScope({ ...actor, role }, "b")).toThrow(
        "Kein Zugriff",
      ),
  );
  it("verweigert mandantenlose Kundenbenutzer", () =>
    expect(() => tenantScope({ ...actor, tenantId: null })).toThrow());
  it("verlangt expliziten Scope für Plattformadmins", () =>
    expect(() => tenantScope({ ...actor, role: "SUPER_ADMIN" })).toThrow());
  it("ermöglicht bewussten Plattformzugriff", () =>
    expect(tenantScope({ ...actor, role: "SUPER_ADMIN" }, "b")).toBe("b"));
  it.each(["USER", "MANAGER"] as const)(
    "verweigert Änderungen für %s",
    (role) => expect(() => requireManage({ ...actor, role })).toThrow(),
  );
  it("verweigert Kundenanlage für Tenant-Admins", () =>
    expect(() => requirePlatform(actor)).toThrow());
  it("begrenzt USER auf explizite Freigaben", () =>
    expect(propertyScope({ ...actor, role: "USER" }, "a")).toEqual({
      tenantId: "a",
      grants: { some: { userId: "u", tenantId: "a" } },
    }));
});
