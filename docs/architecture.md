# Architektur

## Prozesse

Eridion besteht zur Laufzeit aus drei Sicherheitszonen:

1. **Vue Renderer** – Benutzeroberfläche, Vue Flow und Dokumentzustand
2. **Electron Main/Preload** – native Dialoge, Dateien, PDF-Rendering, Credential Store und Prozesssteuerung
3. **Kotlin Worker** – JDBC-Treiber, Datenbankmetadaten und PDF-Einbettung

Der Renderer läuft mit `sandbox: true`, `contextIsolation: true` und ohne `nodeIntegration`. Die Preload-API stellt nur benannte Operationen bereit. Der Worker verwendet JSON-RPC über Standard-Ein- und -Ausgabe, sodass keine offenen Ports und keine CORS-Konfiguration erforderlich sind.

## PDF-Speicherweg

1. Das Dokumentmodell wird als versioniertes JSON serialisiert.
2. Vue erzeugt eine eigenständige Druckansicht mit den eingestellten Seitengrößen.
3. Electron/Chromium rendert die Druckansicht als Vektor-PDF.
4. Der Kotlin-Worker öffnet das PDF mit PDFBox.
5. Das JSON wird als `eridion-document.json` eingebettet und als `Source` assoziiert.
6. XMP enthält Formatversion, Dokument-ID, Payload-Name und SHA-256.
7. Die fertige Datei ersetzt das Ziel erst, nachdem alle Schritte erfolgreich waren.

## JDBC

Integrierte Treiber werden aus dem Worker-Classpath geladen. Externe Treiber erhalten einen eigenen `URLClassLoader`, wodurch verschiedene Treiberversionen nicht in denselben Klassenraum geladen werden. Das ist eine Konfliktisolation, keine Ausführungssandbox.

Die Standard-Introspektion verwendet `DatabaseMetaData`:

- `getTables`
- `getColumns`
- `getPrimaryKeys`
- `getImportedKeys`

Eine optionale Objektabfrage muss mindestens `TABLE_NAME` zurückgeben. Unterstützte Aliase sind `TABLE_CATALOG`, `TABLE_SCHEMA`, `TABLE_TYPE` und `REMARKS`.

## Seitenmodell

Ein Dokument enthält eine explizite Liste benannter Seiten. Jede Tabelle, jeder Text und jede Beziehung gehört zu genau einer dieser Seiten. Die Oberfläche zeigt sie als Tabs; weitere Seiten entstehen über den `+`-Tab oder durch Ctrl/Cmd-Ziehen eines vorhandenen Tabs. Beim Duplizieren werden seitenlokale Objekte und interne Beziehungen mit neuen IDs kopiert; dokumentweit wiederholte Infoblöcke gelten ohnehin automatisch für die neue Seite. Die Reihenfolge der Seiten und damit auch die PDF-Seitenfolge kann durch Ziehen der Tabs geändert werden.

Dokumentänderungen werden nach jeder abgeschlossenen Editoraktion als Verlaufspunkt erfasst. Der Verlauf hält maximal 100 vollständige Dokumentzustände und wird bei einer neuen Änderung nach einem Undo auf dem neuen Zweig fortgesetzt. Ctrl/Cmd-A markiert alle Knoten und Beziehungen der aktiven Seite. Ctrl/Cmd-C/X/V verwendet eine interne Eridion-Zwischenablage für Einzel- oder Mehrfachauswahlen aus Tabellen, Freitexten, Infoblöcken und Beziehungen; in Texteingabefeldern bleiben dieselben Kürzel native Textoperationen.

## Offline-Snapshots

Schema-Snapshots werden als eigenständige SQLite-Dateien im lokalen Anwendungsdatenverzeichnis abgelegt. Neben einem vollständigen serialisierten Payload enthalten sie normalisierte Tabellen für Objekte, Spalten und Beziehungen sowie Verbindungsreferenz, Zeitpunkte und einen SHA-256-Inhaltshash. Der Hash ignoriert ausschließlich den Importzeitpunkt. Dadurch legt **Snapshot erzeugen** nur dann einen neuen Stand an, wenn sich das eigentliche Datenbankschema geändert hat. Ein geladener Snapshot wird im Renderer lokal nach Schema und Suchtext gefiltert; dazu ist keine JDBC-Verbindung erforderlich.

Das Blatt behält immer die Abmessungen und das Seitenverhältnis des gewählten Formats:

- A0 bis A6
- Letter
- Legal
- jeweils Hoch- oder Querformat

Der papierformatabhängige Vue-Flow-Viewport wird beim Seitenwechsel sowie bei Änderungen an Format oder Ausrichtung auf die ganze Seite gesetzt. Einfügen, Verschieben und Skalieren von Objekten verändern den aktuellen Zoom dagegen nicht. Mausrad, Touchpad und Toolbar vergrößern oder verkleinern das komplette Papier samt Rahmen; es gibt keinen unabhängigen Inhaltszoom innerhalb des Blatts. Die vergrößerte Seite kann im Arbeitsbereich verschoben werden. `Esc` schaltet zwischen der Ganzseitenansicht und dem zuvor verwendeten Ausschnitt um.

Die Größe einer Tabelle entsteht aus drei unabhängigen Faktoren:

1. dokumentweite Grundskalierung,
2. Tabellenskalierung der Seite,
3. Skalierung des einzelnen Tabellenobjekts.

Alle Regler stehen standardmäßig auf 100 %. Zusätzlich wird intern der feste Kompaktfaktor 0,75 angewendet. Dadurch entspricht die neue 100-%-Darstellung 75 % der früheren Darstellung. Freitexte, Überschriften und Seitenzahlen verwenden weder die Dokument-Grundskalierung noch die Seitenskalierung. Dieselben Faktoren werden im Editor und beim PDF-Export verwendet.

Freitexte sind rahmenlose Boxen mit persistierter Breite und Höhe. Vier Eck-Anfasser verändern beide Dimensionen; das Ziehen einer linken oder oberen Ecke korrigiert zugleich die Objektposition, sodass die gegenüberliegende Ecke stehen bleibt. Hintergrundfarben können deckend oder transparent sein. Ein gemeinsamer sicherer Markdown-Renderer wird im Editor und in der PDF-Druckansicht verwendet. Unterstützt werden Überschriften, Hervorhebungen, Inline- und Block-Code, Listen, Zitate und HTTP(S)- beziehungsweise Mail-Links. Eingebettetes HTML und ausführbare Link-Schemata werden nicht zugelassen.

## Verbinderinteraktion

Manuelle Beziehungen entstehen in genau einer Pointer-Geste: Pointer-Down auf dem aktuell angebotenen Fangpunkt, Ziehen und Pointer-Up über einem Fangpunkt oder einer anderen Tabelle. Ein Drop auf der Tabellenfläche wird auf die geometrisch nächste Tabellenkante projiziert. Jeder Pointer-Up beendet den Entwurf; ungültige Drops hinterlassen keinen gespeicherten Quellpunkt. Während des Ziehens zeigt eine gestrichelte Vorschau die geplante Verbindung.

Die sichtbare Verbinderroute besitzt im Editor eine 32 Pixel breite unsichtbare Trefferfläche. Beim Hover wird sie leicht hervorgehoben und kann als Ganzes verschoben werden. Ctrl/Cmd-Klick auf diese Strecke fügt einen persistenten Hilfspunkt in das geometrisch nächste Routensegment ein. Hilfspunkte sind ziehbar, werden per Doppelklick entfernt und überschreiben die automatische Linienführung mit einer expliziten Teilstrecke. Editor und PDF verwenden dafür dieselben gespeicherten Punkte und denselben Pfadgenerator.

## Infoblock

Ein Infoblock wird als einzelne Dokumentvorlage gespeichert. Abhängig von seiner Seitengültigkeit erzeugt der Editor beim Anzeigen einer Seite eine virtuelle Darstellung derselben Vorlage. Unterstützt werden die aktuelle Seite, alle Seiten und Bereiche mit Einzelwerten, geschlossenen oder offenen Intervallen, beispielsweise `1-3,5-`. Position, Gestaltung und Feldwahl bleiben dadurch dokumentweit konsistent, während Seitenname und `Seite x / y` für jede Seite dynamisch berechnet werden. Das technische Raster verwendet eine gemeinsame Zeile für Blatt, Seite und Stand. Die Blockbreite wird aus den sichtbaren Feldwerten und der längsten Info-Zeile berechnet; explizite und notwendige Umbrüche bestimmen zusätzlich die Höhe. Leere Info-Felder erzeugen keine Rasterzeile. Nach dem Verschieben wird aus den Abständen zur Papierbegrenzung automatisch die nächste Kante oder Ecke gewählt. Bei Format-, Ausrichtungs- und Inhaltsänderungen wird die Position aus dieser Verankerung rekonstruiert. Die PDF-Druckansicht verwendet dieselbe Seitenfilterung, Größe, Position und den tatsächlichen Speicherzeitpunkt.
