# Eridion-PDF-Format 1

## Grundprinzip

Eine Eridion-Arbeitsdatei hat die Erweiterung `.pdf` und bleibt eine regulär darstellbare PDF. Das editierbare Quelldokument liegt als eingebettete Datei im PDF-Katalog.

## Associated File

| Eigenschaft | Wert |
| --- | --- |
| Dateiname | `eridion-document.json` |
| MIME-Type | `application/vnd.eridion.erd+json` |
| `AFRelationship` | `Source` |
| Beschreibung | `Editable Eridion ERD source document` |

Die File Specification wird sowohl in der `EmbeddedFiles` Name Tree als auch im `AF`-Array des Document Catalog registriert.

## XMP-Namespace

Namespace: `https://eridion.app/ns/erd/1.0/`

| Feld | Bedeutung |
| --- | --- |
| `application` | immer `Eridion` |
| `formatVersion` | Version des JSON-Modells |
| `documentId` | stabile UUID des Dokuments |
| `payloadName` | Name des eingebetteten Dokuments |
| `payloadSha256` | SHA-256 über die UTF-8-JSON-Bytes |
| `modifiedAt` | ISO-8601-Zeitpunkt der Einbettung |

## JSON-Wurzel

Pflichtfelder:

```json
{
  "formatVersion": 1,
  "documentId": "UUID",
  "title": "Diagrammtitel",
  "createdAt": "ISO-8601",
  "modifiedAt": "ISO-8601",
  "page": {},
  "styles": {},
  "nodes": [],
  "relationships": []
}
```

Optionale Felder sind `connectionReference` und `schemaSnapshot`. `connectionReference` ist ausschließlich eine lokale ID; Zugangsdaten sind verboten.

## Kompatibilität

- Fehlt der Anhang, behandelt Eridion die Datei als nicht editierbare PDF.
- Ist die Formatversion neuer als die Anwendung, wird die Bearbeitung abgelehnt, ohne die Datei zu verändern.
- Bei älteren Versionen muss vor dem Öffnen eine verlustfreie Migration erfolgen.
- „Drucken als PDF“ und manche Optimierer entfernen den Anhang. Das sichtbare Diagramm bleibt dann erhalten, die Editierbarkeit jedoch nicht.
- Der saubere Export enthält weder Anhang noch Eridion-XMP.

Das Format nutzt die Associated-Files-Mechanik, behauptet in Version 1 jedoch keine vollständige PDF/A-3-Konformität.
