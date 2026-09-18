"use client";
import { useActionState } from "react";
import { createAction } from "@/app/actions";
import { Button } from "./ui/button";
type Grant = {
  userId: string;
  userName: string;
  propertyId: string;
  propertyName: string;
};
function GrantRow({ tenantId, grant }: { tenantId: string; grant: Grant }) {
  const [state, action, pending] = useActionState(createAction, {});
  return (
    <form action={action} className="grant-row">
      <span>
        {grant.userName} · {grant.propertyName}
      </span>
      <input type="hidden" name="kind" value="grant" />
      <input type="hidden" name="operation" value="delete" />
      <input type="hidden" name="confirmation" value="DELETE" />
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="userId" value={grant.userId} />
      <input type="hidden" name="propertyId" value={grant.propertyId} />
      <Button variant="outline" size="sm" disabled={pending}>
        Freigabe entziehen
      </Button>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
export function GrantList({
  tenantId,
  grants,
}: {
  tenantId: string;
  grants: Grant[];
}) {
  return (
    <section className="panel">
      <h2>Bestehende Liegenschaftsfreigaben</h2>
      {grants.length ? (
        grants.map((g) => (
          <GrantRow
            key={`${g.userId}-${g.propertyId}`}
            tenantId={tenantId}
            grant={g}
          />
        ))
      ) : (
        <p>Keine Freigaben vorhanden. USER sehen ohne Freigabe keine Daten.</p>
      )}
    </section>
  );
}
