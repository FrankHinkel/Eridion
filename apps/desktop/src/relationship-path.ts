import { getBezierPath, getSmoothStepPath, getStraightPath, type Position } from '@vue-flow/core'
import type { RelationshipData } from './model'
import { RELATIONSHIP_BORDER_RADIUS, RELATIONSHIP_PATH_OFFSET } from './relationship-geometry'

export const RELATIONSHIP_ROUTE_GRID = 10

export interface RelationshipPathParams {
  sourceX: number
  sourceY: number
  sourcePosition?: Position
  targetX: number
  targetY: number
  targetPosition?: Position
  data?: RelationshipData
}

export function snapRouteCoordinate(value: number, precise: boolean): number {
  return precise ? Math.round(value) : Math.round(value / RELATIONSHIP_ROUTE_GRID) * RELATIONSHIP_ROUTE_GRID
}

export function relationshipPath(params: RelationshipPathParams): [string, number, number, number, number] {
  const { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition } = params
  const routeType = params.data?.routeType ?? 'smoothstep'
  const offsetX = params.data?.routeOffsetX ?? 0
  const offsetY = params.data?.routeOffsetY ?? 0
  const centerX = (sourceX + targetX) / 2 + offsetX
  const centerY = (sourceY + targetY) / 2 + offsetY
  const hasManualRoute = Math.abs(offsetX) > 0.001 || Math.abs(offsetY) > 0.001
  const routePoints = params.data?.routePoints ?? []

  if (routePoints.length) {
    const points = [{ x: sourceX, y: sourceY }, ...routePoints, { x: targetX, y: targetY }]
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')
    const middle = routePoints[Math.floor((routePoints.length - 1) / 2)]
    return [path, middle.x, middle.y, Math.abs(middle.x - sourceX), Math.abs(middle.y - sourceY)]
  }

  if (routeType === 'straight') {
    if (!hasManualRoute) return getStraightPath({ sourceX, sourceY, targetX, targetY })
    const path = `M${sourceX} ${sourceY} L${centerX} ${centerY} L${targetX} ${targetY}`
    return [path, centerX, centerY, Math.abs(centerX - sourceX), Math.abs(centerY - sourceY)]
  }

  if (routeType === 'bezier') {
    if (!hasManualRoute) return getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
    const controlX = 2 * centerX - (sourceX + targetX) / 2
    const controlY = 2 * centerY - (sourceY + targetY) / 2
    const path = `M${sourceX} ${sourceY} Q${controlX} ${controlY} ${targetX} ${targetY}`
    return [path, centerX, centerY, Math.abs(centerX - sourceX), Math.abs(centerY - sourceY)]
  }

  return getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    centerX, centerY,
    borderRadius: routeType === 'step' ? 0 : RELATIONSHIP_BORDER_RADIUS,
    offset: RELATIONSHIP_PATH_OFFSET
  })
}
