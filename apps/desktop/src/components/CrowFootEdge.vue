<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, Position, useVueFlow, type EdgeProps } from '@vue-flow/core'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useDocumentState } from '../document-state'
import {
  cardinalityGeometry, RELATIONSHIP_DASH_PATTERN,
  RELATIONSHIP_SELECTED_STROKE_WIDTH, RELATIONSHIP_STROKE_WIDTH
} from '../relationship-geometry'
import { relationshipPath, snapRouteCoordinate } from '../relationship-path'
import { alignedRelationshipAnchor, type EridionDocument, type RelationshipData } from '../model'

const props = defineProps<EdgeProps<RelationshipData>>()
const state = useDocumentState()
const document = state.document as unknown as { value: EridionDocument }
const { screenToFlowCoordinate, viewport } = useVueFlow()
const path = computed(() => relationshipPath({
  sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
  targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
  data: props.data
}))
const labelX = computed(() => path.value[1] + (props.data?.labelOffsetX ?? 0))
const labelY = computed(() => path.value[2] + (props.data?.labelOffsetY ?? 0))
const sourceGeometry = computed(() => cardinalityGeometry(props.data?.sourceCardinality ?? '1'))
const targetGeometry = computed(() => cardinalityGeometry(props.data?.targetCardinality ?? '1'))
const routeSelected = computed(() => props.selected || state.selectedEdgeId.value === props.id)
const relationshipColor = computed(() => props.data?.color || '#475569')
const renderedColor = computed(() => routeSelected.value ? '#2563eb' : relationshipColor.value)
const endpointGripOffset = 7.5
const sourceEndpoint = ref<SVGGElement>()
const targetEndpoint = ref<SVGGElement>()

function positionAngle(position: Position | undefined): number {
  if (position === Position.Bottom) return 90
  if (position === Position.Left) return 180
  if (position === Position.Top) return -90
  return 0
}

let stopDrag: (() => void) | undefined

function startLabelDrag(event: PointerEvent) {
  const relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data
  if (!relationship) return
  const startX = event.clientX
  const startY = event.clientY
  const offsetX = relationship.labelOffsetX ?? 0
  const offsetY = relationship.labelOffsetY ?? 0
  const move = (moveEvent: PointerEvent) => {
    const zoom = viewport.value.zoom || 1
    relationship.labelOffsetX = Math.round((offsetX + (moveEvent.clientX - startX) / zoom) * 10) / 10
    relationship.labelOffsetY = Math.round((offsetY + (moveEvent.clientY - startY) / zoom) * 10) / 10
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    stopDrag = undefined
    state.changed()
  }
  stopDrag?.()
  stopDrag = end
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
}

function startRouteDrag(event: PointerEvent) {
  if (event.button !== 0) return
  const relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data
  if (!relationship) return
  if (event.ctrlKey || event.metaKey) {
    addRoutePoint(event, relationship)
    return
  }
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = props.id
  const start = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const middleX = (props.sourceX + props.targetX) / 2
  const middleY = (props.sourceY + props.targetY) / 2
  const routeX = middleX + (relationship.routeOffsetX ?? 0)
  const routeY = middleY + (relationship.routeOffsetY ?? 0)
  const originalPoints = relationship.routePoints?.map((point) => ({ ...point })) ?? []
  const move = (moveEvent: PointerEvent) => {
    const current = screenToFlowCoordinate({ x: moveEvent.clientX, y: moveEvent.clientY })
    const deltaX = current.x - start.x
    const deltaY = current.y - start.y
    const precise = moveEvent.ctrlKey || moveEvent.metaKey
    if (originalPoints.length) {
      relationship.routePoints = originalPoints.map((point) => ({
        x: snapRouteCoordinate(point.x + deltaX, precise),
        y: snapRouteCoordinate(point.y + deltaY, precise)
      }))
    } else {
      relationship.routeOffsetX = Math.round((snapRouteCoordinate(routeX + deltaX, precise) - middleX) * 1000) / 1000
      relationship.routeOffsetY = Math.round((snapRouteCoordinate(routeY + deltaY, precise) - middleY) * 1000) / 1000
    }
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    stopDrag = undefined
    state.changed()
  }
  stopDrag?.()
  stopDrag = end
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
}

function pointSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const factor = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - (start.x + factor * dx), point.y - (start.y + factor * dy))
}

function addRoutePoint(event: PointerEvent, relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data) {
  if (!relationship) return
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = props.id
  const raw = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const point = { x: Math.round(raw.x), y: Math.round(raw.y) }
  const points = relationship.routePoints?.map((item) => ({ ...item })) ?? []
  const segments = [{ x: props.sourceX, y: props.sourceY }, ...points, { x: props.targetX, y: props.targetY }]
  let insertAt = 0
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < segments.length - 1; index += 1) {
    const candidate = pointSegmentDistance(point, segments[index], segments[index + 1])
    if (candidate < distance) { distance = candidate; insertAt = index }
  }
  points.splice(insertAt, 0, point)
  relationship.routePoints = points
  relationship.routeOffsetX = 0
  relationship.routeOffsetY = 0
  state.changed()
}

function startRoutePointDrag(event: PointerEvent, index: number) {
  if (event.button !== 0) return
  const relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data
  const original = relationship?.routePoints?.[index]
  if (!relationship || !original) return
  event.stopPropagation()
  event.preventDefault()
  const start = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const move = (moveEvent: PointerEvent) => {
    const current = screenToFlowCoordinate({ x: moveEvent.clientX, y: moveEvent.clientY })
    const precise = moveEvent.ctrlKey || moveEvent.metaKey
    relationship.routePoints![index] = {
      x: snapRouteCoordinate(original.x + current.x - start.x, precise),
      y: snapRouteCoordinate(original.y + current.y - start.y, precise)
    }
  }
  const finish = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    stopDrag = undefined
    state.changed()
  }
  stopDrag?.()
  stopDrag = finish
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
}

function removeRoutePoint(index: number) {
  const relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data
  if (!relationship?.routePoints) return
  relationship.routePoints.splice(index, 1)
  state.changed()
}

function tableElement(nodeId: string): HTMLElement | undefined {
  return Array.from(window.document.querySelectorAll<HTMLElement>('.vue-flow__node-table'))
    .find((node) => node.dataset.id === nodeId)
    ?.querySelector<HTMLElement>('.erd-table') ?? undefined
}

function startAnchorDrag(event: PointerEvent, end: 'source' | 'target') {
  if (event.button !== 0) return
  const relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data
  if (!relationship) return
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = props.id
  const nodeId = end === 'source' ? props.source : props.target
  const key = end === 'source' ? 'sourceAnchor' : 'targetAnchor'
  const move = (moveEvent: PointerEvent) => {
    const table = tableElement(nodeId)
    if (!table) return
    const otherGroup = end === 'source' ? targetEndpoint.value : sourceEndpoint.value
    const matrix = otherGroup?.getScreenCTM()
    relationship[key] = alignedRelationshipAnchor(
      table.getBoundingClientRect(), moveEvent.clientX, moveEvent.clientY,
      matrix ? { x: matrix.e, y: matrix.f } : undefined,
      moveEvent.ctrlKey || moveEvent.metaKey
    ).anchor
  }
  const finish = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    stopDrag = undefined
    state.changed()
  }
  stopDrag?.()
  stopDrag = finish
  move(event)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
}

onBeforeUnmount(() => stopDrag?.())
</script>

<template>
  <BaseEdge :id="id" :path="path[0]" :style="{ stroke: renderedColor, strokeWidth: routeSelected ? RELATIONSHIP_SELECTED_STROKE_WIDTH : RELATIONSHIP_STROKE_WIDTH, strokeDasharray: data?.optional ? RELATIONSHIP_DASH_PATTERN : undefined }" />
  <path
    class="edge-route-drag nodrag nopan" :d="path[0]" fill="none" stroke="#000" stroke-opacity="0.001" stroke-width="32"
    pointer-events="stroke" @pointerdown.stop.prevent="startRouteDrag"
  />
  <g v-if="routeSelected && data?.routePoints?.length">
    <rect
      v-for="(point, index) in data.routePoints" :key="index" class="edge-route-point nodrag nopan"
      :x="point.x - 4" :y="point.y - 4" width="8" height="8" rx="1"
      title="Ziehen; doppelklicken zum Entfernen"
      @pointerdown="startRoutePointDrag($event, index)" @dblclick.stop.prevent="removeRoutePoint(index)"
    />
  </g>
  <g ref="targetEndpoint" :transform="`translate(${targetX} ${targetY}) rotate(${positionAngle(targetPosition)})`" :stroke="renderedColor" fill="none" :stroke-width="routeSelected ? RELATIONSHIP_SELECTED_STROKE_WIDTH : RELATIONSHIP_STROKE_WIDTH" stroke-linecap="round" stroke-linejoin="round">
    <path :d="targetGeometry.maximumPath" />
    <circle v-if="targetGeometry.optional" :cx="targetGeometry.minimumOffset" cy="0" :r="targetGeometry.circleRadius" fill="white" />
    <path v-else :d="targetGeometry.minimumPath" />
    <circle class="edge-anchor-hit" :cx="endpointGripOffset" cy="0" r="10" @pointerdown.stop.prevent="startAnchorDrag($event, 'target')" />
  </g>
  <g ref="sourceEndpoint" :transform="`translate(${sourceX} ${sourceY}) rotate(${positionAngle(sourcePosition)})`" :stroke="renderedColor" fill="none" :stroke-width="routeSelected ? RELATIONSHIP_SELECTED_STROKE_WIDTH : RELATIONSHIP_STROKE_WIDTH" stroke-linecap="round" stroke-linejoin="round">
    <path :d="sourceGeometry.maximumPath" />
    <circle v-if="sourceGeometry.optional" :cx="sourceGeometry.minimumOffset" cy="0" :r="sourceGeometry.circleRadius" fill="white" />
    <path v-else :d="sourceGeometry.minimumPath" />
    <circle class="edge-anchor-hit" :cx="endpointGripOffset" cy="0" r="10" @pointerdown.stop.prevent="startAnchorDrag($event, 'source')" />
  </g>
  <EdgeLabelRenderer v-if="data?.label || data?.xorGroup">
    <div
      :class="['edge-label', 'nodrag', 'nopan', { selected: routeSelected }]"
      title="Beschriftung ziehen, um sie relativ zum Ankerpunkt zu verschieben"
      :style="{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }"
      @pointerdown.stop.prevent="startLabelDrag"
    >
      <span v-if="data?.xorGroup" class="xor">(+)</span>{{ data?.label }}
    </div>
  </EdgeLabelRenderer>
</template>
