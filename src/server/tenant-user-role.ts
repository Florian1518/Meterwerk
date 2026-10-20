import { z } from "zod";

export const tenantManagedUserRoleSchema = z.enum([
  "TENANT_ADMIN",
  "MANAGER",
  "USER",
]);

export type TenantManagedUserRole = z.infer<typeof tenantManagedUserRoleSchema>;
