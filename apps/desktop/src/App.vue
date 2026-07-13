<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { VueFlow, useVueFlow, type Connection, type NodeDragEvent } from '@vue-flow/core'
import {
  ChevronDown, Database, FileText, Lock,
  SlidersHorizontal, Table2, TextCursorInput, UploadCloud, Plus, X, PanelTop, Info, RectangleHorizontal
} from 'lucide-vue-next'
import TableNode from './components/TableNode.vue'
import TextNode from './components/TextNode.vue'
import InfoBlockNode from './components/InfoBlockNode.vue'
import CrowFootEdge from './components/CrowFootEdge.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import ConnectionManager from './components/ConnectionManager.vue'
import DatabasePalette from './components/DatabasePalette.vue'
import { useDocumentState } from './document-state'
import {
  addSchemaTableToPage, alignNodeToNearbyObjects, captureInfoBlockAnchor, createPage, deletePage as deleteDocumentPage, duplicatePage, movePageToTarget, newDocument, nodesForPage, pageDimensions, pageMargins, pageViewportScale,
  parseDocument, parseSnapAnchor, positionAllInfoBlocksFromAnchors, positionInfoBlockFromAnchor, serializeDocument, snapTablePositionToPageGrid, storedNodeId, TABLE_BASE_RENDER_SCALE, type DiagramEdge, type DiagramNode,
  type DiagramPage, type EridionDocument, type ObjectAlignmentGuide, type SchemaSnapshot
} from './model'
import { buildPdfTooltips, buildPrintHtml } from './print'
import { RELATIONSHIP_ROUTE_GRID } from './relationship-path'
import { isEditableKeyboardTarget } from './keyboard-target'
import { resolveFlowSelection } from './selection'

const state = useDocumentState()
const currentDocument = state.document as unknown as { value: EridionDocument }
const { addSelectedElements, getEdges, getNodes, getSelectedEdges, getSelectedNodes, removeSelectedElements, screenToFlowCoordinate, setViewport, updateNode } = useVueFlow()
const connectionManagerOpen = ref(false)
const connectionRefreshKey = ref(0)
const alignmentGuides = ref<ObjectAlignmentGuide[]>([])
const paletteSnapshot = ref<SchemaSnapshot>()
const paletteConnectionId = ref('')
const busy = ref(false)
const status = ref('Bereit')
const activePageId = ref(currentDocument.value.pages[0].id)
const editingPageId = ref<string>()
const draggingPageId = ref<string>()
const pageDragCopy = ref(false)
const modifierPressed = ref(false)
let objectClipboard: { nodes: DiagramNode[]; edges: DiagramEdge[] } | undefined
const clonePlain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
type PaletteSection = 'insert' | 'database' | 'document' | 'paper' | 'page' | 'properties'
const paletteSection = ref<PaletteSection | undefined>('database')
const manuallyOpenedPaletteSection = ref<PaletteSection>()
const pageStage = ref<HTMLElement>()
const pageSheet = ref<HTMLElement>()
const sheetBaseWidth = ref(640)
const sheetBaseHeight = ref(452)
const pageViewZoom = ref(1)
const pageViewPanX = ref(0)
const pageViewPanY = ref(0)
const previousPageView = ref<{ zoom: number; panX: number; panY: number }>()
const panStart = ref<{ clientX: number; clientY: number; panX: number; panY: number }>()
const panning = ref(false)

const activePage = computed<DiagramPage>(() => currentDocument.value.pages.find((page) => page.id === activePageId.value) ?? currentDocument.value.pages[0])
const activeNodes = computed(() => nodesForPage(currentDocument.value, activePageId.value))
const activeNodeIds = computed(() => new Set(activeNodes.value.map((node) => node.id)))
const activeEdges = computed(() => currentDocument.value.relationships.filter((edge) => activeNodeIds.value.has(edge.source) && activeNodeIds.value.has(edge.target)))
const selectedDatabaseTable = computed(() => {
  const node = activeNodes.value.find((candidate) => candidate.id === state.selectedNodeId.value)
  return node?.data.kind === 'table' ? { schema: node.data.schema, name: node.data.name } : undefined
})
const currentPageDatabaseTables = computed(() => activeNodes.value.flatMap((node) => node.data.kind === 'table'
  ? [{ schema: node.data.schema, name: node.data.name }]
  : []))
const otherPageDatabaseTables = computed(() => currentDocument.value.nodes.flatMap((node) =>
  node.pageId !== activePageId.value && node.data.kind === 'table'
    ? [{ schema: node.data.schema, name: node.data.name }]
    : []
))
const currentPageDimensions = computed(() => pageDimensions(currentDocument.value.page))
const pageGridColumns = computed(() => Math.max(1, Math.round(currentPageDimensions.value.width / 20)))
const pageGridRows = computed(() => Math.max(1, Math.round(currentPageDimensions.value.height / 20)))
const pageSheetStyle = computed(() => {
  const dimensions = currentPageDimensions.value
  const margins = pageMargins(currentDocument.value.page)
  return {
    '--page-ratio': dimensions.ratio,
    '--paper-margin-top': `${Math.min(100, margins.top / dimensions.heightMm * 100)}%`,
    '--paper-margin-right': `${Math.min(100, margins.right / dimensions.widthMm * 100)}%`,
    '--paper-margin-bottom': `${Math.min(100, margins.bottom / dimensions.heightMm * 100)}%`,
    '--paper-margin-left': `${Math.min(100, margins.left / dimensions.widthMm * 100)}%`,
    aspectRatio: String(dimensions.ratio),
    width: `${sheetBaseWidth.value * pageViewZoom.value}px`,
    height: `${sheetBaseHeight.value * pageViewZoom.value}px`,
    transform: `translate(-50%, -50%) translate(${pageViewPanX.value}px, ${pageViewPanY.value}px)`,
    backgroundImage: 'radial-gradient(circle at 0 0, #d7dee9 1px, transparent 1.2px)',
    backgroundSize: `${100 / pageGridColumns.value}% ${100 / pageGridRows.value}%`,
    backgroundPosition: '0 0'
  }
})
const selectedPropertiesLabel = computed(() => {
  const selectedCount = getSelectedNodes.value.length + getSelectedEdges.value.length
  if (selectedCount > 1) return `${selectedCount} Objekte`
  if (state.selectedEdgeId.value) return 'Beziehung'
  const selected = currentDocument.value.nodes.find((node) => node.id === state.selectedNodeId.value)
  if (selected?.data.kind === 'table') return 'Tabelle'
  if (selected?.data.kind === 'text') return 'Freitext'
  if (selected?.data.kind === 'infoBlock') return 'Infoblock'
  return 'Objekt'
})
const hasSelection = computed(() => Boolean(state.selectedNodeId.value || state.selectedEdgeId.value || getSelectedNodes.value.length || getSelectedEdges.value.length))
const hasPropertySelection = computed(() => Boolean(state.selectedNodeId.value || state.selectedEdgeId.value))
const pageDescription = computed(() => `${currentDocument.value.page.format} ${currentDocument.value.page.orientation === 'landscape' ? 'quer' : 'hoch'}`)
const documentMetrics = computed(() => {
  const nodes = currentDocument.value.nodes
  return `${currentDocument.value.pages.length} Seiten · ${nodes.length} Objekte · ${currentDocument.value.relationships.length} Beziehungen · Tabellen ${Math.round(activePage.value.tableScale * 100)} %`
})
function markChanged(message = 'Geändert') {
  state.changed()
  status.value = message
}

function togglePaletteSection(section: PaletteSection) {
  if (paletteSection.value === section) {
    paletteSection.value = undefined
    manuallyOpenedPaletteSection.value = undefined
    return
  }
  paletteSection.value = section
  manuallyOpenedPaletteSection.value = section
}

function openPaletteAutomatically(section: PaletteSection) {
  if (!manuallyOpenedPaletteSection.value) paletteSection.value = section
}

function applyBaseViewport() {
  nextTick(() => requestAnimationFrame(() => {
    const sheet = pageSheet.value
    if (!sheet) return
    const scale = pageViewportScale(currentDocument.value.page, sheet.clientWidth, sheet.clientHeight)
    setViewport({ x: 0, y: 0, zoom: scale }, { duration: 0 })
  }))
}

function updateSheetBaseSize() {
  const stage = pageStage.value
  if (!stage) return
  const availableWidth = Math.max(1, stage.clientWidth - 48)
  const availableHeight = Math.max(1, stage.clientHeight - 48)
  const ratio = currentPageDimensions.value.ratio
  sheetBaseWidth.value = Math.min(availableWidth, availableHeight * ratio)
  sheetBaseHeight.value = sheetBaseWidth.value / ratio
  applyBaseViewport()
}

function resetPageView() {
  pageViewZoom.value = 1
  pageViewPanX.value = 0
  pageViewPanY.value = 0
  previousPageView.value = undefined
  updateSheetBaseSize()
}

function setPageZoom(nextZoom: number, clientX?: number, clientY?: number) {
  const stage = pageStage.value
  const oldZoom = pageViewZoom.value
  const next = Math.max(0.25, Math.min(4, nextZoom))
  if (!stage || Math.abs(next - oldZoom) < 0.0001) return
  const rect = stage.getBoundingClientRect()
  const originX = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2
  const originY = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2
  const ratio = next / oldZoom
  pageViewPanX.value += (1 - ratio) * (originX - pageViewPanX.value)
  pageViewPanY.value += (1 - ratio) * (originY - pageViewPanY.value)
  pageViewZoom.value = next
  applyBaseViewport()
  status.value = `Blattansicht ${Math.round(next * 100)} %`
}

function zoomPageBy(factor: number) {
  setPageZoom(pageViewZoom.value * factor)
}

function onPageWheel(event: WheelEvent) {
  const factor = Math.exp(-event.deltaY * 0.0015)
  setPageZoom(pageViewZoom.value * factor, event.clientX, event.clientY)
}

function onStagePointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  if (target.closest('.vue-flow__node, .vue-flow__edge, .snap-point, .edge-label, button, input, select, textarea')) return
  clearSelection()
  panStart.value = {
    clientX: event.clientX,
    clientY: event.clientY,
    panX: pageViewPanX.value,
    panY: pageViewPanY.value
  }
  pageStage.value?.setPointerCapture(event.pointerId)
}

function onStagePointerMove(event: PointerEvent) {
  const start = panStart.value
  if (!start) return
  const deltaX = event.clientX - start.clientX
  const deltaY = event.clientY - start.clientY
  if (!panning.value && Math.hypot(deltaX, deltaY) < 3) return
  panning.value = true
  pageViewPanX.value = start.panX + deltaX
  pageViewPanY.value = start.panY + deltaY
}

function onStagePointerUp(event: PointerEvent) {
  if (pageStage.value?.hasPointerCapture(event.pointerId)) pageStage.value.releasePointerCapture(event.pointerId)
  panStart.value = undefined
  panning.value = false
}

function togglePageZoom() {
  const isWholePage = Math.abs(pageViewZoom.value - 1) < 0.001 && Math.abs(pageViewPanX.value) < 1 && Math.abs(pageViewPanY.value) < 1
  if (isWholePage && previousPageView.value) {
    const restore = previousPageView.value
    previousPageView.value = undefined
    pageViewZoom.value = restore.zoom
    pageViewPanX.value = restore.panX
    pageViewPanY.value = restore.panY
    applyBaseViewport()
    status.value = 'Vorige Zoomstufe wiederhergestellt'
    return
  }
  previousPageView.value = { zoom: pageViewZoom.value, panX: pageViewPanX.value, panY: pageViewPanY.value }
  pageViewZoom.value = 1
  pageViewPanX.value = 0
  pageViewPanY.value = 0
  applyBaseViewport()
  status.value = 'Ganze Seite'
}

function selectPage(pageId: string) {
  activePageId.value = pageId
  clearSelection()
  resetPageView()
}

function addPage() {
  const page = createPage(currentDocument.value.pages.length + 1)
  currentDocument.value.pages.push(page)
  activePageId.value = page.id
  positionAllInfoBlocksFromAnchors(currentDocument.value)
  clearSelection()
  markChanged(`${page.name} hinzugefügt`)
  resetPageView()
}

function deletePage(pageId: string) {
  const page = currentDocument.value.pages.find((candidate) => candidate.id === pageId)
  const result = deleteDocumentPage(currentDocument.value, pageId)
  if (!result.deleted || !result.nextPageId) {
    status.value = 'Die letzte Seite kann nicht gelöscht werden'
    return
  }
  if (activePageId.value === pageId) activePageId.value = result.nextPageId
  if (editingPageId.value === pageId) editingPageId.value = undefined
  if (draggingPageId.value === pageId) finishPageDrag()
  positionAllInfoBlocksFromAnchors(currentDocument.value)
  clearSelection()
  markChanged(`${page?.name ?? 'Seite'} gelöscht`)
  resetPageView()
}

function startRenamePage(page: DiagramPage) {
  editingPageId.value = page.id
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.page-tab-input')
    input?.focus()
    input?.select()
  })
}

function finishRenamePage(page: DiagramPage) {
  page.name = page.name.trim() || `Seite ${currentDocument.value.pages.indexOf(page) + 1}`
  editingPageId.value = undefined
  positionAllInfoBlocksFromAnchors(currentDocument.value)
  markChanged('Seitenname geändert')
}

function startPageDrag(event: DragEvent, pageId: string) {
  if (editingPageId.value) return
  draggingPageId.value = pageId
  pageDragCopy.value = event.ctrlKey || event.metaKey || modifierPressed.value
  event.dataTransfer?.setData('application/eridion-page', pageId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove'
}

function dropPage(event: DragEvent, targetId: string) {
  const draggedId = draggingPageId.value || event.dataTransfer?.getData('application/eridion-page')
  const copyRequested = pageDragCopy.value || event.ctrlKey || event.metaKey || modifierPressed.value
  draggingPageId.value = undefined
  pageDragCopy.value = false
  if (!draggedId) return
  if (copyRequested) {
    const copy = duplicatePage(currentDocument.value, draggedId, targetId)
    if (!copy) return
    activePageId.value = copy.id
    positionAllInfoBlocksFromAnchors(currentDocument.value)
    markChanged(`${copy.name} dupliziert`)
    resetPageView()
    return
  }
  if (draggedId === targetId) return
  currentDocument.value.pages = movePageToTarget(currentDocument.value.pages, draggedId, targetId)
  markChanged('Seitenreihenfolge geändert')
}

function allowPageDrop(event: DragEvent) {
  event.preventDefault()
  if (event.ctrlKey || event.metaKey || modifierPressed.value) pageDragCopy.value = true
  if (event.dataTransfer) event.dataTransfer.dropEffect = pageDragCopy.value ? 'copy' : 'move'
}

function finishPageDrag() {
  draggingPageId.value = undefined
  pageDragCopy.value = false
}

type NewNodeKind = 'table' | 'text' | 'infoBlock'

function defaultInfoBlockPosition() {
  return {
    x: Math.max(16, currentPageDimensions.value.width - 340),
    y: Math.max(16, currentPageDimensions.value.height - 144)
  }
}

function addNode(kind: NewNodeKind, position?: { x: number; y: number }) {
  const targetPosition = position ?? (kind === 'infoBlock' ? defaultInfoBlockPosition() : { x: 70, y: 70 })
  const node: DiagramNode = kind === 'table'
    ? {
        id: crypto.randomUUID(), type: 'table', pageId: activePageId.value, position: targetPosition,
        data: {
          kind: 'table', name: 'NEUE_TABELLE', alias: '', objectType: 'TABLE', scale: 1,
          columns: [
            { id: crypto.randomUUID(), name: 'ID', typeName: 'BIGINT', nullable: false, primaryKey: true, foreignKey: false },
            { id: crypto.randomUUID(), name: 'NAME', typeName: 'VARCHAR(255)', nullable: true, primaryKey: false, foreignKey: false }
          ]
        }
      }
    : kind === 'text' ? {
        id: crypto.randomUUID(), type: 'text', pageId: activePageId.value, position: targetPosition,
        data: { kind: 'text', text: 'Freitext', fontSize: 18, scale: 1, color: '#334155', backgroundColor: '#ffffff', markdown: true, textAlign: 'left', width: 240, height: 100 }
      }
    : {
        id: crypto.randomUUID(), type: 'infoBlock', pageId: activePageId.value, position: targetPosition,
        data: {
          kind: 'infoBlock', scale: 1, heading: 'ERIDION · ERD', infoText: 'Datenmodell', author: '',
          repeatMode: 'current', pageRange: '1-',
          showDocumentName: true, showPageName: true, showPageNumber: true, showSavedAt: true,
          showAuthor: false, showDocumentId: false, showInfo: true,
          anchor: 'bottom-right', anchorOffsetX: 20, anchorOffsetY: 20
        }
      }
  if (node.data.kind === 'infoBlock') {
    if (position) captureInfoBlockAnchor(currentDocument.value, node)
    else positionInfoBlockFromAnchor(currentDocument.value, node)
  }
  currentDocument.value.nodes.push(node)
  state.selectedNodeId.value = node.id
  state.selectedEdgeId.value = undefined
  selectRenderedElements([node.id], [])
  openPaletteAutomatically('properties')
  markChanged(`${kind === 'table' ? 'Tabelle' : kind === 'text' ? 'Freitext' : 'Infoblock'} eingefügt`)
}

function onPaletteDrag(event: DragEvent, kind: NewNodeKind) {
  event.dataTransfer?.setData('application/eridion-node', kind)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function onDrop(event: DragEvent) {
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const schemaTablePayload = event.dataTransfer?.getData('application/eridion-schema-table')
  if (schemaTablePayload && paletteSnapshot.value) {
    const key = JSON.parse(schemaTablePayload) as { schema: string; name: string }
    const table = paletteSnapshot.value.tables.find((candidate) =>
      (candidate.schema ?? '') === key.schema && candidate.name === key.name
    )
    if (!table) return
    const result = addSchemaTableToPage(
      currentDocument.value,
      paletteSnapshot.value,
      table,
      activePageId.value,
      position
    )
    if (!result.added) {
      status.value = `${table.name} befindet sich bereits auf dieser Seite.`
      return
    }
    currentDocument.value.connectionReference = paletteConnectionId.value
    state.selectedNodeId.value = result.node?.id
    state.selectedEdgeId.value = undefined
    if (result.node) selectRenderedElements([result.node.id], [])
    openPaletteAutomatically('database')
    markChanged(`${table.name} eingefügt`)
    return
  }
  const kind = event.dataTransfer?.getData('application/eridion-node') as NewNodeKind
  if (!kind) return
  addNode(kind, { x: Math.max(16, position.x), y: Math.max(16, position.y) })
}

function onConnect(connection: Connection) {
  if (!connection.source || !connection.target) return
  const id = crypto.randomUUID()
  const edge: DiagramEdge = {
    id, type: 'crowFoot',
    source: connection.source, target: connection.target,
    sourceHandle: `source-${id}`, targetHandle: `target-${id}`,
    data: {
      sourceCardinality: '0..n', targetCardinality: '1', imported: false, optional: false,
      routeType: 'smoothstep',
      sourceAnchor: parseSnapAnchor(connection.sourceHandle, 'right'),
      targetAnchor: parseSnapAnchor(connection.targetHandle, 'left')
    }
  }
  currentDocument.value.relationships.push(edge)
  state.selectedEdgeId.value = edge.id
  state.selectedNodeId.value = undefined
  selectRenderedElements([], [edge.id])
  openPaletteAutomatically('properties')
  markChanged('Beziehung erstellt')
}

function syncSelection(nodes: Array<{ id: string }>, edges: Array<{ id: string }>) {
  const selection = resolveFlowSelection(
    nodes.map((node) => storedNodeId(node.id)),
    edges.map((edge) => edge.id)
  )
  state.selectedNodeId.value = selection.primaryNodeId
  state.selectedEdgeId.value = selection.primaryEdgeId
}

function selectionChanged(event: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }) {
  syncSelection(event.nodes, event.edges)
}

function openSelectedProperties() {
  nextTick(() => {
    syncSelection(getSelectedNodes.value, getSelectedEdges.value)
    if (state.selectedNodeId.value || state.selectedEdgeId.value) openPaletteAutomatically('properties')
  })
}

function selectRenderedElements(nodeIds: string[], edgeIds: string[]) {
  nextTick(() => {
    const selectedNodes = getNodes.value.filter((node) => nodeIds.includes(storedNodeId(node.id)))
    const selectedEdges = getEdges.value.filter((edge) => edgeIds.includes(edge.id))
    removeSelectedElements()
    addSelectedElements([...selectedNodes, ...selectedEdges])
    syncSelection(selectedNodes, selectedEdges)
  })
}

function clearSelection() {
  alignmentGuides.value = []
  removeSelectedElements()
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = undefined
  openPaletteAutomatically('document')
}

function selectedDocumentNodes(): DiagramNode[] {
  const ids = new Set(resolveFlowSelection(
    getSelectedNodes.value.map((node) => storedNodeId(node.id)),
    getSelectedEdges.value.map((edge) => edge.id)
  ).nodeIds)
  return currentDocument.value.nodes.filter((node) => ids.has(node.id))
}

function selectedDocumentEdges(): DiagramEdge[] {
  const ids = new Set(resolveFlowSelection(
    getSelectedNodes.value.map((node) => storedNodeId(node.id)),
    getSelectedEdges.value.map((edge) => edge.id)
  ).edgeIds)
  return currentDocument.value.relationships.filter((edge) => ids.has(edge.id))
}

function selectAllOnPage() {
  removeSelectedElements()
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = undefined
  addSelectedElements([...getNodes.value, ...getEdges.value])
  status.value = `${activeNodes.value.length + activeEdges.value.length} Objekte auf der Seite ausgewählt`
}

function snapDraggedNode(event: NodeDragEvent) {
  const node = currentDocument.value.nodes.find((candidate) => candidate.id === storedNodeId(event.node.id))
  if (!node) return
  if (node.draggable === false) return
  const pointerEvent = event.event
  const precise = 'ctrlKey' in pointerEvent && (pointerEvent.ctrlKey || pointerEvent.metaKey)
  if (precise) {
    alignmentGuides.value = []
    node.position = { ...event.node.position }
    return
  }
  const tableScale = TABLE_BASE_RENDER_SCALE * currentDocument.value.styles.baseScale * activePage.value.tableScale
  const gridPosition = snapTablePositionToPageGrid(currentDocument.value, node, event.node.position, tableScale)
  const aligned = alignNodeToNearbyObjects(currentDocument.value, node, event.node.position, activeNodes.value, tableScale)
  alignmentGuides.value = aligned.guides
  const snapped = {
    x: aligned.guides.some((guide) => guide.axis === 'x') ? aligned.position.x : gridPosition.x,
    y: aligned.guides.some((guide) => guide.axis === 'y') ? aligned.position.y : gridPosition.y
  }
  event.node.position = { ...snapped }
  node.position = { ...snapped }
}

function constrainNode(event: NodeDragEvent) {
  snapDraggedNode(event)
  const node = currentDocument.value.nodes.find((candidate) => candidate.id === storedNodeId(event.node.id))
  if (node?.data.kind === 'infoBlock') captureInfoBlockAnchor(currentDocument.value, node)
  alignmentGuides.value = []
  markChanged('Position geändert')
}

function deleteSelected() {
  const nodeIds = new Set(selectedDocumentNodes().map((node) => node.id))
  const edgeIds = new Set(selectedDocumentEdges().map((edge) => edge.id))
  if (!nodeIds.size && !edgeIds.size) return
  currentDocument.value.nodes = currentDocument.value.nodes.filter((node) => !nodeIds.has(node.id))
  currentDocument.value.relationships = currentDocument.value.relationships.filter((edge) =>
    !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target)
  )
  removeSelectedElements()
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = undefined
  openPaletteAutomatically('document')
  markChanged(nodeIds.size + edgeIds.size > 1 ? 'Objekte gelöscht' : 'Objekt gelöscht')
}

function copySelected(): boolean {
  const nodes = selectedDocumentNodes()
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = selectedDocumentEdges().filter((edge) =>
    !nodes.length || (nodeIds.has(edge.source) && nodeIds.has(edge.target))
  )
  if (!nodes.length && !edges.length) {
    status.value = 'Kein Objekt zum Kopieren ausgewählt'
    return false
  }
  objectClipboard = { nodes: clonePlain(nodes), edges: clonePlain(edges) }
  status.value = `${nodes.length + edges.length} Objekt${nodes.length + edges.length === 1 ? '' : 'e'} kopiert`
  return true
}

function cutSelected() {
  if (!copySelected()) return
  deleteSelected()
  status.value = 'Objekt ausgeschnitten'
}

function pasteClipboard() {
  if (!objectClipboard) {
    status.value = 'Die Eridion-Zwischenablage ist leer'
    return
  }
  const nodeIds = new Map(objectClipboard.nodes.map((node) => [node.id, crypto.randomUUID()]))
  const nodes: DiagramNode[] = objectClipboard.nodes.map((source) => ({
    ...clonePlain(source), id: nodeIds.get(source.id)!, pageId: activePageId.value,
    position: { x: source.position.x + 20, y: source.position.y + 20 }
  }))
  nodes.forEach((node) => { if (node.data.kind === 'infoBlock') captureInfoBlockAnchor(currentDocument.value, node) })
  const pageNodeIds = new Set([...activeNodes.value.map((node) => storedNodeId(node.id)), ...nodes.map((node) => node.id)])
  const edges: DiagramEdge[] = objectClipboard.edges.flatMap((source) => {
    const edgeSource = nodeIds.get(source.source) ?? source.source
    const edgeTarget = nodeIds.get(source.target) ?? source.target
    if (!pageNodeIds.has(edgeSource) || !pageNodeIds.has(edgeTarget)) return []
    const id = crypto.randomUUID()
    return [{
      ...clonePlain(source), id, source: edgeSource, target: edgeTarget,
      sourceHandle: `source-${id}`, targetHandle: `target-${id}`,
      data: {
        ...clonePlain(source.data),
        routeOffsetX: (source.data.routeOffsetX ?? 0) + RELATIONSHIP_ROUTE_GRID,
        routeOffsetY: (source.data.routeOffsetY ?? 0) + RELATIONSHIP_ROUTE_GRID
      }
    }]
  })
  if (!nodes.length && !edges.length) {
    status.value = 'Die Auswahl kann auf dieser Seite nicht eingefügt werden.'
    return
  }
  currentDocument.value.nodes.push(...nodes)
  currentDocument.value.relationships.push(...edges)
  objectClipboard = { nodes: clonePlain(nodes), edges: clonePlain(edges) }
  state.selectedNodeId.value = nodes.length + edges.length === 1 && nodes[0] ? nodes[0].id : undefined
  state.selectedEdgeId.value = nodes.length + edges.length === 1 && edges[0] ? edges[0].id : undefined
  selectRenderedElements(nodes.map((node) => node.id), edges.map((edge) => edge.id))
  openPaletteAutomatically(hasPropertySelection.value ? 'properties' : 'document')
  markChanged(`${nodes.length + edges.length} Objekt${nodes.length + edges.length === 1 ? '' : 'e'} eingefügt`)
}

function restoreHistory(direction: 'undo' | 'redo') {
  const restored = direction === 'undo' ? state.undo() : state.redo()
  if (!restored) {
    status.value = direction === 'undo' ? 'Nichts mehr rückgängig zu machen' : 'Nichts mehr zu wiederholen'
    return
  }
  if (!currentDocument.value.pages.some((page) => page.id === activePageId.value)) activePageId.value = currentDocument.value.pages[0].id
  openPaletteAutomatically('document')
  alignmentGuides.value = []
  status.value = direction === 'undo' ? 'Rückgängig' : 'Wiederholt'
  resetPageView()
}

async function confirmDiscard(): Promise<boolean> {
  window.dispatchEvent(new Event('eridion:commit-editors'))
  return !state.dirty.value || confirm('Nicht gespeicherte Änderungen verwerfen?')
}

async function createNew() {
  if (!await confirmDiscard()) return
  state.replace(newDocument())
  activePageId.value = currentDocument.value.pages[0].id
  status.value = 'Neues Diagramm'
  resetPageView()
}

async function open(path?: string) {
  if (!await confirmDiscard()) return
  busy.value = true
  status.value = 'PDF wird geöffnet …'
  try {
    const result = await window.eridion.openDiagram(path)
    if (!result.canceled && result.data) {
      state.replace(parseDocument(result.data), result.path)
      activePageId.value = currentDocument.value.pages[0].id
      status.value = `Geöffnet: ${result.path}`
      resetPageView()
    }
  } catch (error) {
    status.value = (error as Error).message
    alert(status.value)
  } finally {
    busy.value = false
  }
}

async function save(forceDialog = false) {
  window.dispatchEvent(new Event('eridion:commit-editors'))
  busy.value = true
  status.value = 'Bearbeitbare PDF wird erzeugt …'
  try {
    const savedAt = new Date().toISOString()
    const documentForSave: EridionDocument = { ...currentDocument.value, modifiedAt: savedAt }
    const result = await window.eridion.saveDiagram({
      path: forceDialog ? undefined : state.filePath.value,
      documentJson: serializeDocument(documentForSave),
      printHtml: buildPrintHtml(documentForSave, savedAt),
      tooltips: buildPdfTooltips(documentForSave)
    })
    if (!result.canceled && result.path) {
      currentDocument.value.modifiedAt = savedAt
      state.filePath.value = result.path
      state.saved()
      status.value = `Gespeichert: ${result.path}`
    }
  } catch (error) {
    status.value = (error as Error).message
    alert(status.value)
  } finally {
    busy.value = false
  }
}

async function exportCleanPdf() {
  window.dispatchEvent(new Event('eridion:commit-editors'))
  busy.value = true
  status.value = 'Saubere PDF wird exportiert …'
  try {
    const result = await window.eridion.exportPdf({
      protectedPath: state.filePath.value,
      printHtml: buildPrintHtml(currentDocument.value, new Date().toISOString()),
      tooltips: buildPdfTooltips(currentDocument.value)
    })
    if (result.error) status.value = result.error
    else if (!result.canceled) status.value = `Exportiert: ${result.path}`
  } catch (error) {
    status.value = (error as Error).message
    alert(status.value)
  } finally {
    busy.value = false
  }
}

function connectionManagerClosed() {
  connectionManagerOpen.value = false
  connectionRefreshKey.value += 1
}

function schemaSnapshotLoaded(snapshot: SchemaSnapshot, connectionId: string) {
  paletteSnapshot.value = snapshot
  paletteConnectionId.value = connectionId
}

function propertiesChanged() {
  positionAllInfoBlocksFromAnchors(currentDocument.value)
  markChanged()
}

function keyHandler(event: KeyboardEvent) {
  modifierPressed.value = event.ctrlKey || event.metaKey
  if (isEditableKeyboardTarget(event.target)) return
  const modifier = event.ctrlKey || event.metaKey
  const key = event.key.toLocaleLowerCase()
  if (modifier && key === 'a') {
    event.preventDefault()
    selectAllOnPage()
    return
  }
  if (modifier && key === 'z') {
    event.preventDefault()
    restoreHistory(event.shiftKey ? 'redo' : 'undo')
    return
  }
  if (modifier && key === 'y') {
    event.preventDefault()
    restoreHistory('redo')
    return
  }
  if (modifier && key === 'c') {
    event.preventDefault()
    copySelected()
    return
  }
  if (modifier && key === 'x') {
    event.preventDefault()
    cutSelected()
    return
  }
  if (modifier && key === 'v') {
    event.preventDefault()
    pasteClipboard()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    togglePageZoom()
    return
  }
  const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const)[event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown']
  if (direction && hasSelection.value) {
    event.preventDefault()
    const precise = event.ctrlKey || event.metaKey
    const selectedNode = currentDocument.value.nodes.find((node) => node.id === state.selectedNodeId.value)
    if (selectedNode) {
      if (selectedNode.draggable === false) {
        status.value = 'Objekt ist fixiert'
        return
      }
      const step = precise ? 1 : 20
      const position = {
        x: selectedNode.position.x + direction[0] * step,
        y: selectedNode.position.y + direction[1] * step
      }
      const tableScale = TABLE_BASE_RENDER_SCALE * currentDocument.value.styles.baseScale * activePage.value.tableScale
      selectedNode.position = precise ? position : snapTablePositionToPageGrid(currentDocument.value, selectedNode, position, tableScale)
      updateNode(selectedNode.id, { position: { ...selectedNode.position } })
      if (selectedNode.data.kind === 'infoBlock') captureInfoBlockAnchor(currentDocument.value, selectedNode)
      markChanged(precise ? 'Objekt um 1 Pixel verschoben' : 'Objekt im Raster verschoben')
      return
    }
    const selectedEdge = currentDocument.value.relationships.find((edge) => edge.id === state.selectedEdgeId.value)
    if (selectedEdge) {
      const step = precise ? 1 : RELATIONSHIP_ROUTE_GRID
      if (selectedEdge.data.routePoints?.length) {
        selectedEdge.data.routePoints = selectedEdge.data.routePoints.map((point) => ({
          x: point.x + direction[0] * step,
          y: point.y + direction[1] * step
        }))
      } else {
        selectedEdge.data.routeOffsetX = (selectedEdge.data.routeOffsetX ?? 0) + direction[0] * step
        selectedEdge.data.routeOffsetY = (selectedEdge.data.routeOffsetY ?? 0) + direction[1] * step
      }
      markChanged(precise ? 'Verbinder um 1 Pixel verschoben' : 'Verbinder im Raster verschoben')
      return
    }
  }
  if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected()
}

function keyUpHandler(event: KeyboardEvent) {
  modifierPressed.value = event.ctrlKey || event.metaKey
}

function resetModifier() {
  modifierPressed.value = false
}

watch(
  () => `${currentDocument.value.page.format}:${currentDocument.value.page.orientation}`,
  () => {
    positionAllInfoBlocksFromAnchors(currentDocument.value)
    resetPageView()
  }
)

let removeMenuListener: (() => void) | undefined
let pageResizeObserver: ResizeObserver | undefined
onMounted(() => {
  window.addEventListener('keydown', keyHandler)
  window.addEventListener('keyup', keyUpHandler)
  window.addEventListener('blur', resetModifier)
  removeMenuListener = window.eridion.onMenuCommand((command) => {
    if (command === 'new') createNew()
    else if (command === 'open') open()
    else if (command.startsWith('open:')) open(command.slice(5))
    else if (command === 'save') save()
    else if (command === 'save-as') save(true)
    else if (command === 'export') exportCleanPdf()
    else if (command === 'undo') restoreHistory('undo')
    else if (command === 'redo') restoreHistory('redo')
    else if (command === 'copy') copySelected()
    else if (command === 'cut') cutSelected()
    else if (command === 'paste') pasteClipboard()
    else if (command === 'select-all') selectAllOnPage()
    else if (command === 'page-zoom-out') zoomPageBy(1 / 1.2)
    else if (command === 'page-zoom-in') zoomPageBy(1.2)
    else if (command === 'page-fit') togglePageZoom()
    else if (command === 'database') connectionManagerOpen.value = true
  })
  pageResizeObserver = new ResizeObserver(updateSheetBaseSize)
  if (pageStage.value) pageResizeObserver.observe(pageStage.value)
  updateSheetBaseSize()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyHandler)
  window.removeEventListener('keyup', keyUpHandler)
  window.removeEventListener('blur', resetModifier)
  pageResizeObserver?.disconnect()
  removeMenuListener?.()
})
</script>

<template>
  <main class="app-shell" :style="{ '--default-table-color': state.document.value.styles.tableColor, '--default-header-color': state.document.value.styles.tableHeaderColor }">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">E</div><span>Eridion</span></div>
      <div class="document-name"><span :class="{ dirty: state.dirty.value }">{{ state.displayName.value }}</span><small>{{ pageDescription }} · {{ state.document.value.pages.length }} {{ state.document.value.pages.length === 1 ? 'Seite' : 'Seiten' }}</small></div>
    </header>

    <section class="workspace">
      <aside class="palette">
        <section class="palette-accordion properties-accordion">
          <button class="accordion-header" :class="{ open: paletteSection === 'document', locked: manuallyOpenedPaletteSection === 'document' }" @click="togglePaletteSection('document')">
            <span><FileText :size="15" /> Dokument</span><Lock v-if="manuallyOpenedPaletteSection === 'document'" :size="14" /><ChevronDown v-else :size="15" />
          </button>
          <PropertiesPanel v-if="paletteSection === 'document'" :active-page-id="activePageId" mode="document" @delete="deleteSelected" @changed="propertiesChanged" />
        </section>
        <section class="palette-accordion properties-accordion">
          <button class="accordion-header" :class="{ open: paletteSection === 'paper', locked: manuallyOpenedPaletteSection === 'paper' }" @click="togglePaletteSection('paper')">
            <span><RectangleHorizontal :size="15" /> Papierformat</span><Lock v-if="manuallyOpenedPaletteSection === 'paper'" :size="14" /><ChevronDown v-else :size="15" />
          </button>
          <PropertiesPanel v-if="paletteSection === 'paper'" :active-page-id="activePageId" mode="paper" @delete="deleteSelected" @changed="propertiesChanged" />
        </section>
        <section class="palette-accordion properties-accordion">
          <button class="accordion-header" :class="{ open: paletteSection === 'page', locked: manuallyOpenedPaletteSection === 'page' }" @click="togglePaletteSection('page')">
            <span><PanelTop :size="15" /> Seite</span><Lock v-if="manuallyOpenedPaletteSection === 'page'" :size="14" /><ChevronDown v-else :size="15" />
          </button>
          <PropertiesPanel v-if="paletteSection === 'page'" :active-page-id="activePageId" mode="page" @delete-page="deletePage(activePageId)" @changed="propertiesChanged" />
        </section>
        <section class="palette-accordion">
          <button class="accordion-header" :class="{ open: paletteSection === 'insert', locked: manuallyOpenedPaletteSection === 'insert' }" @click="togglePaletteSection('insert')">
            <span><UploadCloud :size="15" /> Einfügen</span><Lock v-if="manuallyOpenedPaletteSection === 'insert'" :size="14" /><ChevronDown v-else :size="15" />
          </button>
          <div v-if="paletteSection === 'insert'" class="accordion-content insert-tools">
            <button draggable="true" @dragstart="onPaletteDrag($event, 'table')" @dblclick="addNode('table')"><Table2 :size="18" /><span><strong>Tabelle</strong><small>Ziehen oder doppelklicken</small></span></button>
            <button draggable="true" @dragstart="onPaletteDrag($event, 'text')" @dblclick="addNode('text')"><TextCursorInput :size="18" /><span><strong>Freitext</strong><small>Notiz oder Überschrift</small></span></button>
            <button draggable="true" @dragstart="onPaletteDrag($event, 'infoBlock')" @dblclick="addNode('infoBlock')"><Info :size="18" /><span><strong>Infoblock</strong><small>Technisches Zeichnungsfeld</small></span></button>
          </div>
        </section>
        <section class="palette-accordion">
          <button class="accordion-header" :class="{ open: paletteSection === 'database', locked: manuallyOpenedPaletteSection === 'database' }" @click="togglePaletteSection('database')">
            <span><Database :size="15" /> Datenbankobjekte</span><Lock v-if="manuallyOpenedPaletteSection === 'database'" :size="14" /><ChevronDown v-else :size="15" />
          </button>
          <DatabasePalette
            v-if="paletteSection === 'database'"
            :refresh-key="connectionRefreshKey"
            :selected-table="selectedDatabaseTable"
            :current-page-tables="currentPageDatabaseTables"
            :other-page-tables="otherPageDatabaseTables"
            @manage="connectionManagerOpen = true"
            @snapshot="schemaSnapshotLoaded"
          />
        </section>
        <section v-if="hasPropertySelection" class="palette-accordion properties-accordion">
          <button class="accordion-header" :class="{ open: paletteSection === 'properties', locked: manuallyOpenedPaletteSection === 'properties' }" @click="togglePaletteSection('properties')">
            <span><SlidersHorizontal :size="15" /> {{ selectedPropertiesLabel }}</span><Lock v-if="manuallyOpenedPaletteSection === 'properties'" :size="14" /><ChevronDown v-else :size="15" />
          </button>
          <PropertiesPanel v-if="paletteSection === 'properties'" :active-page-id="activePageId" mode="selection" @delete="deleteSelected" @changed="propertiesChanged" />
        </section>
      </aside>

      <div class="page-workarea">
        <nav class="page-tabs" aria-label="Diagrammseiten">
          <div
            v-for="page in state.document.value.pages"
            :key="page.id"
            :class="['page-tab', { active: page.id === activePageId, dragging: page.id === draggingPageId }]"
            :title="`Seite „${page.name}“ anzeigen; doppelklicken zum Umbenennen; mit Ctrl/Cmd beim Ziehen duplizieren`"
            :draggable="editingPageId !== page.id"
            role="tab"
            tabindex="0"
            :aria-selected="page.id === activePageId"
            @dragstart="startPageDrag($event, page.id)"
            @dragover="allowPageDrop"
            @drop.prevent="dropPage($event, page.id)"
            @dragend="finishPageDrag"
            @click="selectPage(page.id)"
            @dblclick="startRenamePage(page)"
            @keydown.enter.prevent="selectPage(page.id)"
            @keydown.space.prevent="selectPage(page.id)"
          >
            <input
              v-if="editingPageId === page.id"
              v-model="page.name"
              class="page-tab-input"
              aria-label="Seitenname"
              @click.stop
              @dblclick.stop
              @blur="finishRenamePage(page)"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              @keydown.esc.prevent="editingPageId = undefined"
            />
            <template v-else>
              <span class="page-tab-name">{{ page.name }}</span>
              <button
                v-if="state.document.value.pages.length > 1"
                class="page-tab-delete"
                :title="`Seite „${page.name}“ löschen`"
                :aria-label="`Seite ${page.name} löschen`"
                @pointerdown.stop
                @click.stop="deletePage(page.id)"
                @dblclick.stop
              ><X :size="13" /></button>
            </template>
          </div>
          <button class="add-page-tab" title="Weitere Seite hinzufügen" aria-label="Weitere Seite hinzufügen" @click="addPage"><Plus :size="16" /></button>
        </nav>
        <div
          ref="pageStage"
          :class="['page-stage', { panning }]"
          @dragover.prevent
          @drop="onDrop"
          @wheel.prevent="onPageWheel"
          @pointerdown="onStagePointerDown"
          @pointermove="onStagePointerMove"
          @pointerup="onStagePointerUp"
          @pointercancel="onStagePointerUp"
        >
          <div
            ref="pageSheet"
            class="page-sheet"
            :style="pageSheetStyle"
          >
            <div class="page-margin-shade margin-top" />
            <div class="page-margin-shade margin-right" />
            <div class="page-margin-shade margin-bottom" />
            <div class="page-margin-shade margin-left" />
            <VueFlow
              :nodes="activeNodes"
              :edges="activeEdges"
              :min-zoom="0.01"
              :max-zoom="12"
              :pan-on-drag="false"
              :auto-pan-on-node-drag="false"
              :zoom-on-scroll="false"
              :zoom-on-pinch="false"
              :zoom-on-double-click="false"
              :delete-key-code="null"
              @connect="onConnect"
              @node-click="openSelectedProperties"
              @edge-click="openSelectedProperties"
              @selection-change="selectionChanged"
              @pane-click="clearSelection"
              @node-drag="snapDraggedNode"
              @node-drag-stop="constrainNode"
            >
              <template #node-table="props"><TableNode v-bind="props" /></template>
              <template #node-text="props"><TextNode v-bind="props" /></template>
              <template #node-infoBlock="props"><InfoBlockNode v-bind="props" /></template>
              <template #edge-crowFoot="props"><CrowFootEdge v-bind="props" /></template>
            </VueFlow>
            <svg
              v-if="alignmentGuides.length"
              class="alignment-guide-layer"
              :viewBox="`0 0 ${currentPageDimensions.width} ${currentPageDimensions.height}`"
              preserveAspectRatio="none"
            >
              <line
                v-for="(guide, index) in alignmentGuides" :key="`${guide.axis}-${index}`"
                :x1="guide.axis === 'x' ? guide.position : guide.start"
                :y1="guide.axis === 'y' ? guide.position : guide.start"
                :x2="guide.axis === 'x' ? guide.position : guide.end"
                :y2="guide.axis === 'y' ? guide.position : guide.end"
              />
            </svg>
          </div>
        </div>
      </div>

    </section>

    <footer class="statusbar"><span :class="{ busy }">{{ busy ? '● ' : '' }}{{ status }}</span><span>{{ documentMetrics }}</span></footer>

    <ConnectionManager v-if="connectionManagerOpen" @close="connectionManagerClosed" />
  </main>
</template>
