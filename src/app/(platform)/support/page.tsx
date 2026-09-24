import Link from "next/link";
import { requirePageActor } from "@/server/auth";
import { listSupportCases } from "@/server/support-operations";
import { tenantScope } from "@/server/policy";
import { SupportCaseForm } from "@/components/support-case-form";
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePageActor();
  const q = await searchParams;
  const tenantId = tenantScope(actor, q.tenantId);
  const result = await listSupportCases(q, tenantId);
  return (
    <>
      <h1>Supportfälle</h1>
      <SupportCaseForm tenantId={tenantId} />
      <form className="panel grid gap-3 md:grid-cols-4" method="get">
        <input name="tenantId" type="hidden" value={tenantId} />
        <label>
          Suche
          <input name="q" defaultValue={q.q} />
        </label>
        <label>
          Status
          <input name="status" defaultValue={q.status} />
        </label>
        <label>
          Priorität
          <input name="priority" defaultValue={q.priority} />
        </label>
        <button type="submit">Filtern</button>
      </form>
      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Fall</th>
              <th>Kategorie</th>
              <th>Priorität</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link
                    className="text-link"
                    href={"/support/" + c.id + "?tenantId=" + tenantId}
                  >
                    {c.title}
                  </Link>
                </td>
                <td>{c.category}</td>
                <td>{c.priority}</td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result.items.length && <p>Keine Supportfälle.</p>}
      </div>
    </>
  );
}
