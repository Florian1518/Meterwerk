"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export function DashboardControls({
  properties,
  tenantId,
  type,
  days,
  propertyId,
}: {
  properties: { id: string; name: string }[];
  tenantId: string;
  type: string;
  days: number;
  propertyId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  function update(key: string, value: string) {
    const next = new URLSearchParams(search);
    next.set(key, value);
    next.set("tenantId", tenantId);
    router.push(`${pathname}?${next.toString()}`);
  }
  return (
    <div className="dashboard-controls" aria-label="Dashboard-Filter">
      <label>
        Medium
        <select
          aria-label="Medium"
          value={type}
          onChange={(event) => update("type", event.target.value)}
        >
          <option value="ELECTRICITY">Strom</option>
          <option value="WATER">Wasser</option>
          <option value="GAS">Gas</option>
          <option value="HEAT">Wärme</option>
        </select>
      </label>
      <label>
        Zeitraum
        <select
          aria-label="Zeitraum"
          value={String(days)}
          onChange={(event) => update("days", event.target.value)}
        >
          <option value="7">7 Tage</option>
          <option value="30">30 Tage</option>
          <option value="90">90 Tage</option>
        </select>
      </label>
      <label>
        Liegenschaft
        <select
          aria-label="Liegenschaft"
          value={propertyId ?? "all"}
          onChange={(event) =>
            update(
              "propertyId",
              event.target.value === "all" ? "" : event.target.value,
            )
          }
        >
          <option value="all">Alle Liegenschaften</option>
          {properties.map((property) => (
            <option value={property.id} key={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
