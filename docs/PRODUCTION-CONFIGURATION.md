# Produktionskonfiguration Phase 5d

Meterwerk trennt `development`, `test`, `pilot` und `production` über `METERWERK_ENV`. Konfiguration kommt ausschließlich aus Environment-Variablen oder einem Secret-Provider. `.env.example` enthält nur Platzhalter.

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

Development verwendet lokale Mailablage und darf keine Produktionsdaten verwenden. Test verwendet isolierte Datenbank und zeitlich begrenzte Testschlüssel. Pilot benötigt HTTPS, echte Secret-Verwaltung und kontrollierte Domains. Production erzwingt `SESSION_SECRET`, `MFA_ENCRYPTION_KEY` und die konfigurierten Mailprovider-Parameter.

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

Production verwendet `ATTACHMENT_STORAGE=s3` mit einem privaten, S3-kompatiblen Bucket. Endpoint, Bucket, Region und Credentials kommen aus der Deployment-/Secret-Konfiguration. Lokaler Storage ist nur für Development und Test vorgesehen.
