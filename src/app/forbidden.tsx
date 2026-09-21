import { StatusPage } from "@/components/status-page";
export default function Forbidden() {
  return (
    <StatusPage
      code="403"
      title="Kein Zugriff"
      message="Ihre Rolle oder Freigabe erlaubt diese Aktion nicht."
    />
  );
}
