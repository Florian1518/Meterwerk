# Meterwerk SaaS-Pläne und Abrechnung

Meterwerk speichert SaaS-Abonnementdaten getrennt von Energiekosten. Energietarife und die aus Messwerten abgeleiteten Kosten gehören zum Metering-Domänenmodell. SaaS-Preise, Billing-Kontakte, externe Billing-IDs, Laufzeiten und Status gehören zu `Plan` und `Subscription`. Es gibt keine gemeinsamen Preisfelder, Berechnungen oder Fremdschlüssel zwischen beiden Bereichen.

## Pläne und Features

`BASIC`, `PROFESSIONAL` und `ENTERPRISE` sind versionierte Pläne. Sie tragen Limits für Liegenschaften, Gebäude, Nutzungseinheiten, Zähler, Devices, Gateways und Benutzer sowie Feature Flags für Reporting, Analytics, API, Webhooks und erweiterte Exporte. Unbegrenzte optionale Limits werden in `Plan` als `2147483647` geführt und im UI als unbegrenzt gezeigt. Enterprise kann mandantenspezifische Feature- und Limit-Overrides haben.

Servercode löst den aktiven Subscription-Status, Zeitraum, Plan und wirksame Overrides in `src/server/licensing.ts` auf. Erstellungswege prüfen Limits serverseitig atomar. Die UI ist keine Zugriffskontrolle. Ein Downgrade entfernt keine Objekte; Bestand bleibt lesbar und änderbar, während neue Anlage am Limit scheitert. API- und Export-Nutzung wird monatlich in UTC beobachtet; Reports erscheinen als Bestand. Diese Nutzungswerte lösen keine Zahlung oder Quote aus.

## Abonnement und Testphase

Die Status sind `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED` und `CANCELED`. Subscription hält Beginn, Ende, Trial-Ende sowie Monats-/Jahresintervall. Eine vom Super-Admin gestartete Testphase läuft zunächst 14 Tage und kann um bis zu 365 Tage verlängert werden. `PAST_DUE` behält den Zugriff bis zu einer expliziten Sperre oder einem Enddatum; `SUSPENDED` und abgelaufene Testphasen haben keinen fachlichen Zugriff. Ein Statuswechsel und eine Verlängerung werden als AuditEvent gespeichert.

Planpreise sind optionale Dezimalmetadaten (`monthlyPrice`, `yearlyPrice`, ISO-Währung); das Subscription-Preisfeld hält optional den vereinbarten Betrag als Dezimalstring-Snapshot. Es werden keine Preise aus Energietarifen übernommen und keine Abrechnung erstellt.

Billing-Kontakt, Rechnungsanschrift und externe Billing-ID sind optionale Vertragsmetadaten. Nur `SUPER_ADMIN` kann diese pflegen. `TENANT_ADMIN` sieht Planstatus, Nutzung, Limits und verfügbare Features des eigenen Tenants. Ein `SUPER_ADMIN` muss einen Tenant explizit auswählen.

## Provider-Abstraktion

`src/server/billing/provider.ts` definiert providerneutrale Verträge für Kundenabgleich, Checkout, Kündigung und normalisierte Ereignisse. Beträge fließen als Dezimalstrings mit Währung und Intervall. Die Anwendung enthält bewusst keine Stripe- oder andere Provider-Implementierung, keine Secrets, Webhook-Routen, Zahlungsversuche, Rechnungen oder echten Abbuchungen. Ein späterer Adapter kann diese Schnittstelle implementieren und Provider-IDs in `Subscription.externalBillingId` speichern.

Wenn ein Provider ergänzt wird, müssen Signaturprüfung, idempotente Ereignisverarbeitung, sichere Secret-Konfiguration, Statusübergänge, Wiederholungen und Integrationstests ergänzt werden. Billing-Webhooks dürfen Meterwerk-User-Sessions nicht als Provider-Authentifizierung verwenden.

## Migration und Prüfung

`pnpm db:migrate` wendet die additive SaaS-Billing-Migration an. `pnpm test:licensing` und `pnpm test:usage` benötigen die lokale Demo-Datenbank. Billing selbst funktioniert ohne Providerzugang. Keine reale Hardware ist erforderlich.
