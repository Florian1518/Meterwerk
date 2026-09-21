# Kundenportal

Das Portal verwendet die bestehende Sitzung und `tenantScope`-/`PropertyGrant`-Prüfungen. TENANT_ADMIN sieht den eigenen Mandanten, MANAGER freigegebene Liegenschaften, USER ausschließlich explizite Property-Grants und SUPER_ADMIN benötigt weiterhin eine explizite Mandantenauswahl. Tenant-IDs aus URL oder Request werden nie als Autorisierung akzeptiert.

Portfolio- und Liegenschaftsseiten zeigen Strom, Wasser, Gas und Wärme getrennt mit ihren jeweiligen Einheiten. Kosten werden als Analyse ausgewiesen: **keine rechtsverbindliche Nebenkosten- oder Messstellenabrechnung**.
