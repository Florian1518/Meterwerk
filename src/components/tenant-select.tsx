"use client";
import { Button } from "./ui/button";
import { useSearchParams } from "next/navigation";
export function TenantSelect({
  tenants,
  tenantId,
}: {
  tenants: { id: string; name: string }[];
  tenantId: string;
}) {
  const params = useSearchParams();
  if (!tenants.length) return null;
  return (
    <form className="tenant-select">
      {params.get("type") && (
        <input type="hidden" name="type" value={params.get("type")!} />
      )}
      <label className="sr-only" htmlFor="tenantId">
        Kunde auswählen
      </label>
      <select name="tenantId" id="tenantId" defaultValue={tenantId}>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button variant="outline" size="sm">
        Wechseln
      </Button>
    </form>
  );
}
