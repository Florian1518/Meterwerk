import { expect, it } from "vitest";
import { tenantManagedUserRoleSchema } from "@/server/tenant-user-role";

it.each(["TENANT_ADMIN", "MANAGER", "USER"] as const)(
  "allows tenant-managed role %s",
  (role) => {
    expect(tenantManagedUserRoleSchema.parse(role)).toBe(role);
  },
);

it("rejects SUPER_ADMIN for every tenant-managed user path", () => {
  expect(tenantManagedUserRoleSchema.safeParse("SUPER_ADMIN").success).toBe(
    false,
  );
});
