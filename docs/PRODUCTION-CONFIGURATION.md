# Produktionskonfiguration Phase 5d

Die kanonischen Environments sind `development`, `test`, `staging`, `demo` und `production`. Die ältere Pilot-Konfiguration ist ein Bereitstellungsprofil, keine zusätzliche isolierte Datenumgebung; ein Pilot benötigt die produktionsgleichen Sicherheitsvorkehrungen und getrennte Pilot-Ressourcen. Konfiguration kommt aus Environment-Variablen oder einem Secret-Provider. `.env.example` enthält Platzhalter.

## Variablen

| Variable                          | Zweck                              | Produktion                             |
| --------------------------------- | ---------------------------------- | -------------------------------------- |
| `METERWERK_ENV`                   | Laufzeitprofil                     | `production`                           |
| `DATABASE_URL`                    | PostgreSQL-Verbindung              | Secret Provider                        |
| `APP_URL`                         | öffentliche HTTPS-URL              | z. B. `https://app.meterwerk.de`       |
| `SESSION_SECRET`                  | Session-/Rotationsgeheimnis        | mindestens 32 Zeichen, Secret Provider |
| `MFA_ENCRYPTION_KEY`              | AES-256-Schlüssel für TOTP-Secrets | 32 Byte, Secret Provider               |
| `EMAIL_PROVIDER`                  | `local`, `smtp` oder `api`         | `smtp`/`api`                           |
| `SMTP_URL`                        | SMTP-Verbindung                    | Secret Provider                        |
| `EMAIL_API_URL` / `EMAIL_API_KEY` | API-Mailadapter                    | Secret Provider                        |
| `TRUSTED_HOSTS`                   | erlaubte App- und Tenant-Hosts     | öffentliche Domains                    |
| `MQTT_*`, `GATEWAY_*`             | Geräte-/Gateway-Credentials        | getrennte Secret-Scopes                |

Development verwendet eine lokale In-Memory-Mail-Outbox; SMTP/API-Zustellung ist nicht implementiert. Test verwendet eine isolierte Datenbank. Staging und Demo brauchen getrennte Datenbanken, MQTT, Storage, Mail-/Push-Testziele, API-/Webhook-Secrets und Backup-Ziele. Pilot erfordert HTTPS und externe Secret-Verwaltung. Production erzwingt die im aktuellen `src/server/security-config.ts` definierten Secrets; die konkrete Providerbereitstellung muss separat validiert werden.

## HTTPS und Subdomains

Ein Reverse Proxy (Caddy oder nginx) terminiert TLS und leitet intern an den nicht öffentlich erreichbaren Next.js-Port weiter. Caddy-Beispiel:

```text
app.meterwerk.de {
  reverse_proxy 127.0.0.1:3000
}
*.meterwerk.de {
  reverse_proxy 127.0.0.1:3000
}
```

HSTS, Secure-/HttpOnly-/SameSite-Cookies, Hostprüfung und HTTPS-Weiterleitung liegen zusätzlich in der Anwendung. Eine Subdomain ist nur eine Routing-Hilfe; Tenant-Zugriff wird immer durch Sitzung, Rolle und serverseitigen `tenantScope` geprüft.

## Secrets und Aufbewahrung

Secrets erscheinen nicht in Logs, Reports, AuditEvents, Client-DTOs oder Git. TOTP-Secrets werden verschlüsselt gespeichert, Recovery-Codes nur als Hash. Geräte- und Mail-Secrets werden in getrennten Secret-Scopes verwaltet. Passwort-Reset- und Einladungstoken werden ausschließlich gehasht gespeichert und laufen ab. Aufbewahrung und Rotation werden durch den Secret-Provider und den Deployment-Prozess gesteuert.

## Attachment Storage

Der Code enthält lokale und S3-kompatible Storage-Adapter; konkreter Providerbetrieb wurde nicht pauschal nachgewiesen. Produktion darf nur private Objekte und serverseitige Credentials verwenden. Endpoint, Bucket und erforderliche Zugangsdaten kommen aus Deployment/Secret-Konfiguration. Siehe [Known Limitations](KNOWN-LIMITATIONS.md).
