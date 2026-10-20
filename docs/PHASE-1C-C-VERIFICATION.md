# Phase 1C-C – Betriebs- und Sicherheitshärtung

## Ergebnis

- Gateway-Credential HTTP-CREATE-/ROTATE-Aktionen sind deaktiviert. Die alten
  Credential-Routen nehmen nur noch Widerruf an. Der sichere Enrollment-Weg
  registriert einen vom Gateway erzeugten Ed25519-SPKI-Public-Key im bestehenden
  `GatewayCredential`-Modell.
- Der frühere serverseitige Private-Key-Helfer wurde aus den Laufzeitservices
  entfernt. Die verbleibende `seed-edge.ts`-Erzeugung ist ausdrücklich auf
  `SEED_DEMO=true`, Nicht-Produktion und Loopback-Datenbanken beschränkt.
- Gateway-CSV-Import und Device-Importe mit Gateway-Zuordnung bleiben bis zu
  einem geprüften Importworkflow gesperrt. Tenant-Referenzen werden bei Preview
  und Bestätigung kontrolliert. Ungebundene Device-Importe bleiben möglich.
- Propertywechsel bleiben SUPER_ADMIN-only, auf NEW/MAINTENANCE begrenzt und
  verlangen null Devices sowie null offene Commands. Deviceanlage und
  Command-Erzeugung prüfen die direkte Gateway-/Meter-/Property-Invariante in
  derselben tenantgesperrten Transaktion. Konkurrenztests decken Deviceanlage,
  Command und konkurrierende Propertyrevisionen ab.
- First-contact-Readiness stützt sich auf `gateway.heartbeat`-Auditzeit vom
  Server nach Erwerb des Gateway-Locks. Gerätezeit wird auf Plausibilität und
  Monotonie geprüft; sie ist kein Readiness-Nachweis. Replay aktualisiert keine
  Erstkontakt- oder Versuchsevidenz. `firstContactAt` bleibt historisch.
- Kommunikationsfingerprints werden tenantübergreifend serialisiert und
  duplikatfrei registriert. Eine neue aktive Identität darf erst freigeschaltet
  werden, nachdem der externe Widerruf der vorherigen Identität bestätigt ist.
  CN, Issuer und Seriennummer bleiben Inventarmetadaten, kein Authentisierungs-
  oder Brokerverbindungsnachweis.
- Der Browser-E2E prüft Stilllegung, Terminalität, fehlende Reaktivierungsaktion,
  widerrufene Signaturcredentials, getrennten offenen Brokerwiderruf, externe
  Bestätigung und einen direkten ACTIVE-Manipulationsversuch, den die API
  ablehnt.

## Bewusste Grenzen

Die Plattform stellt weiterhin keine Zertifikate aus und ändert keine
Broker-/ACL-Konfiguration. Ein angeforderter, aber nicht extern bestätigter
Brokerwiderruf bedeutet keine vollständige Sperrung. Devices werden bei einer
Gateway-Stilllegung nicht automatisch stillgelegt. Es gibt keine neue Migration.

## Lokale Prüfung

Die Playwright-Abnahme verwendet eine frische, loopbackgebundene Embedded-
PostgreSQL-Datenbank mit synthetischen Seed-Daten. Sie startet weder Hardware
noch MQTT-Worker und nutzt keine Zertifikatsausstellung oder Produktions-Secrets.
