# Meterwerk PWA

## Installation

Meterwerk stellt ein Web App Manifest mit Startseite `/dashboard`, `standalone`-Darstellung sowie 192- und 512-Pixel-Icons bereit. Chromium zeigt den Installationshinweis nur nach `beforeinstallprompt`; nach Installation wird er ausgeblendet. Safari/iOS nutzt „Teilen → Zum Home-Bildschirm“ und erhält dafür einen erklärenden Hinweis.

## Browser und HTTPS

Service Worker und Installationsfunktionen benötigen HTTPS; `localhost` ist für Entwicklung erlaubt. Manifest, `/sw.js` und Icons müssen unter derselben Origin ausgeliefert werden. Der Worker bleibt auf Scope `/` begrenzt. Unterstützt werden aktuelle Chromium-basierte Browser, Safari/iOS mit manueller Installation sowie Firefox mit eingeschränkter Installations-UX.

## Service Worker und Cache

Der versionierte Cache (`meterwerk-static-v2`) enthält ausschließlich Next.js-Static-Bundles und die drei Meterwerk-Icons. `/api/`, `/_next/data/`, HTML, Auth-Tokens, Tenantdaten und Messwerte werden nicht gecacht. Der Worker akzeptiert nur same-origin-GET-Anfragen für bekannte statische Pfade. Bei jedem Release wird die Cache-Version erhöht; bei `activate` werden alte `meterwerk-static-*`-Caches gelöscht. Dadurch bleiben Cache-Bestände begrenzt und neue Deployments werden nachvollziehbar aktiviert.

## Offline und Reconnect

Bei Verbindungsverlust zeigt die Oberfläche einen sichtbaren Offline-Status und stellt keine Live-Daten als aktuell dar. Schreibaktionen müssen deaktiviert sein oder eindeutig fehlschlagen. Nach `online` wird die sichtbare Ansicht neu geladen; laufende Aktionen werden nicht automatisch wiederholt. Formularinhalte bleiben nur im laufenden UI-Speicher erhalten. Es gibt keine Offline-Datenbank und keine dauerhafte lokale Speicherung sensibler Tenantdaten.

## Push-Vorbereitung

`PushSubscription` ist tenant- und benutzergebunden, widerrufbar und erlaubt mehrere Geräte. Die API prüft die aktuelle Sitzung und den Tenant serverseitig. Vorgesehene Events sind `CRITICAL_ALARM`, `METER_OFFLINE`, `GATEWAY_OFFLINE` und `REPORT_READY`; produktive Zustellung ist noch nicht aktiviert.

Für einen späteren Provider liest ein separater serverseitiger Worker aktive Subscriptions und sendet nur fachlich berechtigte Events. Provider-Fehler `404`/`410` markieren die Subscription als widerrufen. VAPID-Schlüssel, private Schlüssel und Provider-Secrets bleiben ausschließlich im Secret-Store bzw. Worker und werden nie an den Client gegeben.

## Deployment und Updates

Bei jedem Release werden Manifest, Service Worker und Icons gemeinsam ausgeliefert und die Cache-Konstante erhöht. Der neue Worker übernimmt nach `skipWaiting` und `clients.claim`; alte statische Caches werden bei der Aktivierung entfernt. Ein Logout muss keine Cache-Löschung erzwingen, weil geschützte Antworten und Auth-Tokens nicht im Cache landen.

Browserprüfungen decken Smartphone-Portrait/-Landscape, Tablet, Desktop, Navigation, Dialoge, Formulare, Offline/Online, Themes, Rollen und Touch-Ziele ab. Offline- und Push-Funktionen bleiben bis zur expliziten Provider- und Deployment-Konfiguration begrenzt.
