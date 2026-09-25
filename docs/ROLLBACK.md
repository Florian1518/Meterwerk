# Rollback

Rollback ist sinnvoll, wenn ein Release einen reproduzierbaren Fehler verursacht und ein kompatibles vorheriges Artefakt existiert. Promotion/Rollout stoppen, Fehler und betroffene Version erfassen, Auswirkungen auf Schema und Jobs beurteilen.

## App- und Worker-Rollback

Vorheriges unveränderliches Image/Digest und dazu passende Konfiguration bereitstellen. Web und Worker müssen hinsichtlich gemeinsamer Datenbank, Nachrichten und Jobs kompatibel sein. Worker kontrolliert anhalten/wechseln; keine laufenden Jobs blind duplizieren. Danach Readiness, Worker-Leases, Logs und kritische Userpfade validieren.

## Migrationen und Daten

Eine App-Rückkehr macht eine Datenbankmigration nicht rückgängig. Nicht jede Migration ist rückwärtskompatibel. Migrationen anhand `prisma/migrations` und Release Notes prüfen. Bei inkompatiblem Schema den Vorwärtsfix bevorzugen. Ein Datenbank-Restore ist ein gesonderter, möglicherweise datenverlierender Recovery-Vorgang, kein Routine-Rollback; nur nach autorisierter Zielprüfung über [Recovery Runbook](RECOVERY-RUNBOOK.md) ausführen. Keine destruktiven SQL- oder Reset-Befehle als Standard.

Nach Stabilisierung Version/SHA, Datenbankmigration, Ursache und Maßnahmen dokumentieren und Releaseprozess aktualisieren.
