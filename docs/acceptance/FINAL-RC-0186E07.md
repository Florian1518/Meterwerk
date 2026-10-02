# Meterwerk v1.0 Release Candidate – lokale Acceptance

Bewerteter Code-Stand: `0186e076331f34dd10aefd6192c11417f25e2c04` auf `master`.
Die Bewertung begann mit cleanem Arbeitsbaum. Der nachfolgende
`FINAL_RELEASE_METADATA_COMMIT` enthält ausschließlich Dokumentation und
Evidence; die geprüften Runtime-Images wurden aus dem oben genannten Code-SHA
gebaut.

## Entscheidung

**LOCAL SOFTWARE ACCEPTANCE: PASSED**

**METERWERK V1.0 RC PREPARATION: READY**

**LOCAL SOFTWARE RELEASE BLOCKER: NONE**

Commit `84ce62c5c48011bb0354b556ddb77c4abc20c438` wurde nach Entdeckung des
Next.js-Sicherheitsbefunds als Release-Kandidat abgelöst. Der Security-Blocker
wurde mit Next.js `16.3.8` behoben. Dependency Audit: 0 Critical, 0 High,
0 Moderate, 0 Low. Lockfile SHA-256:
`321fe1b02bc6508a33a63d4df0609da5ee6d08ec8f05d1c5dcef6ff9a42da530`.

## Image- und Runtime-Nachweise

Beide Images wurden für `linux/amd64` aus dem validierten SHA `0186e076…`
gebaut. Base Image: `node:22-alpine`, Digest
`sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`.

| Artefakt                             | Identität                                                                 |           Größe | SBOM                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------- | --------------: | ------------------------------------------------------------------------------------------- |
| Web `meterwerk-web:rc-0186e07`       | `sha256:f15638cc77205e22b9014092e6d1c9b667f66454508c4642d692e74ca5d87adc` | 327950618 Bytes | 299 Komponenten; SHA-256 `92fd808a0076818f0fb52cdcff13488c40a4d7a91c34863c5efd2c3780ac836f` |
| Worker `meterwerk-worker:rc-0186e07` | `sha256:f78f7c560cff94822bbb8fd42c28145dbbe34bd53bb79ca40b2f61d9ef5406a2` | 253616284 Bytes | 80 Komponenten; SHA-256 `6362f152c81ab40a525fe37aee778576e3efacc909f2b6b63628f374ed05b82c`  |

Web Readiness, synthetischer Login und authentifiziertes Dashboard: PASSED.
Rules Worker: PASSED. Rollout Worker: PASSED. MQTT Worker: PASSED,
`mqtt.subscribed`. Worker SIGTERM: 3/3 PASSED, Exitcode jeweils 0; Stopzeiten
0,32–0,37 Sekunden. Die isolierte Acceptance-Datenbank enthielt 47 Migrationen.

Die früheren Prisma-Zyklusfehler entstanden, weil ein Runtime-Smoke die falsche
lokale Compose-Datenbank verwendete. Diese hatte nicht die erforderliche
Migrationsbasis. Mit der korrekten isolierten Acceptance-Datenbank wurden die
Worker erneut geprüft und die Fehler traten nicht auf. Einstufung:
`ENVIRONMENT_TEST_HARNESS_ISSUE`, kein nachgewiesener Produktfehler.

## Offene externe Validierung

`EXTERNAL_VALIDATION_PENDING`: Remote-CI, echtes Staging, Signing Verification,
Provider Validation, PITR/Full Restore, HA/Failover und Representative Production
Load. Diese Punkte sind keine lokalen Software-Blocker und werden nicht als
bestanden dargestellt.

`HARDWARE_VALIDATION_PENDING`: reale Strom-, Wasser-, Gas- und Wärmezähler,
Gateways, Modbus RTU/TCP, M-Bus, Wireless M-Bus, Pulse, LoRaWAN und
herstellerspezifische Geräte.

Dies ist keine Production-Freigabe. Es erfolgten kein Push, Tag oder Deployment.
