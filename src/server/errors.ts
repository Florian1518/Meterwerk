import { z } from "zod";
import { AccessError } from "./policy";
export function publicError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof AccessError)
    return { status: error.status, message: error.message };
  if (error instanceof z.ZodError)
    return {
      status: 400,
      message: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" "),
    };
  if (error instanceof SyntaxError)
    return { status: 400, message: "Ungültiges JSON." };
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "P2002")
    return {
      status: 409,
      message: "Eintrag existiert bereits (E-Mail, Seriennummer oder Kürzel).",
    };
  if (code === "P2003")
    return {
      status: 409,
      message:
        "Löschen nicht möglich: Es bestehen zugeordnete Einträge oder Messwerte. Entfernen Sie zuerst die abhängigen Einträge; Messhistorie bleibt geschützt.",
    };
  if (code === "P2025")
    return { status: 404, message: "Eintrag nicht gefunden." };
  return {
    status: 500,
    message:
      "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
  };
}
