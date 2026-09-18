"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Ansicht nicht verfügbar</h1>
      <p>
        Bitte Berechtigungen und Datenbankverbindung prüfen. Bei
        Plattformzugriff muss ein gültiger Kunde ausgewählt sein.
      </p>
      <Button onClick={reset}>Erneut versuchen</Button>
    </section>
  );
}
