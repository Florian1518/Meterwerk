import { StatusPage } from "@/components/status-page";
export default function RateLimited() {
  return (
    <StatusPage
      code="429"
      title="Zu viele Anfragen"
      message="Bitte warten Sie einen Moment und versuchen Sie es erneut."
    />
  );
}
