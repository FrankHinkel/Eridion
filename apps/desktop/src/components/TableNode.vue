<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { Handle, Position, useVueFlow, type NodeProps } from '@vue-flow/core'
import { KeyRound, Link2, Table2, View } from 'lucide-vue-next'
import { useDocumentState } from '../document-state'
import { cancelConnector, connectorHover, connectorPointer, connectorSource, moveConnectorPointer, setConnectorHover, startConnector, takeConnectorTarget } from '../connector-draft'
import { columnAwareRelationshipAnchor, resolvedRelationshipAnchor, shortTypeName, sortTableColumns, TABLE_BASE_RENDER_SCALE, tableSize, type AnchorSide, type EridionDocument, type RelationshipAnchor, type RelationshipColumnBounds, type TableNodeData } from '../model'
import { TABLE_COLUMN_GAP, TABLE_COLUMN_SIDE_PADDING, TABLE_TYPE_MIN_CHARACTERS } from '../render-metrics'

const props = defineProps<NodeProps<TableNodeData>>()
const state = useDocumentState()
const document = state.document as unknown as { value: EridionDocument }
const { updateNodeInternals } = useVueFlow()
const snapAnchor = ref<RelationshipAnchor>()
const showTypes = computed(() => props.data.showTypes ?? document.value.styles.showTypes)
const showIcons = computed(() => props.data.showIcons ?? document.value.styles.showIcons)
const displayedColumns = computed(() => sortTableColumns(props.data.columns))
const pageTableScale = computed(() => {
  const node = document.value.nodes.find((candidate) => candidate.id === props.id)
  return document.value.pages.find((page) => page.id === node?.pageId)?.tableScale ?? 1
})
const effectiveScale = computed(() => TABLE_BASE_RENDER_SCALE * document.value.styles.baseScale * props.data.scale * pageTableScale.value)
const sourceEdges = computed(() => document.value.relationships.filter((edge) => edge.source === props.id))
const targetEdges = computed(() => document.value.relationships.filter((edge) => edge.target === props.id))
const connectingFromThisTable = computed(() => connectorSource.value?.nodeId === props.id)
const displayedSnapAnchor = computed(() => connectorSource.value && connectorHover.value?.nodeId === props.id
  ? connectorHover.value.anchor
  : snapAnchor.value)
const baseWidth = computed(() => tableSize({ ...props.data, showTypes: showTypes.value, showIcons: showIcons.value }).width / (props.data.scale || 1))

const positions: Record<AnchorSide, Position> = {
  top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left
}

function anchorPosition(anchor: RelationshipAnchor | undefined, fallback: AnchorSide): Position {
  return positions[anchor?.side ?? fallback]
}

function anchorStyle(anchor: RelationshipAnchor | undefined): CSSProperties {
  const resolved = resolvedRelationshipAnchor(anchor, props.data)
  const side = resolved?.side ?? 'right'
  const percentage = `${(Math.max(-1, Math.min(1, resolved?.position ?? 0)) + 1) * 50}%`
  return side === 'top' || side === 'bottom' ? { left: percentage } : { top: percentage }
}

function columnBounds(table: HTMLElement): RelationshipColumnBounds[] {
  return Array.from(table.querySelectorAll<HTMLElement>('.table-column[data-column-id]')).map((column) => {
    const rect = column.getBoundingClientRect()
    return { id: column.dataset.columnId!, top: rect.top, bottom: rect.bottom }
  })
}

function anchorAtPoint(table: HTMLElement, clientX: number, clientY: number, precise = false): RelationshipAnchor | undefined {
  const rect = table.getBoundingClientRect()
  const nearest = columnAwareRelationshipAnchor(rect, clientX, clientY, columnBounds(table), undefined, precise)
  const distance = Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right), Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom))
  return distance <= 18 ? nearest.anchor : undefined
}

function updateSnapPoint(event: MouseEvent) {
  if (connectingFromThisTable.value) return
  const anchor = anchorAtPoint(
    event.currentTarget as HTMLElement, event.clientX, event.clientY,
    event.ctrlKey || event.metaKey
  )
  snapAnchor.value = anchor
  if (!anchor) return
  setConnectorHover({ nodeId: props.id, anchor: { ...anchor } })
}

function leaveTable() {
  if (!connectingFromThisTable.value) snapAnchor.value = undefined
  if (connectorSource.value?.nodeId !== props.id) setConnectorHover(undefined)
}

function createConnector(source: { nodeId: string; anchor: RelationshipAnchor }, target: { nodeId: string; anchor: RelationshipAnchor }) {
  const id = crypto.randomUUID()
  document.value.relationships = [...document.value.relationships, {
    id, type: 'crowFoot', source: source.nodeId, target: target.nodeId,
    sourceHandle: `source-${id}`, targetHandle: `target-${id}`,
    data: {
      sourceCardinality: '0..n', targetCardinality: '1', imported: false, optional: false,
      routeType: 'smoothstep',
      sourceAnchor: { ...source.anchor }, targetAnchor: { ...target.anchor }
    }
  }]
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = id
  state.changed()
}

function trackConnectorPointer(event: PointerEvent | MouseEvent) {
  moveConnectorPointer({ x: event.clientX, y: event.clientY })
  const table = window.document.elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest<HTMLElement>('.erd-table'))
    .find(Boolean)
  const node = table?.closest<HTMLElement>('.vue-flow__node-table')
  const nodeId = node?.dataset.id
  if (!table || !nodeId) {
    setConnectorHover(undefined)
    return
  }
  const anchor = columnAwareRelationshipAnchor(
    table.getBoundingClientRect(), event.clientX, event.clientY, columnBounds(table), undefined,
    event.ctrlKey || event.metaKey
  ).anchor
  setConnectorHover({ nodeId, anchor })
}

function stopConnectorTracking() {
  window.removeEventListener('pointermove', trackConnectorPointer)
  window.removeEventListener('mousemove', trackConnectorPointer)
  window.removeEventListener('pointerup', finishConnector)
  window.removeEventListener('pointercancel', finishConnector)
}

function finishConnector(event?: PointerEvent) {
  if (event) trackConnectorPointer(event)
  const connection = takeConnectorTarget()
  stopConnectorTracking()
  cancelConnector()
  if (connection) createConnector(connection.source, connection.target)
}

function useSnapPoint(event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!snapAnchor.value) return
  setConnectorHover({ nodeId: props.id, anchor: { ...snapAnchor.value } })
  cancelConnector()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  startConnector({ nodeId: props.id, anchor: { ...snapAnchor.value } }, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  window.addEventListener('pointermove', trackConnectorPointer)
  window.addEventListener('mousemove', trackConnectorPointer)
  window.addEventListener('pointerup', finishConnector, { once: true })
  window.addEventListener('pointercancel', finishConnector, { once: true })
}

onBeforeUnmount(() => {
  if (connectingFromThisTable.value) cancelConnector()
  stopConnectorTracking()
})

watch(
  () => document.value.relationships.map((edge) => [edge.id, edge.source, edge.target, edge.data.sourceAnchor, edge.data.targetAnchor]),
  () => nextTick(() => updateNodeInternals([props.id])),
  { deep: true }
)
watch(snapAnchor, () => nextTick(() => updateNodeInternals([props.id])), { deep: true })
watch(effectiveScale, () => nextTick(() => updateNodeInternals([props.id])))
watch(
  () => [baseWidth.value, props.data.columns.length, props.data.alias ?? ''],
  () => nextTick(() => updateNodeInternals([props.id]))
)
</script>

<template>
  <article
    class="erd-table"
    :style="{
      '--node-scale': effectiveScale,
      '--node-width': `${baseWidth}px`,
      '--column-gap': TABLE_COLUMN_GAP,
      '--column-side-padding': TABLE_COLUMN_SIDE_PADDING,
      '--type-min-characters': TABLE_TYPE_MIN_CHARACTERS,
      '--node-color': data.color || 'var(--default-table-color)',
      '--node-header': data.headerColor || 'var(--default-header-color)'
    }"
    @mousemove="updateSnapPoint"
    @mouseleave="leaveTable"
  >
    <div v-if="data.alias" class="table-alias">{{ data.alias }}</div>
    <header>
      <span class="table-context">
        <View v-if="data.objectType === 'VIEW'" :size="12" />
        <Table2 v-else :size="12" />
        {{ data.schema ? `${data.schema} · ${data.objectType}` : data.objectType }}
      </span>
      <strong>{{ data.name }}</strong>
    </header>
    <div class="table-columns">
      <div v-for="column in displayedColumns" :key="column.id" class="table-column" :data-column-id="column.id">
        <span class="column-flags">
          <KeyRound v-if="showIcons && column.primaryKey" :size="13" class="pk" />
          <Link2 v-if="showIcons && column.foreignKey" :size="13" class="fk" />
        </span>
        <span :class="['column-name', { 'not-null': !column.nullable }]">{{ column.name }}</span>
        <code v-if="showTypes" :title="column.typeName">{{ shortTypeName(column.typeName) }}</code>
      </div>
      <div v-if="!data.columns.length" class="empty-columns">Keine Spalten</div>
    </div>
    <Handle
      v-for="edge in sourceEdges" :id="`source-${edge.id}`" :key="`source-${edge.id}`"
      type="source" :position="anchorPosition(edge.data.sourceAnchor, 'right')"
      :style="anchorStyle(edge.data.sourceAnchor)" class="connection-handle"
    />
    <Handle
      v-for="edge in targetEdges" :id="`target-${edge.id}`" :key="`target-${edge.id}`"
      type="target" :position="anchorPosition(edge.data.targetAnchor, 'left')"
      :style="anchorStyle(edge.data.targetAnchor)" class="connection-handle"
    />
    <span
      v-if="displayedSnapAnchor" :class="['snap-point', `snap-point-${displayedSnapAnchor.side}`]"
      :style="anchorStyle(displayedSnapAnchor)" @pointerdown="useSnapPoint"
    />
    <Teleport to="body">
      <svg v-if="connectingFromThisTable && connectorPointer" class="connector-draft-preview" aria-hidden="true">
        <line :x1="connectorPointer.sourceX" :y1="connectorPointer.sourceY" :x2="connectorPointer.currentX" :y2="connectorPointer.currentY" />
      </svg>
    </Teleport>
  </article>
</template>
