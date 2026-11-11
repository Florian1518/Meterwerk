import { readFileSync } from "node:fs";
import { recordAcknowledgement } from "./wal-watchdog.mjs";

const [auditPath, incidentId, actor] = process.argv.slice(2);
if (!auditPath || !incidentId || !actor) {
  console.error(
    "Usage: node scripts/wal-alert-ack.mjs <audit.jsonl> <incident-id> <operator-id>",
  );
  process.exitCode = 2;
} else {
  const records = readFileSync(auditPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (
    !records.some(
      (record) =>
        record.type === "ALERT" && record.correlationId === incidentId,
    )
  ) {
    console.error("INCIDENT_NOT_IN_AUDIT_HISTORY");
    process.exitCode = 1;
  } else {
    const acknowledgement = recordAcknowledgement(auditPath, {
      incidentId,
      actor,
      timestamp: new Date().toISOString(),
    });
    console.log(JSON.stringify(acknowledgement));
  }
}
