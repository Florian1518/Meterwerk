import { requirePageActor } from "@/server/auth";
import { getSupportCase } from "@/server/support-operations";
import { tenantScope } from "@/server/policy";
export default async function SupportCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const actor = await requirePageActor();
  const q = await searchParams;
  const tenantId = tenantScope(actor, q.tenantId);
  const c = await getSupportCase((await params).id, tenantId);
  return (
    <>
      <h1>{c.title}</h1>
      <p>
        {c.category} · {c.priority} · {c.status}
      </p>
      <section className="panel">
        <p>{c.description}</p>
        <h2>Timeline</h2>
        {c.timeline.map((e) => (
          <p key={e.id}>
            <strong>{e.kind}</strong> · {e.createdAt.toISOString()} · {e.body}
          </p>
        ))}
      </section>
    </>
  );
}
