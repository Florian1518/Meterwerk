# Environment-Variablen

Werte in dieser Referenz sind Platzhalter. Secrets kommen aus einem Secret Store oder einer nicht versionierten `.env`.

| Variable                                                       | Zweck                                                  |   Erforderlich | Umgebungen/Default       |
| -------------------------------------------------------------- | ------------------------------------------------------ | -------------: | ------------------------ |
| `METERWERK_ENV`                                                | `development`, `test`, `staging`, `demo`, `production` |             ja | development              |
| `NODE_ENV`                                                     | Node/Next-Laufzeitmodus                                |             ja | development              |
| `DATABASE_URL`                                                 | PostgreSQL-Verbindung                                  |             ja | –                        |
| `APP_URL`                                                      | kanonische Origin/CSRF-Prüfung                         |             ja | localhost:3000           |
| `SESSION_SECRET`                                               | Sitzungen                                              |             ja | kein sicherer Default    |
| `MFA_ENCRYPTION_KEY`                                           | verschlüsselte MFA-Daten                               |        prod ja | –                        |
| `MQTT_BROKER_URL` / `MQTT_URL`                                 | MQTT-Broker                                            | je nach Worker | localhost in Entwicklung |
| `MQTT_CA_PATH`, `MQTT_CERT_PATH`, `MQTT_KEY_PATH`              | MQTT-TLS                                               | optional lokal | –                        |
| `ATTACHMENT_STORAGE`                                           | `local` oder S3-kompatibel                             |           nein | local                    |
| `ATTACHMENT_LOCAL_ROOT`                                        | lokaler Storage-Pfad                                   |           nein | `.local/attachments`     |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`                        | Storage-Ziel                                           |      bei S3 ja | –                        |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                     | Storage-Credentials                                    |      bei S3 ja | Secret Store             |
| `EMAIL_PROVIDER`, `SMTP_URL`, `EMAIL_API_URL`, `EMAIL_API_KEY` | Mail/Sandbox                                           |       optional | local                    |
| `WEBHOOK_SECRET_ENCRYPTION_KEY`                                | Webhook-Secret-Verschlüsselung                         |        prod ja | Secret Store             |
| `TRUSTED_HOSTS`                                                | erlaubte Hostnamen                                     | prod empfohlen | localhost                |
| `LOG_LEVEL`                                                    | Logging-Level                                          |           nein | INFO                     |
| `SEED_DEMO`, `DEMO_PASSWORD`                                   | expliziter Demo-Seed                                   |      DEMO/TEST | aus                      |
| `DEMO_RESET_CONFIRM`                                           | Reset-Bestätigung                                      |       Reset ja | –                        |
| `NEXT_PUBLIC_METERWERK_ENV`                                    | sichtbares UI-Label                                    |   DEMO/STAGING | –                        |
| `METERWERK_IMAGE`                                              | Staging-Containerimage                                 |     Staging ja | –                        |
| `STAGING_POSTGRES_PASSWORD`, `STAGING_SESSION_SECRET`          | Staging-Secrets                                        |     Staging ja | Secret Store             |
| `STAGING_STORAGE_USER`, `STAGING_STORAGE_PASSWORD`             | Staging-Storage                                        |     Staging ja | Secret Store             |
| `SMOKE_BASE_URL`                                               | Smoke-Test-Ziel                                        | Smoke optional | localhost:3000           |

Keine Variable darf in DEMO/STAGING auf erkennbare `prod`, `production` oder `live`-Ressourcen zeigen. Backup-, Push-, Worker- und API-Key-Konfiguration folgt demselben Trennungsprinzip.
