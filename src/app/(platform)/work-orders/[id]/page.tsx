import { FieldDocumentation } from "@/components/field-documentation";
import { AddendumForm } from "@/components/field-service-addendum";
import { listChecklistTemplates } from "@/server/field-documentation";
import Link from "next/link";
import { FieldServiceHistory } from "@/components/field-service-history";
import { notFound } from "next/navigation";
import { pageContext } from "@/server/page-context";
import { fieldServiceOptions, getWorkOrder } from "@/server/field-service";
import { AccessError } from "@/server/policy";
import {
  canManageWorkOrders,
  priorityLabels,
  statusLabels,
  terminal,
  transitions,
  typeLabels,
} from "@/lib/field-service";
import {
  ChecklistEditor,
  FieldServiceForm,
  WorkOrderEditor,
} from "@/components/field-service-controls";

export const metadata = { title: "Einsatzdetail · Meterwerk" };
const time = (date: Date | null) =>
  date ? `${date.toISOString().slice(0, 19).replace("T", " ")} UTC` : "–";
const actions = {
  PLANNED: "Planen",
  ASSIGNED: "Zuweisung bestätigen",
  IN_PROGRESS: "Start / Fortsetzen",
  PAUSED: "Pausieren",
  COMPLETED: "Abschließen",
  CANCELED: "Einsatz abbrechen",
  DRAFT: "Entwurf",
};
const historyLabels: Record<string, string> = {
  created: "Auftrag erstellt",
  updated: "Auftrag bearbeitet",
  scheduled: "Termin geändert",
  "technician-assigned": "Techniker zugewiesen",
  "technician-removed": "Techniker entfernt",
  "status-changed": "Status geändert",
  completed: "Auftrag abgeschlossen",
  canceled: "Auftrag abgebrochen",
  "checklist-created": "Checkliste angelegt",
  "checklist-item-updated": "Checklistenpunkt geändert",
  "comment-added": "Kommentar hinzugefügt",
  deleted: "Entwurf gelöscht",
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const context = await pageContext((await searchParams).tenantId);
  const { id } = await params;
  const order = await getWorkOrder(id, context.tenantId).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  const manager = canManageWorkOrders(context.actor.role);
  const editable =
    context.actor.role !== "SUPER_ADMIN" && !terminal(order.status);
  const options =
    manager && editable ? await fieldServiceOptions(context.tenantId) : null;
  const templates = manager
    ? await listChecklistTemplates(context.tenantId)
    : [];
  const formProps = { id, tenantId: context.tenantId };
  const query = `tenantId=${encodeURIComponent(context.tenantId)}`;
  const next = transitions[order.status].filter(
    (status) =>
      manager || ["IN_PROGRESS", "PAUSED", "COMPLETED"].includes(status),
  );
  const openRequired = order.checklists
    .flatMap((list) => list.items)
    .filter((item) => item.required && !item.completed).length;
  return (
    <div className="field-service grid gap-6">
      <Link
        href={`/${manager || context.actor.role === "SUPER_ADMIN" ? "work-orders" : "technician"}?${query}`}
        className="underline"
      >
        Zur Einsatzübersicht
      </Link>
      <header>
        <p className="break-all text-sm">{order.number}</p>
        <h1>{order.title}</h1>
        <p>
          {typeLabels[order.type]} · {priorityLabels[order.priority]} ·{" "}
          {statusLabels[order.status]}
        </p>
      </header>
      <section
        aria-label="Einsatzdaten"
        className="grid gap-3 rounded-xl border p-5"
      >
        <p>
          {order.property.name} · {order.property.address},{" "}
          {order.property.city}
        </p>
        <p>
          Gebäude: {order.building?.name ?? "–"} · Einheit:{" "}
          {order.unit?.name ?? "–"}
        </p>
        <p>
          Zähler: {order.meter?.serialNumber ?? "–"} · Gateway:{" "}
          {order.gateway?.name ?? "–"}
        </p>
        <p>Termin: {time(order.scheduledAt)}</p>
        <p>
          Beginn: {time(order.startedAt)} · Ende: {time(order.endedAt)}
        </p>
        <p className="whitespace-pre-wrap">
          {order.description || "Keine Beschreibung."}
        </p>
        <p>Interner Ansprechpartner: {order.internalContact?.name ?? "–"}</p>
        <p className="whitespace-pre-wrap">
          Kundenkontakt: {order.customerContact || "–"}
        </p>
        <p className="whitespace-pre-wrap">Notizen: {order.notes || "–"}</p>
      </section>
      {editable && (
        <section aria-label="Status ändern" className="grid gap-3">
          <h2>Status ändern</h2>
          <p>
            {openRequired} offene Pflichtpunkte. Änderungen benötigen eine
            Online-Verbindung.
          </p>
          <div className="flex flex-wrap gap-3">
            {next.map((status) => (
              <FieldServiceForm
                key={status}
                {...formProps}
                operation="status"
                target={status}
                label={
                  status === "IN_PROGRESS"
                    ? order.status === "PAUSED"
                      ? "Fortsetzen"
                      : "Starten"
                    : actions[status]
                }
              />
            ))}
          </div>
        </section>
      )}
      {options && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-semibold">
            Auftrag und Termin bearbeiten
          </summary>
          <div className="mt-4">
            <WorkOrderEditor
              tenantId={context.tenantId}
              options={options}
              initial={{
                id: order.id,
                title: order.title,
                type: order.type,
                priority: order.priority,
                propertyId: order.propertyId,
                buildingId: order.buildingId,
                unitId: order.unitId,
                meterId: order.meterId,
                gatewayId: order.gatewayId,
                internalContactId: order.internalContactId,
                scheduledAt: order.scheduledAt,
                description: order.description,
                customerContact: order.customerContact,
                notes: order.notes,
              }}
            />
          </div>
        </details>
      )}
      <section className="grid gap-3">
        <h2>Zugewiesene Techniker</h2>
        {!order.assignments.length && <p>Noch keine Techniker zugewiesen.</p>}
        <ul className="grid gap-3">
          {order.assignments.map((assignment) => (
            <li
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span>{assignment.user.name}</span>
              {options && (
                <FieldServiceForm
                  {...formProps}
                  operation="remove-assignment"
                  target={assignment.userId}
                  label="Zuweisung entfernen"
                />
              )}
            </li>
          ))}
        </ul>
        {options && (
          <FieldServiceForm
            {...formProps}
            operation="assignment"
            label="Techniker zuweisen"
          >
            <label>
              Techniker mit Liegenschaftsfreigabe
              <select name="userId" required>
                <option value="">Bitte wählen</option>
                {options.users
                  .filter(
                    (user) =>
                      user.role === "USER" &&
                      user.grants.some(
                        (grant) => grant.propertyId === order.propertyId,
                      ) &&
                      !order.assignments.some((a) => a.userId === user.id),
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="text-sm">
              Freigaben werden in der bestehenden Benutzerverwaltung vergeben.
            </p>
          </FieldServiceForm>
        )}
      </section>
      <section className="grid gap-4">
        <h2>Checklisten</h2>
        {!order.checklists.length && <p>Noch keine Checklisten vorhanden.</p>}
        {order.checklists.map((list) => (
          <section key={list.id} className="grid gap-3 rounded-xl border p-4">
            <h3>{list.title}</h3>
            {list.items.map((item) => (
              <div
                key={`${item.id}-${item.updatedAt.toISOString()}`}
                className="grid gap-2 rounded-lg border p-3"
              >
                <h4>
                  {item.order + 1}. {item.title}{" "}
                  {item.required ? "(Pflichtpunkt)" : "(optional)"}
                </h4>
                <p className="whitespace-pre-wrap">{item.description}</p>
                <p>
                  {item.completed
                    ? `Erledigt von ${item.completedBy?.name ?? "–"} · ${time(item.completedAt)}`
                    : "Offen"}
                </p>
                {editable && order.status === "IN_PROGRESS" ? (
                  <FieldServiceForm
                    {...formProps}
                    operation="item"
                    target={item.id}
                    label="Checklistenpunkt speichern"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="completed"
                        defaultChecked={item.completed}
                      />
                      Erledigt
                    </label>
                    <label>
                      Kommentar
                      <textarea
                        name="comment"
                        maxLength={2000}
                        defaultValue={item.comment}
                      />
                    </label>
                  </FieldServiceForm>
                ) : (
                  <p className="whitespace-pre-wrap">{item.comment}</p>
                )}
              </div>
            ))}
          </section>
        ))}
        {options && (
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer">Checkliste hinzufügen</summary>
            <div className="mt-4">
              <ChecklistEditor {...formProps} />
            </div>
          </details>
        )}
      </section>
      <FieldDocumentation
        id={id}
        tenantId={context.tenantId}
        revision={order.revision}
        type={order.type}
        editable={editable}
        actorId={context.actor.id}
        documentation={order.documentation as Record<string, unknown> | null}
        commissioning={order.commissioning as Record<string, unknown> | null}
        entries={order.entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          payload: e.payload as Record<string, unknown>,
          createdAt: e.createdAt.toISOString(),
          actor: e.actor,
        }))}
        technicians={order.assignments.map((a) => a.user)}
        attachments={order.attachments}
        templates={templates}
      />
      {order.replacement && (
        <section className="grid gap-2">
          <h2>Zählerwechselprotokoll</h2>
          <p>
            Alt: {order.replacement.oldMeter.serialNumber} · Ausbau{" "}
            {time(order.replacement.removedAt)} ·{" "}
            {order.replacement.removedRegister.toString()}{" "}
            {order.replacement.oldMeter.measurementUnit}
          </p>
          <p>
            Neu: {order.replacement.newMeter.serialNumber} · Einbau{" "}
            {time(order.replacement.installedAt)} ·{" "}
            {order.replacement.installedRegister.toString()}{" "}
            {order.replacement.oldMeter.measurementUnit}
          </p>
          <p>
            Medium: {order.replacement.oldMeter.type} ·{" "}
            {order.replacement.reason}
          </p>
          <FieldServiceHistory value={order.replacementDetails} />
        </section>
      )}
      <section className="grid gap-3">
        <h2>Nachträge / Zusatzarbeiten</h2>
        {order.addenda.map((addendum) => (
          <article key={addendum.id} className="rounded border p-3">
            <strong>{addendum.title}</strong>
            <p>{addendum.description}</p>
            <p>
              {addendum.reason} · {addendum.status} ·{" "}
              {addendum.estimatedMinutes ?? "-"} Minuten
            </p>
          </article>
        ))}
        {editable && (
          <AddendumForm workOrderId={id} tenantId={context.tenantId} />
        )}
      </section>
      {terminal(order.status) && (
        <p>
          <a
            className="underline"
            href={`/api/work-orders/${encodeURIComponent(id)}/report?tenantId=${encodeURIComponent(context.tenantId)}`}
          >
            Einsatzbericht als PDF herunterladen
          </a>
        </p>
      )}
      <section className="grid gap-3">
        <h2>Kommentare</h2>
        {!order.comments.length && <p>Noch keine Kommentare.</p>}
        <ul className="grid gap-3">
          {order.comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border p-3">
              <p>
                {comment.author.name} · {time(comment.createdAt)}
              </p>
              <p className="whitespace-pre-wrap break-words">{comment.body}</p>
            </li>
          ))}
        </ul>
        {editable && (
          <FieldServiceForm
            {...formProps}
            operation="comment"
            label="Kommentar hinzufügen"
          >
            <label>
              Kommentar
              <textarea name="body" required maxLength={4000} />
            </label>
          </FieldServiceForm>
        )}
      </section>
      <section className="grid gap-3">
        <h2>Verlauf</h2>
        <ol className="grid gap-3">
          {order.history.map((event) => (
            <li key={event.id} className="rounded-lg border p-3">
              <p>
                {time(event.createdAt)} ·{" "}
                {historyLabels[event.action.replace("work-order.", "")] ??
                  event.action}
              </p>
              <details>
                <summary>Änderungsdetails</summary>
                <FieldServiceHistory value={event.details} />
              </details>
            </li>
          ))}
        </ol>
      </section>
      {manager && order.status === "DRAFT" && (
        <FieldServiceForm
          {...formProps}
          operation="delete"
          label="Entwurf löschen"
          redirectAfter={`/work-orders?${query}`}
        />
      )}
    </div>
  );
}
