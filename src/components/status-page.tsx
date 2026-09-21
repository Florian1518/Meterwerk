import Link from "next/link";
import { Button } from "./ui/button";
export function StatusPage({
  code,
  title,
  message,
  retry,
}: {
  code: string;
  title: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <main className="panel status-page">
      <div className="eyebrow">{code} · METERWERK</div>
      <h1>{title}</h1>
      <p>{message}</p>
      <div className="status-actions">
        {retry && <Button onClick={retry}>Erneut versuchen</Button>}
        <Link className="button-secondary" href="/dashboard">
          Zum Dashboard
        </Link>
      </div>
    </main>
  );
}
