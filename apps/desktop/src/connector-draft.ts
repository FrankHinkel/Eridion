import { ref } from 'vue'
import type { RelationshipAnchor } from './model'

export interface SnapTarget {
  nodeId: string
  anchor: RelationshipAnchor
}

export const connectorSource = ref<SnapTarget>()
export const connectorHover = ref<SnapTarget>()
export const connectorPointer = ref<{ sourceX: number; sourceY: number; currentX: number; currentY: number }>()

export function setConnectorHover(value: SnapTarget | undefined) {
  connectorHover.value = value
}

export function startConnector(value: SnapTarget, point: { x: number; y: number }) {
  connectorSource.value = value
  connectorHover.value = undefined
  connectorPointer.value = { sourceX: point.x, sourceY: point.y, currentX: point.x, currentY: point.y }
}

export function moveConnectorPointer(point: { x: number; y: number }) {
  if (connectorPointer.value) connectorPointer.value = { ...connectorPointer.value, currentX: point.x, currentY: point.y }
}

export function cancelConnector() {
  connectorSource.value = undefined
  connectorHover.value = undefined
  connectorPointer.value = undefined
}

export function takeConnectorTarget(): { source: SnapTarget; target: SnapTarget } | undefined {
  const source = connectorSource.value
  const target = connectorHover.value
  cancelConnector()
  if (!source || !target) return
  const sameAnchor = source.anchor.side === target.anchor.side
    && source.anchor.position === target.anchor.position
    && source.anchor.columnId === target.anchor.columnId
    && source.anchor.columnOffset === target.anchor.columnOffset
  if (source.nodeId === target.nodeId && sameAnchor) return
  return { source, target }
}
