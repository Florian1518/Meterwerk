# Edge-Gateway als dauerhafter Prozess

Der Agent bleibt ein separater Prozess. Node.js ≥22.12, die gesperrten pnpm-Abhängigkeiten und die nativen SerialPort-Bindings müssen auf dem Zielsystem installiert sein. Start aus dem Releaseverzeichnis mit `node --import tsx apps/edge-gateway/src/cli.ts`. Der Prozess braucht keinen Datenbankzugang und keine Benutzer-Cookies.

## Konfiguration, Daten und Logs

`EDGE_CONFIG_PATH` zeigt auf eine lokale JSON-Datei; Standard `.local/edge-config.json`. Relative Pfade beziehen sich auf das Arbeitsverzeichnis, daher für Dienste absolute Pfade verwenden. Beispiel ohne Credentials:

```json
{
  "gatewayId": "GATEWAY_ID_AUS_PROVISIONIERUNG",
  "deviceId": "DEVICE_ID_AUS_PROVISIONIERUNG",
  "credentialId": "CREDENTIAL_ID_AUS_PROVISIONIERUNG",
  "dataDirectory": "C:/ProgramData/Meterwerk/data",
  "privateKeyPath": "C:/ProgramData/Meterwerk/secrets/gateway-private.pem",
  "receiptPublicKeyPath": "C:/ProgramData/Meterwerk/secrets/receipt-public.pem",
  "allowedSerialPorts": ["COM3"],
  "allowedTcpEndpoints": []
}
```

`MQTT_BROKER_URL` konfiguriert den Broker. Schlüsseldateien und Konfiguration nur für Dienstkonto/Administratoren lesbar machen. Kein `.env` aus einer Entwicklerinstallation ausliefern. Die lokale Freigabeliste begrenzt die vom Server ansteuerbaren Endpunkte. Der Simulator ist standardmäßig nur unter 127.0.0.1:1502 freigegeben; serielle Ports sind standardmäßig gesperrt.

Im Datenverzeichnis liegen `edge-queue.json`, `hardware-results.json`, der Konfigurationscache `hardware-results.json.configuration` und `edge.lock`. Queue und Cache bleiben beim Update erhalten. Autorisiertes Polling läuft bei MQTT-Ausfall weiter und wird nach Neustart aus dem Cache fortgesetzt. Abgelaufene Steuerbefehle werden nicht erneut ausgeführt. Eine Prozesssperre verhindert zwei Agenten im selben Datenverzeichnis. SIGINT/SIGTERM beenden den Agenten nach dem laufenden Arbeitszyklus; ausreichend Zeit zum Stoppen einplanen.

Logs gehen auf stdout/stderr und enthalten Betriebszustände/Zähler, keine privaten Schlüssel. Dienstmanager übernimmt Dateiumleitung/Rotation. Für Linux dienen Journal und optional die unten genannten Logdateien; Aufbewahrung und Plattenalarme konfigurieren. Die Queue hat noch keine Kapazitätsgrenze und keine Quarantäne für dauerhaft abgewiesene Nachrichten: Füllstand, Alter und freien Speicher überwachen. Nicht unkontrolliert löschen.

## Windows: WinSW

Eine geprüfte WinSW-Version lokal bereitstellen. Wrapper und XML gleich benennen, etwa `MeterwerkEdge.exe` und `MeterwerkEdge.xml`. Beispiel an tatsächliche Installationspfade anpassen:

```xml
<service>
  <id>MeterwerkEdge</id>
  <name>Meterwerk Edge Gateway</name>
  <description>Modbus-Erfassung und MQTT-Zustellung</description>
  <executable>C:\Program Files\nodejs\node.exe</executable>
  <arguments>--import tsx apps/edge-gateway/src/cli.ts</arguments>
  <workingdirectory>C:\Meterwerk\current</workingdirectory>
  <env name="EDGE_CONFIG_PATH" value="C:\ProgramData\Meterwerk\edge-config.json" />
  <env name="MQTT_BROKER_URL" value="mqtt://127.0.0.1:1883" />
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>120 sec</stoptimeout>
  <onfailure action="restart" delay="10 sec" />
  <logpath>C:\ProgramData\Meterwerk\logs</logpath>
  <log mode="roll" />
</service>
```

Nach administrativer Installation (`.\MeterwerkEdge.exe install`) in der Windows-Dienstverwaltung ein dediziertes eingeschränktes Dienstkonto einstellen, Port-/Dateirechte prüfen, dann `.\MeterwerkEdge.exe start`. Autostart durch einen kontrollierten Rechnerneustart prüfen. Dienste wurden in Phase 4a nicht auf diesem Entwicklungsrechner installiert. Referenz: [WinSW XML-Konfiguration](https://github.com/winsw/winsw/blob/v3/docs/xml-config-file.md).

## Linux: systemd

Dediziertes Konto `meterwerk`, Release unter `/opt/meterwerk/current`, Konfiguration/Schlüssel unter `/etc/meterwerk`, schreibbare Daten unter `/var/lib/meterwerk` bereitstellen. Seriellen Zugriff z. B. über die systemspezifische Gerätegruppe ermöglichen; Gruppennamen anhand der Distribution prüfen.

```ini
[Unit]
Description=Meterwerk Edge Gateway
Wants=network-online.target
After=network-online.target

[Service]
Type=exec
User=meterwerk
Group=meterwerk
WorkingDirectory=/opt/meterwerk/current
Environment=EDGE_CONFIG_PATH=/etc/meterwerk/edge-config.json
Environment=MQTT_BROKER_URL=mqtt://127.0.0.1:1883
ExecStart=/usr/bin/node --import tsx apps/edge-gateway/src/cli.ts
Restart=on-failure
RestartSec=10
TimeoutStopSec=120
NoNewPrivileges=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=meterwerk-edge

[Install]
WantedBy=multi-user.target
```

Als `/etc/systemd/system/meterwerk-edge.service` installieren, danach `systemctl daemon-reload` und `systemctl enable --now meterwerk-edge`. Status/Logs: `systemctl status meterwerk-edge`, `journalctl -u meterwerk-edge`. Persistentes Journal/Rotation lokal konfigurieren; bei erforderlichen dedizierten Logdateien stdout/stderr über die systemd-Optionen `append:` in vorbereitete Dateien umleiten und externe Rotation einrichten. Referenz: [systemd.service](https://github.com/systemd/systemd/blob/main/man/systemd.service.xml).

## Kontrollierte Updates

1. Geprüften Git-Commit als neues Release bereitstellen, `pnpm install --frozen-lockfile` auf dem Zielsystem; native Bindings prüfen.
2. Kompatibilität von Nachrichtenvertrag, Profilen und Datenbankmigrationen prüfen. Konfiguration, Schlüssel und Queue gesichert außerhalb des Releases halten.
3. Dienst stoppen, Ende des Prozesses abwarten, Releasepfad umstellen, Dienst starten.
4. ONLINE, aktuelle Messung, Queue-Abbau und fehlerfreie Diagnose kontrollieren. Bei Fehler auf das kompatible vorherige Release zurückwechseln; keine Queue-Dateien löschen.

Keine automatische Update-Infrastruktur enthalten. Vor Produktionsfreigabe fehlen insbesondere Broker-TLS/ACLs samt Credential-Lebenszyklus, überwachte Queue-Grenzen/Quarantäne, Backup/Wiederherstellung, Last-/Langzeittests und ein Abnahmetest auf realem RS485-Adapter/Zähler. Lokales anonymes MQTT nur für die isolierte Demo verwenden.
