import { StatusPage } from "@/components/status-page";
export default function ServiceUnavailable() {
  return (
    <StatusPage
      code="503"
      title="Dienst vorübergehend nicht verfügbar"
      message="Meterwerk führt gerade Wartungsarbeiten durch oder ist kurzzeitig nicht erreichbar."
    />
  );
}
