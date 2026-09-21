import "server-only";
import { securityConfig } from "./security-config";
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  template: "INVITATION" | "PASSWORD_RESET" | "ALARM" | "REPORT" | "SYSTEM";
};
const localOutbox: MailMessage[] = [];
export async function sendMail(message: MailMessage) {
  if (securityConfig.EMAIL_PROVIDER === "local") {
    localOutbox.push(message);
    return { accepted: true, provider: "local" as const };
  }
  // SMTP/API delivery is intentionally provider-neutral; deployment supplies the adapter.
  return { accepted: false, provider: securityConfig.EMAIL_PROVIDER };
}
export function localMails() {
  return [...localOutbox];
}
