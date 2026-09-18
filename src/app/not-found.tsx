import Link from "next/link";
export default function NotFound() {
  return (
    <main className="panel not-found">
      <div className="eyebrow">404 · NICHT VERFÜGBAR</div>
      <h1>Seite nicht gefunden</h1>
      <p>Der Eintrag existiert nicht oder ist für Sie nicht freigegeben.</p>
      <Link className="text-link" href="/dashboard">
        Zurück zum Dashboard →
      </Link>
    </main>
  );
}
