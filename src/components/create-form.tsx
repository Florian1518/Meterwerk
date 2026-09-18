"use client";
import { useActionState } from "react";
import { createAction } from "@/app/actions";
import { Button } from "./ui/button";
export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { id: string; name: string }[];
  optional?: boolean;
  value?: string;
};
export function CreateForm({
  kind,
  tenantId,
  fields,
  title = "Eintrag anlegen",
  fixed = {},
  expanded = false,
}: {
  kind: string;
  tenantId?: string;
  fields: Field[];
  title?: string;
  fixed?: Record<string, string>;
  expanded?: boolean;
}) {
  const [state, action, pending] = useActionState(createAction, {});
  return (
    <details className="create-details" open={expanded || undefined}>
      <summary>＋ {title}</summary>
      <form action={action} className="create-form">
        <input type="hidden" name="kind" value={kind} />
        {tenantId && (
          <input type="hidden" name="tenantId" value={tenantId} />
        )}{" "}
        {Object.entries(fixed).map(([key, value]) => (
          <input type="hidden" key={key} name={key} value={value} />
        ))}
        <div className="form-grid">
          {fields.map((field) => (
            <label key={field.name}>
              {field.label}
              {field.options ? (
                <select
                  name={field.name}
                  required={!field.optional}
                  defaultValue={field.value ?? ""}
                >
                  <option value="" disabled>
                    Bitte auswählen
                  </option>
                  {field.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={field.name}
                  type={field.type ?? "text"}
                  defaultValue={field.value ?? ""}
                  required={!field.optional}
                  min={field.type === "number" ? "0" : undefined}
                  step={field.type === "number" ? "0.01" : undefined}
                  minLength={field.type === "password" ? 14 : undefined}
                  maxLength={field.type === "password" ? 128 : 160}
                  autoComplete={
                    field.type === "password" ? "new-password" : undefined
                  }
                />
              )}
            </label>
          ))}
        </div>
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="form-success">
            {state.success}
          </p>
        )}
        <Button disabled={pending}>
          {pending ? "Wird gespeichert …" : "Speichern"}
        </Button>
      </form>
    </details>
  );
}
