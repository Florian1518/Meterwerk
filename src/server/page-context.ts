import "server-only";
import { db } from "./db";
import { requirePageActor } from "./auth";
import { tenantScope, AccessError } from "./policy";
import { notFound, redirect } from "next/navigation";
export async function pageContext(requested?: string) {
  const actor = await requirePageActor();
  const tenants =
    actor.role === "SUPER_ADMIN"
      ? await db.tenant.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 200,
        })
      : [];
  if (actor.role === "SUPER_ADMIN" && !requested && !tenants.length)
    redirect("/tenants");
  let tenantId: string;
  try {
    tenantId = tenantScope(
      actor,
      requested ?? (actor.role === "SUPER_ADMIN" ? tenants[0]?.id : undefined),
    );
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();
  return { actor, tenantId, tenant, tenants };
}
