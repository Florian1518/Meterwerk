# Betriebsverantwortung

Diese technische Zuordnung beschreibt typische Zuständigkeiten. Sie begründet keine Verträge, organisatorischen Rollen oder Service-Level.

| Aufgabe                                   | Verantwortlich                          | Berechtigt / Grenzen                                                                         | Eskalation                                                 |
| ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Plattform, Releases, globale Operations   | Platform Operator / Security Operations | SUPER_ADMIN nur gemäß implementierter Plattformpolicy; Änderungen auditieren.                | Security Runbooks, Incident Management                     |
| Tenant-Benutzer, Properties, API/Webhooks | Tenant Admin                            | Eigener Tenant; keine Plattformaktionen.                                                     | Platform Operator bei Plattform-/Credentialvorfall         |
| Messstellen-/Gerätezuordnung, Einsatz     | Technician / Tenant Admin               | Zugewiesene WorkOrders und freigegebene Ressourcen; reale Arbeiten nach separaten Verfahren. | Tenant Admin / Support                                     |
| Kundenanalyse, Reports, Alarme            | USER / MANAGER gemäß Freigabe und Rolle | USER nur PropertyGrant; keine ungeprüfte Scope-Auswahl.                                      | Tenant Admin                                               |
| Supportfall und Diagnose                  | Support                                 | Tenant-Kontext bewusst wählen; keine Isolation umgehen; sensible Aktionen auditieren.        | Security Operations bei Cross-Tenant-/Datenabflussverdacht |
| Code, Migration, Tests                    | Developer                               | Keine produktive DB-Manipulation als Entwicklungsworkflow.                                   | Platform Operator für Release                              |
| Backup/Restore/DR                         | Platform Operator / Operations          | Restore/Delete stark privilegiert und nur nach Guard, Zielprüfung, Audit.                    | Incident Lead / Security Operations                        |

Siehe [Rollenhandbuch](admin/SUPER-ADMIN-GUIDE.md), [Operations](OPERATIONS.md), [Security Runbooks](SECURITY-RUNBOOKS.md) und [Recovery](RECOVERY-RUNBOOK.md).
