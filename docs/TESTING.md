# Testhandbuch

| Kategorie        | Befehl                                              | Voraussetzung                            | Ergebnis                             |
| ---------------- | --------------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| Unit/Server      | `pnpm test`                                         | keine externe DB                         | alle Vitest-Tests grün               |
| Type/Lint/Format | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`  | Dependencies                             | keine Fehler                         |
| Integration      | `pnpm test:integration`                             | isolierte lokale Demo-DB, Migration/Seed | DB-Tests grün; sonst nicht bestanden |
| HTTP/API         | `pnpm test:http`                                    | laufendes `APP_URL`                      | HTTP-Verträge grün                   |
| Browser          | `pnpm test:e2e`                                     | laufender Web-Stack/Browser              | Playwright-Abnahme                   |
| Security         | `pnpm security:regression`, `pnpm security:secrets` | keine Prod-Daten                         | Security-Suite/Scan                  |
| DR/Backup        | `pnpm dr:regression`                                | überwiegend pure Tests                   | Registry/Restore-Guards              |
| Demo/Staging     | `pnpm demo:verify-all`                              | DEMO/TEST + `DATABASE_URL`               | Demo-Verify, optional Smoke          |
| Smoke            | `pnpm smoke:staging`                                | `SMOKE_BASE_URL`                         | Live/Ready/Build-Info                |
| Build            | `pnpm build`                                        | Dependencies                             | Produktionsbuild                     |

Performance-Skripte liefern nur gemessene Werte; keine Skalierungsergebnisse aus Smoke-Tests ableiten. Hardware-, MQTT-TLS-, Modbus- und Gateway-Tests verwenden Simulatoren. Physische Zähler, RS485, M-Bus, W-MBus, LoRaWAN und Hersteller-APIs sind nicht real validiert.
