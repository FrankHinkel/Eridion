<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, Position, useVueFlow, type EdgeProps } from '@vue-flow/core'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useDocumentState } from '../document-state'
import {
  cardinalityGeometry, RELATIONSHIP_DASH_PATTERN,
  RELATIONSHIP_SELECTED_STROKE_WIDTH, RELATIONSHIP_STROKE_WIDTH
} from '../relationship-geometry'
import { helperPassThroughAxis, relationshipPath, relationshipPathSections, snapRouteCoordinate, type RelationshipRouteAxis } from '../relationship-path'
import { columnAwareRelationshipAnchor, type EridionDocument, type RelationshipColumnBounds, type RelationshipData } from '../model'

const props = defineProps<EdgeProps<RelationshipData>>()
const state = useDocumentState()
const document = state.document as unknown as { value: EridionDocument }
const { screenToFlowCoordinate, viewport } = useVueFlow()
const path = computed(() => relationshipPath({
  sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
  targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
  data: props.data
}))
const routeSections = computed(() => relationshipPathSections({
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
const routeHovered = ref(false)

function positionAngle(position: Position | undefined): number {
  if (position === Position.Bottom) return 90
  if (position === Position.Left) return 180
  if (position === Position.Top) return -90
  return 0
}

let stopDrag: (() => void) | undefined

function straightPathRange(path: SVGPathElement, from: number, to: number, axis: RelationshipRouteAxis): boolean {
  const reference = path.getPointAtLength(to)
  for (let index = 0; index <= 8; index += 1) {
    const point = path.getPointAtLength(from + (to - from) * index / 8)
    const deviation = axis === 'horizontal' ? Math.abs(point.y - reference.y) : Math.abs(point.x - reference.x)
    if (deviation > 0.75) return false
  }
  return true
}

function routeDragHelpers(
  event: PointerEvent,
  sectionIndex: number,
  routePoints: Array<{ x: number; y: number }>
): Array<{ index: number; axis: RelationshipRouteAxis }> {
  const pathElement = event.currentTarget as SVGPathElement
  const length = pathElement.getTotalLength()
  if (!length) return []
  const pointer = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const samples = Math.min(160, Math.max(24, Math.ceil(length / 12)))
  let step = length / samples
  let nearestLength = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index <= samples; index += 1) {
    const candidateLength = index * step
    const candidate = pathElement.getPointAtLength(candidateLength)
    const distance = Math.hypot(candidate.x - pointer.x, candidate.y - pointer.y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestLength = candidateLength
    }
  }
  for (let iteration = 0; iteration < 6; iteration += 1) {
    step /= 2
    for (const candidateLength of [Math.max(0, nearestLength - step), Math.min(length, nearestLength + step)]) {
      const candidate = pathElement.getPointAtLength(candidateLength)
      const distance = Math.hypot(candidate.x - pointer.x, candidate.y - pointer.y)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestLength = candidateLength
      }
    }
  }
  const before = pathElement.getPointAtLength(Math.max(0, nearestLength - 3))
  const after = pathElement.getPointAtLength(Math.min(length, nearestLength + 3))
  const draggedAxis: RelationshipRouteAxis = Math.abs(after.x - before.x) >= Math.abs(after.y - before.y)
    ? 'horizontal'
    : 'vertical'
  const points = [{ x: props.sourceX, y: props.sourceY }, ...routePoints, { x: props.targetX, y: props.targetY }]
  const helpers: Array<{ index: number; axis: RelationshipRouteAxis }> = []
  if (sectionIndex > 0) {
    const sourceHelperIndex = sectionIndex - 1
    const axis = helperPassThroughAxis(points[sourceHelperIndex], points[sourceHelperIndex + 2])
    if (axis === draggedAxis && straightPathRange(pathElement, 0, nearestLength, axis)) {
      helpers.push({ index: sourceHelperIndex, axis })
    }
  }
  if (sectionIndex < routePoints.length) {
    const targetHelperIndex = sectionIndex
    const axis = helperPassThroughAxis(points[targetHelperIndex], points[targetHelperIndex + 2])
    if (axis === draggedAxis && straightPathRange(pathElement, nearestLength, length, axis)) {
      helpers.push({ index: targetHelperIndex, axis })
    }
  }
  return helpers
}

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

function startRouteDrag(event: PointerEvent, sectionIndex = 0) {
  if (event.button !== 0) return
  const relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data
  if (!relationship) return
  if (event.ctrlKey || event.metaKey) {
    addRoutePoint(event, relationship, sectionIndex)
    return
  }
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = props.id
  const start = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const routeX = path.value[1]
  const routeY = path.value[2]
  const baseRoute = relationshipPath({
    sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
    targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
    data: { ...relationship, routeOffsetX: 0, routeOffsetY: 0 }
  })
  const routeType = relationship.routeType ?? 'smoothstep'
  const sameSideTurn = (routeType === 'smoothstep' || routeType === 'step')
    && props.sourcePosition === props.targetPosition
  const horizontalTurn = sameSideTurn && (props.sourcePosition === Position.Left || props.sourcePosition === Position.Right)
  const originalPoints = relationship.routePoints?.map((point) => ({ ...point })) ?? []
  const draggedHelpers = originalPoints.length && (routeType === 'smoothstep' || routeType === 'step')
    ? routeDragHelpers(event, sectionIndex, originalPoints)
    : []
  const originalSectionOffsets = Array.from({ length: originalPoints.length + 1 }, (_value, index) => ({
    x: relationship.routeSectionOffsets?.[index]?.x ?? 0,
    y: relationship.routeSectionOffsets?.[index]?.y ?? 0
  }))
  const currentSection = routeSections.value[sectionIndex]
  const baseSections = originalPoints.length && (routeType === 'smoothstep' || routeType === 'step')
    ? relationshipPathSections({
      sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
      targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
      data: {
        ...relationship,
        routeSectionOffsets: originalSectionOffsets.map((offset, index) =>
          index === sectionIndex ? { x: 0, y: 0 } : offset
        )
      }
    })
    : []
  const baseSection = baseSections[sectionIndex]
  const move = (moveEvent: PointerEvent) => {
    const current = screenToFlowCoordinate({ x: moveEvent.clientX, y: moveEvent.clientY })
    const deltaX = current.x - start.x
    const deltaY = current.y - start.y
    const precise = moveEvent.ctrlKey || moveEvent.metaKey
    if (draggedHelpers.length) {
      relationship.routePoints = originalPoints.map((point, index) => {
        const draggedHelper = draggedHelpers.find((helper) => helper.index === index)
        return draggedHelper ? {
          x: draggedHelper.axis === 'vertical' ? snapRouteCoordinate(point.x + deltaX, precise) : point.x,
          y: draggedHelper.axis === 'horizontal' ? snapRouteCoordinate(point.y + deltaY, precise) : point.y
        } : point
      })
    } else if (originalPoints.length && currentSection && baseSection && (routeType === 'smoothstep' || routeType === 'step')) {
      relationship.routeSectionOffsets = originalSectionOffsets.map((offset, index) => index === sectionIndex ? {
        x: Math.round((snapRouteCoordinate(currentSection[1] + deltaX, precise) - baseSection[1]) * 1000) / 1000,
        y: Math.round((snapRouteCoordinate(currentSection[2] + deltaY, precise) - baseSection[2]) * 1000) / 1000
      } : offset)
    } else if (originalPoints.length) {
      relationship.routePoints = originalPoints.map((point) => ({
        x: snapRouteCoordinate(point.x + deltaX, precise),
        y: snapRouteCoordinate(point.y + deltaY, precise)
      }))
    } else {
      if (!sameSideTurn || horizontalTurn) {
        relationship.routeOffsetX = Math.round((snapRouteCoordinate(routeX + deltaX, precise) - baseRoute[1]) * 1000) / 1000
      }
      if (!sameSideTurn || !horizontalTurn) {
        relationship.routeOffsetY = Math.round((snapRouteCoordinate(routeY + deltaY, precise) - baseRoute[2]) * 1000) / 1000
      }
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

function addRoutePoint(
  event: PointerEvent,
  relationship = document.value.relationships.find((edge) => edge.id === props.id)?.data,
  preferredSection?: number
) {
  if (!relationship) return
  state.selectedNodeId.value = undefined
  state.selectedEdgeId.value = props.id
  const raw = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const point = { x: Math.round(raw.x), y: Math.round(raw.y) }
  const points = relationship.routePoints?.map((item) => ({ ...item })) ?? []
  const segments = [{ x: props.sourceX, y: props.sourceY }, ...points, { x: props.targetX, y: props.targetY }]
  let insertAt = preferredSection ?? 0
  if (preferredSection === undefined) {
    let distance = Number.POSITIVE_INFINITY
    for (let index = 0; index < segments.length - 1; index += 1) {
      const candidate = pointSegmentDistance(point, segments[index], segments[index + 1])
      if (candidate < distance) { distance = candidate; insertAt = index }
    }
  }
  points.splice(insertAt, 0, point)
  relationship.routePoints = points
  const sectionOffsets = Array.from({ length: segments.length - 1 }, (_value, index) => ({
    x: relationship.routeSectionOffsets?.[index]?.x ?? 0,
    y: relationship.routeSectionOffsets?.[index]?.y ?? 0
  }))
  const splitOffset = sectionOffsets[insertAt] ?? { x: 0, y: 0 }
  sectionOffsets.splice(insertAt, 1, { ...splitOffset }, { ...splitOffset })
  relationship.routeSectionOffsets = sectionOffsets
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
  const sectionOffsets = Array.from({ length: relationship.routePoints.length + 1 }, (_value, offsetIndex) => ({
    x: relationship.routeSectionOffsets?.[offsetIndex]?.x ?? 0,
    y: relationship.routeSectionOffsets?.[offsetIndex]?.y ?? 0
  }))
  relationship.routePoints.splice(index, 1)
  sectionOffsets.splice(index, 2, { x: 0, y: 0 })
  relationship.routeSectionOffsets = relationship.routePoints.length ? sectionOffsets : []
  state.changed()
}

function tableElement(nodeId: string): HTMLElement | undefined {
  return Array.from(window.document.querySelectorAll<HTMLElement>('.vue-flow__node-table'))
    .find((node) => node.dataset.id === nodeId)
    ?.querySelector<HTMLElement>('.erd-table') ?? undefined
}

function columnBounds(table: HTMLElement): RelationshipColumnBounds[] {
  return Array.from(table.querySelectorAll<HTMLElement>('.table-column[data-column-id]')).map((column) => {
    const rect = column.getBoundingClientRect()
    return { id: column.dataset.columnId!, top: rect.top, bottom: rect.bottom }
  })
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
    relationship[key] = columnAwareRelationshipAnchor(
      table.getBoundingClientRect(), moveEvent.clientX, moveEvent.clientY,
      columnBounds(table),
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
  <path v-if="routeHovered" class="edge-route-hover" :d="path[0]" fill="none" pointer-events="none" />
  <path
    v-for="(section, index) in routeSections" :key="`route-section-${index}`"
    class="edge-route-drag nodrag nopan" :d="section[0]" fill="none" stroke="#000" stroke-opacity="0.001" stroke-width="32"
    pointer-events="stroke" @pointerenter="routeHovered = true" @pointerleave="routeHovered = false"
    @pointerdown.stop.prevent="startRouteDrag($event, index)"
  />
  <g v-if="routeSelected && data?.routePoints?.length">
    <rect
      v-for="(point, index) in data.routePoints" :key="index" class="edge-route-point nodrag nopan"
      :x="point.x - 4" :y="point.y - 4" width="8" height="8" rx="1"
      title="Ziehen; doppelklicken zum Entfernen"
      @pointerenter="routeHovered = true" @pointerleave="routeHovered = false"
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
