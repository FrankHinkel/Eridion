import { getBezierPath, getSmoothStepPath, getStraightPath, Position } from '@vue-flow/core'
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

export type RelationshipPathResult = [string, number, number, number, number]

export function snapRouteCoordinate(value: number, precise: boolean): number {
  return precise ? Math.round(value) : Math.round(value / RELATIONSHIP_ROUTE_GRID) * RELATIONSHIP_ROUTE_GRID
}

interface RoutePoint {
  x: number
  y: number
}

export type RelationshipRouteAxis = 'horizontal' | 'vertical'

function routePointDistance(first: RoutePoint, second: RoutePoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function roundedBend(previous: RoutePoint, point: RoutePoint, next: RoutePoint, radius: number): string {
  const bend = Math.min(routePointDistance(previous, point) / 2, routePointDistance(point, next) / 2, radius)
  if (!bend || (previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y)) {
    return `L${point.x} ${point.y}`
  }
  if (previous.y === point.y) {
    const xDirection = previous.x < next.x ? -1 : 1
    const yDirection = previous.y < next.y ? 1 : -1
    return `L${point.x + bend * xDirection} ${point.y} Q${point.x} ${point.y} ${point.x} ${point.y + bend * yDirection}`
  }
  const xDirection = previous.x < next.x ? 1 : -1
  const yDirection = previous.y < next.y ? -1 : 1
  return `L${point.x} ${point.y + bend * yDirection} Q${point.x} ${point.y} ${point.x + bend * xDirection} ${point.y}`
}

function roundedOrthogonalPath(points: RoutePoint[], radius: number): string {
  return points.map((point, index) => {
    if (!index) return `M${point.x} ${point.y}`
    if (index === points.length - 1) return `L${point.x} ${point.y}`
    return roundedBend(points[index - 1], point, points[index + 1], radius)
  }).join(' ')
}

export function helperPassThroughAxis(previous: RoutePoint, next: RoutePoint): RelationshipRouteAxis {
  const dx = next.x - previous.x
  const dy = next.y - previous.y
  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical'
}

function helperPassThroughPositions(previous: RoutePoint, next: RoutePoint): { incoming: Position; outgoing: Position } {
  const dx = next.x - previous.x
  const dy = next.y - previous.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { incoming: Position.Left, outgoing: Position.Right }
      : { incoming: Position.Right, outgoing: Position.Left }
  }
  return dy >= 0
    ? { incoming: Position.Top, outgoing: Position.Bottom }
    : { incoming: Position.Bottom, outgoing: Position.Top }
}

function helperPointSections(
  points: RoutePoint[],
  sourcePosition: Position | undefined,
  targetPosition: Position | undefined,
  borderRadius: number,
  offsets: readonly { x: number; y: number }[]
): RelationshipPathResult[] {
  const helperPositions = points.slice(1, -1).map((_point, index) =>
    helperPassThroughPositions(points[index], points[index + 2])
  )
  return points.slice(0, -1).map((source, index) => {
    const target = points[index + 1]
    const sectionSourcePosition = index === 0 ? sourcePosition : helperPositions[index - 1].outgoing
    const sectionTargetPosition = index === points.length - 2 ? targetPosition : helperPositions[index].incoming
    const offset = offsets[index] ?? { x: 0, y: 0 }
    if (sectionSourcePosition && sectionSourcePosition === sectionTargetPosition) {
      return uTurnPath(source, target, sectionSourcePosition, offset.x, offset.y, borderRadius)
    }
    return getSmoothStepPath({
      sourceX: source.x,
      sourceY: source.y,
      sourcePosition: sectionSourcePosition,
      targetX: target.x,
      targetY: target.y,
      targetPosition: sectionTargetPosition,
      centerX: (source.x + target.x) / 2 + offset.x,
      centerY: (source.y + target.y) / 2 + offset.y,
      borderRadius,
      offset: RELATIONSHIP_PATH_OFFSET
    })
  })
}

function uTurnPath(
  source: RoutePoint,
  target: RoutePoint,
  position: Position,
  offsetX: number,
  offsetY: number,
  borderRadius: number
): RelationshipPathResult {
  if (position === Position.Left || position === Position.Right) {
    const direction = position === Position.Right ? 1 : -1
    const routeX = (direction > 0 ? Math.max(source.x, target.x) : Math.min(source.x, target.x))
      + direction * RELATIONSHIP_PATH_OFFSET + offsetX
    const centerY = (source.y + target.y) / 2
    return [
      roundedOrthogonalPath([source, { x: routeX, y: source.y }, { x: routeX, y: target.y }, target], borderRadius),
      routeX, centerY, Math.abs(routeX - source.x), Math.abs(centerY - source.y)
    ]
  }
  const direction = position === Position.Bottom ? 1 : -1
  const routeY = (direction > 0 ? Math.max(source.y, target.y) : Math.min(source.y, target.y))
    + direction * RELATIONSHIP_PATH_OFFSET + offsetY
  const centerX = (source.x + target.x) / 2
  return [
    roundedOrthogonalPath([source, { x: source.x, y: routeY }, { x: target.x, y: routeY }, target], borderRadius),
    centerX, routeY, Math.abs(centerX - source.x), Math.abs(routeY - source.y)
  ]
}

export function relationshipPathSections(params: RelationshipPathParams): RelationshipPathResult[] {
  const routeType = params.data?.routeType ?? 'smoothstep'
  const routePoints = params.data?.routePoints ?? []
  if (!routePoints.length || (routeType !== 'smoothstep' && routeType !== 'step')) return [relationshipPath(params)]
  return helperPointSections(
    [{ x: params.sourceX, y: params.sourceY }, ...routePoints, { x: params.targetX, y: params.targetY }],
    params.sourcePosition,
    params.targetPosition,
    routeType === 'step' ? 0 : RELATIONSHIP_BORDER_RADIUS,
    params.data?.routeSectionOffsets ?? []
  )
}

export function relationshipPath(params: RelationshipPathParams): RelationshipPathResult {
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
    const path = routeType === 'smoothstep' || routeType === 'step'
      ? helperPointSections(
        points, sourcePosition, targetPosition, routeType === 'step' ? 0 : RELATIONSHIP_BORDER_RADIUS,
        params.data?.routeSectionOffsets ?? []
      ).map((section) => section[0]).join(' ')
      : points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')
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

  const borderRadius = routeType === 'step' ? 0 : RELATIONSHIP_BORDER_RADIUS
  if (sourcePosition && sourcePosition === targetPosition) {
    return uTurnPath(
      { x: sourceX, y: sourceY }, { x: targetX, y: targetY }, sourcePosition,
      offsetX, offsetY, borderRadius
    )
  }

  return getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    centerX, centerY,
    borderRadius,
    offset: RELATIONSHIP_PATH_OFFSET
  })
}
