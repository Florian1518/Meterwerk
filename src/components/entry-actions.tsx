"use client";
import { useActionState, useRef, useState } from "react";
import { createAction } from "@/app/actions";
import { CreateForm, type Field } from "./create-form";
import { Button } from "./ui/button";
export function EntryActions({
  kind,
  tenantId,
  id,
  name,
  values,
  fields,
}: {
  kind: string;
  tenantId?: string;
  id: string;
  name: string;
  values: Record<string, string>;
  fields: Field[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"edit" | "delete">("edit");
  const [state, action, pending] = useActionState(createAction, {});
  const open = (value: "edit" | "delete") => {
    setMode(value);
    dialog.current?.showModal();
  };
  const editFields: Field[] = fields.map((f) => ({
    ...f,
    value: f.type === "password" ? "" : (values[f.name] ?? ""),
    optional: f.type === "password" || f.optional,
    label:
      f.type === "password"
        ? "Neues Passwort (optional, mind. 14 Zeichen)"
        : f.label,
  }));
  if (kind === "users" && !editFields.some((field) => field.name === "active"))
    editFields.push({
      name: "active",
      label: "Zugang",
      options: [
        { id: "true", name: "Aktiv" },
        { id: "false", name: "Deaktiviert" },
      ],
      value: values.active,
      optional: false,
    });
  return (
    <div className="entry-actions">
      {kind === "tenants" && (
        <a
          className="text-link"
          href={`/users?tenantId=${encodeURIComponent(id)}`}
        >
          Benutzer verwalten
        </a>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => open("edit")}
        aria-label={`${name} bearbeiten`}
      >
        Bearbeiten
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => open("delete")}
        aria-label={`${name} löschen`}
      >
        Löschen
      </Button>
      <dialog
        ref={dialog}
        className="edit-dialog"
        aria-label={`${name} ${mode === "edit" ? "bearbeiten" : "löschen"}`}
      >
        <div className="panel-heading">
          <h2>{name}</h2>
          <Button
            variant="ghost"
            onClick={() => dialog.current?.close()}
            aria-label="Dialog schließen"
          >
            ✕
          </Button>
        </div>
        {mode === "edit" ? (
          <CreateForm
            kind={kind}
            tenantId={tenantId}
            fields={editFields}
            fixed={{ id, operation: "update" }}
            title="Daten bearbeiten"
            expanded
          />
        ) : (
          <form action={action}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="operation" value="delete" />
            <input type="hidden" name="id" value={id} />
            {tenantId && (
              <input type="hidden" name="tenantId" value={tenantId} />
            )}
            <p>
              Eintrag dauerhaft löschen? Zugeordnete Unterobjekte und
              Messhistorie verhindern das Löschen. Es werden keine abhängigen
              Daten automatisch entfernt.
            </p>
            <label className="delete-confirm">
              <input
                type="checkbox"
                name="confirmation"
                value="DELETE"
                required
              />{" "}
              Ich bestätige das Löschen von „{name}“.
            </label>
            {state.error && (
              <p role="alert" className="form-error">
                {state.error}
              </p>
            )}
            <div className="dialog-buttons">
              <Button
                variant="outline"
                type="button"
                onClick={() => dialog.current?.close()}
              >
                Abbrechen
              </Button>
              <Button disabled={pending}>
                {pending ? "Wird gelöscht …" : "Endgültig löschen"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
