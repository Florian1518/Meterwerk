# Datenqualität und Korrekturen

## Prüfung

`/data-quality` ist für TENANT_ADMIN und SUPER_ADMIN verfügbar. Der Mandant wird serverseitig aus der Sitzung ermittelt; SUPER_ADMIN muss ihn explizit auswählen. Die Qualitätsprüfung liest ausschließlich PostgreSQL-Daten und benötigt keine Hardwareverbindung.

Filter: Zeitraum, Zähler-ID oder Seriennummer, Problemtyp und Schweregrad. Reine Datumsfilter beziehen sich auf UTC-Kalendertage, wobei der gewählte Endtag eingeschlossen ist; die Oberfläche zeigt zusätzlich den effektiven UTC-Zeitraum. ISO-Zeitstempel erlauben ein explizites exklusives Ende. Ein Scan ist auf 366 Tage, 5.000 Zähler und 100.000 Messwerte begrenzt. Bei Überschreitung wird vor dem Schreiben abgebrochen; Zeitraum oder Zählerfilter müssen eingegrenzt werden. Befunde werden in Seiten zu 50 Einträgen geladen; die Schweregradübersicht berücksichtigt alle passenden offenen Befunde.

| Regel                              | Bewertung                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fehlende Messwerte                 | Fehler, wenn ein aktiver, bereits installierter Zähler im Zeitraum keine Werte hat                                                                                                  |
| Doppelte Zeitstempel               | Fehler bei mehreren Messwerten desselben Zählers zum selben Zeitpunkt, auch aus verschiedenen Quellen                                                                               |
| Zeitstempel außerhalb des Bereichs | Fehler vor Installation oder mehr als fünf Minuten in der Zukunft                                                                                                                   |
| Negative Verbräuche                | Fehler bei Wasser, Gas und Wärme; die Erkennungsregel nimmt Strom aus, der bestehende Datenbankconstraint verhindert jedoch negative Verbrauchswerte beim Schreiben für alle Medien |
| Rückläufiger Zählerstand           | Fehler bei fallendem Registerwert gegenüber dem vorherigen Messwert                                                                                                                 |
| Ungewöhnlicher Sprung              | Warnung ab vier Messwerten: positiver Verbrauch oder Registerzuwachs über dem Zehnfachen des jeweiligen positiven Medians und zusätzlich mehr als eine Einheit darüber              |
| Unpassende Einheit                 | Fehler, wenn Messwert- und Zählereinheit abweichen                                                                                                                                  |
| Verwaiste Zuordnung                | Fehler bei fehlender bzw. abweichender Device-/Zählerzuordnung                                                                                                                      |
| Datenlücke                         | Warnung bei Abstand über max. 24 Stunden bzw. dreifachem typischen Intervall; bei weniger als drei positiven Intervallen wird sieben Tage als typisches Intervall verwendet         |

Datenlücken werden zwischen Werten sowie am Anfang und Ende des Prüfzeitraums berücksichtigt. Die Prüfungen sind heuristisch; ein Befund ist keine automatische Abrechnungskorrektur. Zählerwechsel oder ein fachlich zulässiger Rücklauf benötigen eine Bewertung. Geräte-Credentials und operative Gerätesteuerung werden nicht verwendet.

## Status und Bestätigungen

Die Übersicht zeigt `OK`, `WARNING` oder `ERROR` nach offenen Befunden. Dies ist vom Messwertstatus `VALID`, `INVALID`, `ESTIMATED`, `SUSPECT` getrennt. Eine manuelle Statusänderung löscht keine Befunde und führt keine erneute Analyse aus.

Mehrere Befunde können gemeinsam bestätigt werden. Die Bestätigung speichert Zeitpunkt, Benutzer-ID und Begründung; sie dokumentiert die Kenntnisnahme und behebt das Problem nicht. Bestätigte Befunde bleiben sichtbar und zählen weiterhin zum Schweregrad. Bereits bestätigte oder inzwischen geschlossene Befunde blockieren eine erneute Sammelbestätigung. Ein erneuter Scan aktualisiert Befunde anhand ihres Fingerprints und schließt nicht mehr erkannte Befunde desselben Prüfbereichs. Eine Bestätigung bleibt am vorhandenen Fingerprint erhalten.

## Korrekturwerkzeuge

- **Korrigieren:** Zeitstempel, Registerwert, optionaler Messwert, Verbrauch, Einheit oder Qualität kontrolliert ändern.
- **Als ungültig markieren:** `INVALID` setzen; der Datensatz bleibt erhalten.
- **Ersatzwert:** explizite Werte erfassen und als `ESTIMATED` kennzeichnen.
- **Messwertstatus gesammelt zuweisen:** bis zu 100 IDs in einer Transaktion auf `VALID`, `INVALID`, `ESTIMATED` oder `SUSPECT` setzen. In der Oberfläche werden die zu ausgewählten Befunden gehörenden Messwerte dedupliziert; Befunde ohne Messwert erhalten keinen Messwertstatus.
- **Importfehler gesammelt bearbeiten:** fehlerhafte Zeilen mit Begründung aus der verbleibenden Vorschau ausschließen und diese erneut prüfen. Wertänderungen und Feldzuordnungen erfolgen über eine korrigierte CSV mit neuer Vorschau, siehe [DATA-IMPORT.md](DATA-IMPORT.md).

Jede Korrektur verlangt eine Begründung mit 10–1.000 Zeichen. Geänderte Zeitstempel brauchen einen Offset, liegen nicht vor Installation und höchstens fünf Minuten in der Zukunft. Die Eingabefelder der Oberfläche verwenden explizit UTC. Registerwerte und Verbrauch dürfen nach den bestehenden Datenbankconstraints nicht negativ sein. Die Einheit muss der aktuellen Zählereinheit entsprechen. Die Eindeutigkeit aus Mandant, Zähler, Zeitpunkt und Quelle darf nicht verletzt werden. Dezimalwerte werden mit Decimal verarbeitet; Messwerte verwenden bis zu sechs Nachkommastellen. Vorhandene Detailmessgrößen werden nicht automatisch aus korrigierten Summenwerten neu berechnet.

## Isolation und Atomizität

Jede API-Route authentifiziert unabhängig vom Layout. Serverfunktionen prüfen Rolle, Mandant und Zod-Schema. Sammelaktionen akzeptieren ausschließlich explizite IDs, niemals ein clientseitiges „alle Mandanten“. Alle IDs müssen im ausgewählten Mandanten existieren. Eine einzige fremde oder fehlende ID lässt die gesamte Aktion scheitern; es gibt keine Teilübernahme. USER und MANAGER dürfen keine Qualitätskorrekturen oder Sammelmutationen ausführen.

Mutationen laufen unter einer Mandantensperre mit Änderung, Korrekturhistorie und AuditEvent in derselben Datenbanktransaktion. Zusammengesetzte Fremdschlüssel schützen die Referenzen zusätzlich. Die Sperre koordiniert Importbestätigungen und Qualitätsmutationen; sie stellt keinen globalen Snapshot aller gleichzeitig laufenden Datenquellen her.

## Audit und Historie

Einzelkorrekturen und Sammelstatusänderungen legen für jeden Messwert einen `DataQualityCorrection`-Eintrag mit Before-/After-Snapshot, Aktion, Benutzer, Grund und UTC-Zeitpunkt an. Die ursprünglichen Werte einschließlich unveränderter Detailmessgrößen bleiben darin nachvollziehbar. Die Korrekturhistorie kann am Befund geöffnet werden. Eine Sammelaktion schreibt zusätzlich ein AuditEvent mit allen betroffenen IDs, Begründung und Zielstatus.

Auditaktionen: `data_quality.scan`, `data_quality.correct`, `data_quality.replace`, `data_quality.mark_invalid`, `data_quality.bulk_set_status`, `data_quality.bulk_acknowledge`. Auditdaten werden ausschließlich serverseitig erzeugt; es gibt keinen Bearbeitungsendpunkt für historische Snapshots. Datenbankadministratoren können diese Daten technisch verändern; kryptografische Unveränderlichkeit oder externe Archivierung wird nicht zugesichert.

Die Bestätigung eines Fehlers ändert keine Messwerte. Der CSV-Export gibt auch ungültige/geschätzte Messwerte mit ihrer Qualitätskennzeichnung aus und filtert nicht stillschweigend Daten weg. Eine Korrektur löst keine reale Nachricht, Geräteverbindung oder Abrechnung aus.

## Grenzen und Verifikation

Qualitätsanalyse ist eine begrenzte synchrone Prüfung; zeitgesteuerte Scans und Jobs für größere Bestände sind offen. Befundseiten und Import-Historie sind paginiert; Export ist gestreamt. Bestehende Einzelkorrekturhistorien werden vollständig geladen. Der Export ist kein revisionsfester Datenbank-Snapshot. Abgelaufene Importvorschauinhalte benötigen künftig eine konfigurierte Aufbewahrungs-/Bereinigungsregel. Vorzeichenbehafteter Stromverbrauch benötigt eine gesonderte Anpassung der vorhandenen Datenbankregel; diese Phase ändert deren Semantik nicht.

Unit Tests prüfen Parser, CSV-Formelschutz, Zeiträume und Erkennungsregeln. Integrationstests prüfen Fremdmandanten, fremde IDs, USER ohne Grant, Rolleneskalation, atomare Ablehnung, Bestätigungen und Korrekturhistorie. HTTP-Tests prüfen Anmeldung, CSRF, sichere Fehlerantworten und Download-Header. Die Security-Suite ergänzt bestehende Sitzungs-, MFA- und Einladungsprüfungen. Alle Datenbanktests gehören ausschließlich auf die lokale Demo-Datenbank.
