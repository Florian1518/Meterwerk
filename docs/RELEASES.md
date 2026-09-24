# Releases

Meterwerk verwendet Semantic Versioning `MAJOR.MINOR.PATCH`.

- **MAJOR**: inkompatible API- oder Datenmodelländerung.
- **MINOR**: rückwärtskompatible Funktion.
- **PATCH**: rückwärtskompatible Fehler- oder Sicherheitskorrektur.
- **Pre-Release/RC**: Suffixe wie `-alpha.1`, `-beta.1` oder `-rc.1` vor dem stabilen Tag.

Die Version steht zentral in `package.json`. Releases entstehen aus dem stabilen Hauptbranch mit einem signierten oder geschützten Tag `vMAJOR.MINOR.PATCH`. Pull Requests laufen durch die vollständige CI. Hotfixes starten vom letzten Release-Tag, werden geprüft und anschließend in den Hauptbranch zurückgeführt.

Rollback bedeutet zunächst auf das vorherige geprüfte Artefakt zurückzugehen. Datenbankmigrationen müssen vorwärtskompatibel geplant werden; ein automatisches Zurückrollen produktiver Migrationen ist nicht Teil der Pipeline.
