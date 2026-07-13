# Eridion

Eridion ist eine self-contained Desktop-Anwendung zum Erstellen, Importieren und Publizieren von Entity-Relationship-Diagrammen. Die Arbeitsdatei ist eine normale PDF: Sie kann in jedem PDF-Viewer angezeigt werden und enthält zusätzlich das vollständige, versionierte Eridion-Dokument als eingebettete Quelldatei.

## Funktionen

- Vue-Flow-Editor mit per Drag-and-drop sortierbaren Seitentabs; Ctrl/Cmd beim Ziehen dupliziert eine Seite samt Inhalt
- A0 bis A6, Letter und Legal in Hoch- oder Querformat
- eine dokumentweite Grundskalierung für Tabellen; 100 % entsprechen der bewusst kompakteren internen Darstellung mit Faktor 0,75
- relative Tabellenskalierung pro Seite; Texte, Überschriften und Seitenzahlen behalten ihre dokumentweit einheitliche Größe
- freies Zoomen und Verschieben der Blattansicht; `Esc` wechselt zwischen ganzer Seite und der vorherigen Zoomstufe
- Tabellen, Views und rahmenlose, über vier Eck-Anfasser skalierbare Freitextboxen mit sicherem Markdown und einstellbarem Hintergrund
- weiße Freitextfelder sowie technische Infoblöcke mit Dokument-, Seiten- und Speicherinformationen
- Infoblock-Wiederholung auf allen Seiten oder in Bereichen wie `1-3,5-`, über das Eigenschaften-Accordion konfigurierbar
- Datenbankobjekte im linken Werkzeugbereich: Verbindung und Schema wählen, suchen und einzelne Tabellen oder Views auf die aktive Seite ziehen
- Alias oberhalb des Tabellennamens
- konfigurierbare Spalten, Typen, PKs und FKs
- globale Tabellenfarben und objektbezogene Überschreibungen
- Skalierung einzelner Objekte, einschließlich direkter Eingabe wie `0.95`
- automatische Fremdschlüsselbeziehungen aus JDBC-Metadaten
- manuelle Crow-Foot-Verbinder und XOR-/Entweder-oder-Gruppen
- Verbinder werden ausschließlich per Press–Drag–Release erzeugt; Drop auf einer Tabelle dockt an deren nächster Kante an
- Ctrl/Cmd-Klick auf eine Verbinderstrecke fügt verschiebbare, im PDF erhaltene Routen-Hilfspunkte ein
- PostgreSQL, MariaDB/MySQL, SQL Server, SQLite und H2 eingebaut
- externe JDBC-JARs, beispielsweise Oracle
- optionale SQL-Abfragen für Schema- und Objektauswahl
- versionierte Offline-Snapshots als echte SQLite-Dateien; unveränderte Schemas werden nicht doppelt gespeichert
- editierbare Eridion-PDF und separater sauberer PDF-Export
- PDF-Tooltips für ausgeschriebene, im Diagramm abgekürzte Datentypen (abhängig vom PDF-Viewer)
- native Datei-, Menü- und Credential-Funktionen über Electron
- Ctrl/Cmd-A wählt alle Objekte und Verbinder der aktiven Seite; Ctrl/Cmd-C/X/V bearbeitet Einzel- und Mehrfachauswahlen; Undo/Redo hält 100 Schritte
- eingebettete, reduzierte Java Runtime für den Kotlin/JDBC-Worker

## Projektstruktur

```text
apps/desktop/       Electron Main/Preload und Vue-3-Oberfläche
worker/             Kotlin/JVM-Worker für JDBC und PDF-Anhänge
docs/               Architektur und Dateiformat
```

Die Vue-Oberfläche hat keinen direkten Node.js-Zugriff. Native Funktionen werden ausschließlich über eine schmale Preload-API angesprochen. Der Kotlin-Worker kommuniziert zeilenweise über JSON-RPC auf `stdin/stdout`; es wird kein lokaler Netzwerkport geöffnet.

## Entwicklung

Voraussetzungen für die Entwicklung:

- Node.js 22 oder neuer
- pnpm 10
- JDK 17 oder neuer

```bash
pnpm install
./gradlew :worker:shadowJar
pnpm dev
```

Im Editor werden Datenbanktabellen bewusst nicht gesammelt aus dem Connection-Dialog importiert. Lege dort nur die JDBC-Verbindung an. Anschließend wählst du links unter **Datenbankobjekte** die Verbindung und das Schema, filterst die Liste bei Bedarf und ziehst die gewünschten Tabellen oder Views auf das Blatt. Fremdschlüssel-Verbinder erscheinen automatisch, sobald beide beteiligten Tabellen auf derselben Seite liegen.

Unter **Connections verwalten** kann für eine gespeicherte Verbindung ein benannter Offline-Snapshot erzeugt, umbenannt oder gelöscht werden. Eridion speichert jeden Stand als SQLite-Datei mit Objekten, Spalten, Beziehungen und Prüfsumme. Beim Erzeugen wird das aktuelle Schema mit vorhandenen Ständen verglichen; ohne inhaltliche Änderung entsteht keine weitere Datei. Offline-Snapshots erscheinen anschließend direkt neben den Live-Verbindungen unter **Datenbankobjekte**. Suche und Schemafilter laufen nach dem einmaligen Laden lokal ohne Datenbankzugriff.

Die sichtbare Tabellengröße setzt sich aus drei Reglern zusammen: **Grundskalierung** für das gesamte Dokument, **Tabellenskalierung** für die aktive Seite und **Skalierung** für die einzelne Tabelle. Bei 100 % auf allen drei Ebenen wird eine Tabelle mit dem internen Faktor 0,75 dargestellt. Freitexte und Seitenelemente werden von der Grund- und Seitenskalierung nicht verändert.

Unter **Einfügen** erzeugt **Infoblock** ein technisches Zeichnungsfeld unten rechts. Ein normaler Klick auf den Block öffnet sein Eigenschaften-Segment im linken Accordion. Dort lassen sich Überschrift, ein mehrzeiliges Info-Feld, Bearbeiter und die sichtbaren Systemfelder wählen. **Blatt**, **Seite** und **Stand** stehen gemeinsam in einer dreispaltigen Zeile. Ein leeres Info-Feld wird vollständig ausgeblendet; Breite und Höhe des Blocks passen sich innerhalb sinnvoller Grenzen an den sichtbaren Inhalt an. Nach jedem Verschieben verankert er sich an der nächsten Kante oder Ecke. Seine Randabstände bleiben dadurch auch bei einem Wechsel von Papierformat oder Ausrichtung erhalten. Die Seitengültigkeit kann auf die aktuelle Seite, alle Seiten oder einen Bereich wie `1-3,5-` gesetzt werden; offene Intervalle gelten bis zur letzten Seite.

## Tests und Build

```bash
pnpm test
pnpm typecheck
pnpm build
./gradlew :worker:test :worker:shadowJar :worker:runtimeImage
```

## Plattformpaket

Das Paket muss auf dem jeweiligen Zielbetriebssystem erzeugt werden. Die Deployment-Skripte installieren exakt den Lockfile-Stand, bauen und testen Worker sowie Oberfläche, erzeugen die plattformeigene reduzierte Java-Runtime und starten anschließend `electron-builder`:

```bash
# macOS
./eridionOsxBuild.sh

# Linux
./eridionLinuxBuild.sh
```

Unter Windows kann der Build aus PowerShell oder der Eingabeaufforderung gestartet werden:

```powershell
.\eridionWindowsBuild.ps1
```

```bat
eridionWindowsBuild.cmd
```

Ausgaben:

- macOS: `apps/desktop/dist/*.dmg`
- Windows: `apps/desktop/dist/*.exe`
- Linux: `apps/desktop/dist/*.AppImage` und `*.deb`

Benötigt werden jeweils Node.js 22+, ein JDK 17+ und bevorzugt Corepack. Über das `packageManager`-Feld verwendet Corepack exakt pnpm 10.33.0. Ein zufällig im `PATH` liegender inkompatibler pnpm-Wrapper wird nicht mehr verwendet. Sind die Projektabhängigkeiten bereits vollständig vorhanden, können die Build-Skripte Typecheck, Tests, Vite und electron-builder direkt mit Node ausführen. Die Pakete werden bewusst nativ auf dem Zielbetriebssystem gebaut, da sowohl Electron als auch die mit `jlink` erzeugte Java-Runtime plattformspezifisch sind.

Öffentliche Releases sollten signiert werden. macOS-Pakete müssen zusätzlich notarisiert werden.

## Sicherheit

- Passwörter werden über Electrons `safeStorage` im Betriebssystem-Schlüsselspeicher geschützt.
- Zugangsdaten, JDBC-Treiber und Wallets werden niemals in die PDF eingebettet.
- Externe JDBC-JARs sind ausführbarer Code und dürfen nur aus vertrauenswürdigen Quellen importiert werden.
- Benutzerdefinierte SQL-Abfragen müssen mit `SELECT` oder `WITH` beginnen. Die eigentliche Sicherheitsgrenze bleibt ein Datenbankkonto ohne Schreibrechte.
- „Saubere PDF exportieren“ entfernt das eingebettete Schema- und Layoutmodell für die externe Weitergabe.

Weitere Details stehen in [docs/architecture.md](docs/architecture.md) und [docs/eridion-pdf-format.md](docs/eridion-pdf-format.md).
