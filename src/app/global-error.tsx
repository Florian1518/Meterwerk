"use client";
import { StatusPage } from "@/components/status-page";
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body>
        <StatusPage
          code="500"
          title="Unerwarteter Fehler"
          message="Die Ansicht konnte nicht geladen werden. Ihre Daten bleiben geschützt."
          retry={reset}
        />
      </body>
    </html>
  );
}
