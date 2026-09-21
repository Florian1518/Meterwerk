# Device Profiles

Device Profiles enthalten Hersteller, Modell, Utility, Protokoll, versionierte Messgrößen, Einheiten-Mapping, Kommunikationsdefaults und Firmwarehinweise. Eine neue Version wird als neue Zeile angelegt; bestehende Profile/Readings werden nicht überschrieben. `Device.profileId` ist mandanten- und zusammengesetzt fremdschlüsselgesichert.

Profile können mit `createDeviceProfile` und `GET /api/devices/:id/capability` serverseitig verwaltet bzw. angezeigt werden. Die Capability-Daten enthalten keinen geheimen Schlüssel. Protocol Config enthält für wM-Bus nur eine Credential-Referenz.
