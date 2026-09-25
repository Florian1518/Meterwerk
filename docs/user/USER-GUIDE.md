# Benutzerhandbuch

Anmelden erfolgt über `/login`; Passwort-Reset und MFA werden nur angeboten, wenn sie für das Konto aktiviert sind. Nach der Anmeldung führt die Navigation zu Portfolio, Liegenschaften, Zählern, Dashboards, Analytics, Alarmen, Reports und Support. Tenant- und Property-Freigaben begrenzen alle Daten.

## Typischer Ablauf

1. Portfolio oder Property wählen.
2. Gebäude, Einheit oder Meter öffnen.
3. Zeitraum und Medium filtern: Strom, Wasser, Gas oder Wärme.
4. Readings, Qualität, Datenlücken, Kosten und Status prüfen.
5. Dashboard/Analytics öffnen; Forecasts sind Prognosen, keine Zusagen.
6. Alarm bestätigen oder Support/WorkOrder über den vorgesehenen Prozess eröffnen.
7. Report auswählen und berechtigten CSV-/PDF-Export ausführen.
8. Mobil kann die PWA genutzt werden; bei Verbindungsverlust ist keine vollständige Offline-Datenbank garantiert. Danach abmelden.

USER sieht nur explizit freigegebene Properties und kann keine Verwaltungs-, Rollen-, Tenant- oder Credential-Aktionen ausführen. MANAGER erhält fachliche Ansichten und kann tenantgebundene Daten sehen; zentrale Policy-Funktionen behandeln MANAGER nicht als Verwaltungsrolle. TENANT_ADMIN kann die explizit mit `requireManage` geschützten Verwaltungsaktionen im eigenen Tenant ausführen. Nicht jede Funktion steht jeder Rolle offen; die jeweilige Seite/API prüft zusätzlich ihre Rechte. Favoriten werden hier nicht als verfügbare Funktion vorausgesetzt. Details: [Analytics](ANALYTICS.md), [Reporting](REPORTING.md), [Regeln und Alarme](RULES-AND-ALARMS.md), [Mobile/PWA](MOBILE-PWA.md).
