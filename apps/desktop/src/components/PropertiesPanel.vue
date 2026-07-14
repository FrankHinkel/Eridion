<script setup lang="ts">
import { computed } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { Trash2, RotateCcw, Plus } from 'lucide-vue-next'
import { useDocumentState } from '../document-state'
import { infoBlockAnchorLabel } from '../model'
import type { DiagramEdge, DiagramNode, EridionDocument, InfoBlockNodeData, RelationshipAnchor, TableNodeData, TextNodeData } from '../model'

const emit = defineEmits<{ delete: []; deletePage: []; changed: [] }>()
const props = defineProps<{ activePageId: string; mode: 'document' | 'paper' | 'page' | 'selection' }>()
const state = useDocumentState()
const { updateNode } = useVueFlow()
const document = state.document as unknown as { value: EridionDocument }
const node = computed<DiagramNode | undefined>(() => document.value.nodes.find((item) => item.id === state.selectedNodeId.value))
const edge = computed<DiagramEdge | undefined>(() => document.value.relationships.find((item) => item.id === state.selectedEdgeId.value))
const activePage = computed(() => document.value.pages.find((page) => page.id === props.activePageId) ?? document.value.pages[0])

function tableData(value: DiagramNode | undefined): TableNodeData | undefined {
  return value?.data.kind === 'table' ? value.data : undefined
}

function textData(value: DiagramNode | undefined): TextNodeData | undefined {
  return value?.data.kind === 'text' ? value.data : undefined
}

function infoBlockData(value: DiagramNode | undefined): InfoBlockNodeData | undefined {
  return value?.data.kind === 'infoBlock' ? value.data : undefined
}

function relationship(value: DiagramEdge | undefined) {
  return value?.data
}

function anchor(value: DiagramEdge | undefined, end: 'source' | 'target'): RelationshipAnchor {
  const data = relationship(value)!
  const key = end === 'source' ? 'sourceAnchor' : 'targetAnchor'
  data[key] ??= { side: end === 'source' ? 'right' : 'left', position: 0 }
  return data[key]!
}

function changed() {
  state.changed()
  emit('changed')
}

function anchorChanged(value: DiagramEdge, end: 'source' | 'target') {
  const edited = anchor(value, end)
  edited.columnId = undefined
  edited.columnOffset = undefined
  changed()
}

function setNodeLocked(locked: boolean) {
  const selected = node.value
  if (!selected) return
  selected.draggable = !locked
  updateNode(selected.id, { draggable: !locked })
  changed()
}

function resetTableStyle() {
  const data = tableData(node.value)
  if (!data) return
  data.color = undefined
  data.headerColor = undefined
  data.showTypes = undefined
  data.showIcons = undefined
  changed()
}

function addColumn() {
  const data = tableData(node.value)
  if (!data) return
  data.columns.push({
    id: crypto.randomUUID(),
    name: `SPALTE_${data.columns.length + 1}`,
    typeName: 'VARCHAR(255)',
    nullable: true,
    primaryKey: false,
    foreignKey: false
  })
  changed()
}

function resetLabelPosition() {
  const data = relationship(edge.value)
  if (!data) return
  data.labelOffsetX = 0
  data.labelOffsetY = 0
  changed()
}

function resetRoutePosition() {
  const data = relationship(edge.value)
  if (!data) return
  data.routeOffsetX = 0
  data.routeOffsetY = 0
  data.routePoints = []
  data.routeSectionOffsets = []
  changed()
}

function setTextBackgroundColor(event: Event) {
  const data = textData(node.value)
  if (!data) return
  data.backgroundColor = (event.target as HTMLInputElement).value
  changed()
}

function setTextBackgroundTransparent(transparent: boolean) {
  const data = textData(node.value)
  if (!data) return
  data.backgroundColor = transparent ? 'transparent' : '#ffffff'
  changed()
}

function setTextMarkdown(enabled: boolean) {
  const data = textData(node.value)
  if (!data) return
  data.markdown = enabled
  changed()
}

function removeColumn(id: string) {
  const data = tableData(node.value)
  if (!data) return
  data.columns = data.columns.filter((column) => column.id !== id)
  changed()
}
</script>

<template>
  <div class="properties-panel">
    <template v-if="mode === 'selection' && node && tableData(node)">
      <div class="panel-title"><span>Tabelle</span><button class="icon-button" title="Objekt löschen" @click="emit('delete')"><Trash2 :size="16" /></button></div>
      <label class="checkbox"><input :checked="node.draggable === false" type="checkbox" @change="setNodeLocked(($event.target as HTMLInputElement).checked)" /> Objekt fixieren</label>
      <label>Alias<input v-model="tableData(node)!.alias" placeholder="Optionaler Anzeigename" @input="changed" /></label>
      <label>Tabellenname<input v-model="tableData(node)!.name" @input="changed" /></label>
      <label>Schema<input v-model="tableData(node)!.schema" @input="changed" /></label>
      <label>Skalierung {{ Math.round(tableData(node)!.scale * 100) }}%<input v-model.number="tableData(node)!.scale" type="range" min="0.5" max="1.5" step="0.05" @input="changed" /></label>
      <label>Direkte Skalierung<input v-model.number="tableData(node)!.scale" type="number" min="0.25" max="2" step="0.01" @input="changed" /></label>
      <label>Tabellenfarbe<input v-model="tableData(node)!.color" type="color" @input="changed" /></label>
      <label>Kopffarbe<input v-model="tableData(node)!.headerColor" type="color" @input="changed" /></label>
      <label>Datentypen<select v-model="tableData(node)!.showTypes" @change="changed"><option :value="undefined">Dokumentstandard</option><option :value="true">Anzeigen</option><option :value="false">Ausblenden</option></select></label>
      <label>PK-/FK-Symbole<select v-model="tableData(node)!.showIcons" @change="changed"><option :value="undefined">Dokumentstandard</option><option :value="true">Anzeigen</option><option :value="false">Ausblenden</option></select></label>
      <div class="subsection-title"><strong>Spalten</strong><button class="icon-button" title="Spalte hinzufügen" @click="addColumn"><Plus :size="15" /></button></div>
      <div v-for="column in tableData(node)!.columns" :key="column.id" class="column-editor">
        <div><input v-model="column.name" aria-label="Spaltenname" @input="changed" /><input v-model="column.typeName" aria-label="Datentyp" @input="changed" /></div>
        <label class="checkbox"><input v-model="column.primaryKey" type="checkbox" @change="changed" /> PK</label>
        <label class="checkbox"><input v-model="column.foreignKey" type="checkbox" @change="changed" /> FK</label>
        <label class="checkbox"><input v-model="column.nullable" type="checkbox" @change="changed" /> NULL</label>
        <button class="icon-button danger-icon" title="Spalte löschen" @click="removeColumn(column.id)"><Trash2 :size="13" /></button>
      </div>
      <button class="secondary" @click="resetTableStyle"><RotateCcw :size="15" /> Objektstil zurücksetzen</button>
    </template>
    <template v-else-if="mode === 'selection' && node && textData(node)">
      <div class="panel-title"><span>Freitext</span><button class="icon-button" title="Objekt löschen" @click="emit('delete')"><Trash2 :size="16" /></button></div>
      <label class="checkbox"><input :checked="node.draggable === false" type="checkbox" @change="setNodeLocked(($event.target as HTMLInputElement).checked)" /> Objekt fixieren</label>
      <label>Markdown-Quelle<textarea v-model="textData(node)!.text" rows="4" @input="changed" /></label>
      <label class="checkbox"><input :checked="textData(node)!.markdown !== false" type="checkbox" @change="setTextMarkdown(($event.target as HTMLInputElement).checked)" /> Markdown formatieren</label>
      <label>Ausrichtung<select v-model="textData(node)!.textAlign" @change="changed"><option value="left">Linksbündig</option><option value="center">Zentriert</option><option value="right">Rechtsbündig</option></select></label>
      <label>Schriftgröße<input v-model.number="textData(node)!.fontSize" type="number" min="8" max="72" @input="changed" /></label>
      <label>Skalierung {{ Math.round(textData(node)!.scale * 100) }}%<input v-model.number="textData(node)!.scale" type="range" min="0.5" max="1.5" step="0.05" @input="changed" /></label>
      <label>Textfarbe<input v-model="textData(node)!.color" type="color" @input="changed" /></label>
      <label>Hintergrundfarbe<input :value="textData(node)!.backgroundColor === 'transparent' ? '#ffffff' : (textData(node)!.backgroundColor || '#ffffff')" type="color" :disabled="textData(node)!.backgroundColor === 'transparent'" @input="setTextBackgroundColor" /></label>
      <label class="checkbox"><input :checked="textData(node)!.backgroundColor === 'transparent'" type="checkbox" @change="setTextBackgroundTransparent(($event.target as HTMLInputElement).checked)" /> Transparenter Hintergrund</label>
      <div class="form-grid compact-grid">
        <label>Breite<input v-model.number="textData(node)!.width" type="number" min="60" step="1" placeholder="Automatisch" @input="changed" /></label>
        <label>Höhe<input v-model.number="textData(node)!.height" type="number" min="30" step="1" placeholder="Automatisch" @input="changed" /></label>
      </div>
      <p class="hint"><strong>Doppelklick auf den Text</strong> öffnet den WYSIWYG-Editor direkt im Objekt. Platzhalter: {TAB}, {PAGE}, {PAGES}, {DATE}, {TIME}, {DATETIME}, {DOCUMENT}. Die vier Eck-Anfasser ändern Breite und Höhe.</p>
    </template>
    <template v-else-if="mode === 'selection' && node && infoBlockData(node)">
      <div class="panel-title"><span>Infoblock</span><button class="icon-button" title="Objekt löschen" @click="emit('delete')"><Trash2 :size="16" /></button></div>
      <label class="checkbox"><input :checked="node.draggable === false" type="checkbox" @change="setNodeLocked(($event.target as HTMLInputElement).checked)" /> Objekt fixieren</label>
      <p class="hint">Ein normaler Klick auf den Infoblock öffnet diese Einstellungen. Nach dem Verschieben wird der Block automatisch an der nächsten Kante oder Ecke verankert.</p>
      <p class="anchor-status"><strong>Verankerung:</strong> {{ infoBlockAnchorLabel(infoBlockData(node)!.anchor) }}</p>
      <label>Titelzeile<input v-model="infoBlockData(node)!.heading" @input="changed" /></label>
      <label>Info-Feld<textarea v-model="infoBlockData(node)!.infoText" rows="4" placeholder="Mehrzeiliger Freitext; leer wird das Feld ausgeblendet" @input="changed" /></label>
      <label>Bearbeiter<input v-model="infoBlockData(node)!.author" placeholder="Optional" @input="changed" /></label>
      <label>Skalierung {{ Math.round(infoBlockData(node)!.scale * 100) }}%<input v-model.number="infoBlockData(node)!.scale" type="range" min="0.5" max="1.5" step="0.05" @input="changed" /></label>
      <label>Seitengültigkeit<select v-model="infoBlockData(node)!.repeatMode" @change="changed"><option value="current">Nur diese Seite</option><option value="all">Automatisch auf allen Seiten</option><option value="range">Bestimmte Seiten</option></select></label>
      <label v-if="infoBlockData(node)!.repeatMode === 'range'">Seitenbereiche<input v-model="infoBlockData(node)!.pageRange" placeholder="1-3,5-" @input="changed" /><small class="field-help">Beispiel: 1-3,5- zeigt Seite 1 bis 3 sowie ab Seite 5.</small></label>
      <div class="subsection-title"><strong>Angezeigte Felder</strong></div>
      <label class="checkbox"><input v-model="infoBlockData(node)!.showDocumentName" type="checkbox" @change="changed" /> Dokumentname</label>
      <label class="checkbox"><input v-model="infoBlockData(node)!.showPageName" type="checkbox" @change="changed" /> Seitenname</label>
      <label class="checkbox"><input v-model="infoBlockData(node)!.showPageNumber" type="checkbox" @change="changed" /> Seite x / y</label>
      <label class="checkbox"><input v-model="infoBlockData(node)!.showSavedAt" type="checkbox" @change="changed" /> Datum und Uhrzeit des Speicherns</label>
      <label class="checkbox"><input v-model="infoBlockData(node)!.showInfo" type="checkbox" @change="changed" /> Info-Feld</label>
      <label class="checkbox"><input v-model="infoBlockData(node)!.showAuthor" type="checkbox" @change="changed" /> Bearbeiter</label>
      <label class="checkbox"><input v-model="infoBlockData(node)!.showDocumentId" type="checkbox" @change="changed" /> Dokument-ID</label>
    </template>
    <template v-else-if="mode === 'selection' && edge && relationship(edge)">
      <div class="panel-title"><span>Beziehung</span><button class="icon-button" title="Beziehung löschen" @click="emit('delete')"><Trash2 :size="16" /></button></div>
      <label>Beschriftung<input v-model="relationship(edge)!.label" @input="changed" /></label>
      <div class="form-grid compact-grid">
        <label>Label X<input v-model.number="relationship(edge)!.labelOffsetX" type="number" step="1" placeholder="0" @input="changed" /></label>
        <label>Label Y<input v-model.number="relationship(edge)!.labelOffsetY" type="number" step="1" placeholder="0" @input="changed" /></label>
      </div>
      <button class="secondary" @click="resetLabelPosition"><RotateCcw :size="15" /> Label am Anker ausrichten</button>
      <label>Linienführung<select v-model="relationship(edge)!.routeType" @change="changed"><option value="smoothstep">Smart-Step</option><option value="step">Step (rechtwinklig)</option><option value="bezier">Bezier</option><option value="straight">Gerade</option></select></label>
      <div class="form-grid compact-grid">
        <label>Route X<input v-model.number="relationship(edge)!.routeOffsetX" type="number" step="1" placeholder="0" @input="changed" /></label>
        <label>Route Y<input v-model.number="relationship(edge)!.routeOffsetY" type="number" step="1" placeholder="0" @input="changed" /></label>
      </div>
      <button class="secondary" @click="resetRoutePosition"><RotateCcw :size="15" /> Automatische Route</button>
      <p class="hint">Ctrl/Cmd-Klick auf die Linie fügt einen Hilfspunkt ein. Gerade Abschnitte am Hilfspunkt verschieben ihn mit; äußere Abschnitte und das Quadrat lassen sich separat ziehen. Doppelklick entfernt den Hilfspunkt.</p>
      <div class="form-grid compact-grid">
        <label>Quelle<select v-model="relationship(edge)!.sourceCardinality" @change="changed"><option>0..1</option><option>1</option><option>0..n</option><option>1..n</option></select></label>
        <label>Ziel<select v-model="relationship(edge)!.targetCardinality" @change="changed"><option>0..1</option><option>1</option><option>0..n</option><option>1..n</option></select></label>
      </div>
      <label class="checkbox"><input v-model="relationship(edge)!.optional" type="checkbox" @change="changed" /> Optionaler FK (gestrichelte Linie)</label>
      <fieldset class="anchor-editor">
        <legend>Quellanschluss</legend>
        <label>Seite<select v-model="anchor(edge, 'source').side" @change="anchorChanged(edge, 'source')"><option value="top">Oben</option><option value="right">Rechts</option><option value="bottom">Unten</option><option value="left">Links</option></select></label>
        <label>Position <output>{{ anchor(edge, 'source').position.toFixed(2) }}</output><input v-model.number="anchor(edge, 'source').position" type="range" min="-1" max="1" step="0.01" @input="anchorChanged(edge, 'source')" /></label>
        <label>Direkte Position<input v-model.number="anchor(edge, 'source').position" type="number" min="-1" max="1" step="0.01" @input="anchorChanged(edge, 'source')" /></label>
      </fieldset>
      <fieldset class="anchor-editor">
        <legend>Zielanschluss</legend>
        <label>Seite<select v-model="anchor(edge, 'target').side" @change="anchorChanged(edge, 'target')"><option value="top">Oben</option><option value="right">Rechts</option><option value="bottom">Unten</option><option value="left">Links</option></select></label>
        <label>Position <output>{{ anchor(edge, 'target').position.toFixed(2) }}</output><input v-model.number="anchor(edge, 'target').position" type="range" min="-1" max="1" step="0.01" @input="anchorChanged(edge, 'target')" /></label>
        <label>Direkte Position<input v-model.number="anchor(edge, 'target').position" type="number" min="-1" max="1" step="0.01" @input="anchorChanged(edge, 'target')" /></label>
      </fieldset>
      <label>Entweder-oder-Gruppe<input v-model="relationship(edge)!.xorGroup" placeholder="z. B. XOR-1" @input="changed" /></label>
      <label>Linienfarbe<input v-model="relationship(edge)!.color" type="color" @input="changed" /></label>
      <p v-if="relationship(edge)!.imported" class="hint">Diese Beziehung wurde aus einem Fremdschlüssel importiert.</p>
    </template>
    <template v-else-if="mode === 'paper'">
      <div class="panel-title">Papierformat</div>
      <div class="form-grid page-format-grid">
        <label>Format<select v-model="state.document.value.page.format" @change="changed"><option value="A0">A0</option><option value="A1">A1</option><option value="A2">A2</option><option value="A3">A3</option><option value="A4">A4</option><option value="A5">A5</option><option value="A6">A6</option><option value="Letter">Letter</option><option value="Legal">Legal</option></select></label>
        <label>Ausrichtung<select v-model="state.document.value.page.orientation" @change="changed"><option value="landscape">Querformat</option><option value="portrait">Hochformat</option></select></label>
      </div>
      <div class="form-grid compact-grid">
        <label>Rand links (mm)<input v-model.number="state.document.value.page.marginLeftMm" type="number" min="0" max="100" step="1" @input="changed" /></label>
        <label>Rand rechts (mm)<input v-model.number="state.document.value.page.marginRightMm" type="number" min="0" max="100" step="1" @input="changed" /></label>
        <label>Rand oben (mm)<input v-model.number="state.document.value.page.marginTopMm" type="number" min="0" max="100" step="1" @input="changed" /></label>
        <label>Rand unten (mm)<input v-model.number="state.document.value.page.marginBottomMm" type="number" min="0" max="100" step="1" @input="changed" /></label>
      </div>
      <label class="checkbox"><input v-model="state.document.value.page.showPageNumbers" type="checkbox" @change="changed" /> Seitenzahlen drucken</label>
      <p class="field-help">Die grauen Randflächen dienen nur als Editor-Hilfe und werden nicht gedruckt.</p>
    </template>
    <template v-else-if="mode === 'document'">
      <div class="panel-title">Dokument</div>
      <label>Titel<input v-model="state.document.value.title" @input="changed" /></label>
      <strong>Standarddarstellung</strong>
      <label>Grundskalierung {{ Math.round(state.document.value.styles.baseScale * 100) }}%<input v-model.number="state.document.value.styles.baseScale" type="range" min="0.1" max="2" step="0.05" @input="changed" /></label>
      <label>Tabellenfarbe<input v-model="state.document.value.styles.tableColor" type="color" @input="changed" /></label>
      <label>Kopffarbe<input v-model="state.document.value.styles.tableHeaderColor" type="color" @input="changed" /></label>
      <label>Verbinderfarbe<input v-model="state.document.value.styles.relationshipColor" type="color" @input="changed" /></label>
      <label class="checkbox"><input v-model="state.document.value.styles.showTypes" type="checkbox" @change="changed" /> Datentypen anzeigen</label>
      <label class="checkbox"><input v-model="state.document.value.styles.showIcons" type="checkbox" @change="changed" /> PK-/FK-Symbole anzeigen</label>
    </template>
    <template v-else-if="mode === 'page'">
      <div class="panel-title"><span>Seite</span><button v-if="state.document.value.pages.length > 1" class="icon-button" title="Seite löschen" @click="emit('deletePage')"><Trash2 :size="16" /></button></div>
      <label>Name<input v-model="activePage.name" @input="changed" /></label>
      <label>Tabellenskalierung {{ Math.round(activePage.tableScale * 100) }}%<input v-model.number="activePage.tableScale" type="range" min="0.1" max="2" step="0.05" @input="changed" /></label>
    </template>
    <template v-else>
      <div class="panel-title">Objekt</div>
      <p class="hint">Wähle eine Tabelle, einen Freitext oder eine Beziehung aus.</p>
    </template>
  </div>
</template>
