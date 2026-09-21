import { StatusPage } from "@/components/status-page";
export default function Unauthorized() {
  return (
    <StatusPage
      code="401"
      title="Anmeldung erforderlich"
      message="Bitte melden Sie sich an, um diesen Bereich zu öffnen."
    />
  );
}
