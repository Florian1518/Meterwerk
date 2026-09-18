import Link from "next/link";
import { requirePageActor } from "@/server/auth";
import { tenantScope, requireManage } from "@/server/policy";
import { listResource } from "@/server/data";
export default async function CommissioningPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const actor = await requirePageActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, (await searchParams).tenantId);
  const meters = await listResource(actor, "meters", tenantId);
  return (
    <>
      <h1>Modbus-Inbetriebnahme</h1>
      <p>
        Gateway, Zähler und Profil zuordnen, Verbindung testen und Messwerte
        bestätigen.
      </p>
      <Link className="text-link" href={`/meters?tenantId=${tenantId}`}>
        Neuen Zähler über die Zählerverwaltung anlegen
      </Link>
      <ul className="mt-5 space-y-3">
        {meters.map((m) => (
          <li key={m.id}>
            <Link
              className="text-link"
              href={`/meters/${m.id}/modbus?tenantId=${tenantId}`}
            >
              {"serialNumber" in m ? String(m.serialNumber) : m.id} · Diagnose /
              Inbetriebnahme
            </Link>
          </li>
        ))}
      </ul>
      {meters.length === 0 && <p>Noch keine Zähler vorhanden.</p>}
    </>
  );
}
