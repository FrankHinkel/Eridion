import type { RelationshipData } from './model'

export type Cardinality = RelationshipData['sourceCardinality']

export const RELATIONSHIP_STROKE_WIDTH = 1.4
export const RELATIONSHIP_SELECTED_STROKE_WIDTH = 2.2
export const RELATIONSHIP_DASH_PATTERN = '5 4'
export const RELATIONSHIP_BORDER_RADIUS = 8
export const RELATIONSHIP_PATH_OFFSET = 24

export interface CardinalityGeometry {
  maximumPath: string
  minimumPath: string
  optional: boolean
  minimumOffset: number
  circleRadius: number
  maximumOffset: number
  apexOffset: number
}

export function cardinalityGeometry(cardinality: Cardinality): CardinalityGeometry {
  const many = cardinality.includes('n')
  const optional = cardinality.startsWith('0')
  // Let the outer crow-foot prongs touch the table border. Half a stroke keeps
  // the SVG visible while removing the long middle prong seen at high zoom.
  const maximumOffset = many ? RELATIONSHIP_STROKE_WIDTH / 2 : 2.5
  const apexOffset = many ? 6 : maximumOffset
  const minimumOffset = many ? 8.5 : 5.65
  const halfHeight = 4.5
  return {
    maximumPath: many
      ? `M${maximumOffset} -${halfHeight} L${apexOffset} 0 M${maximumOffset} ${halfHeight} L${apexOffset} 0`
      : `M${maximumOffset} -${halfHeight} L${maximumOffset} ${halfHeight}`,
    minimumPath: `M${minimumOffset} -${halfHeight} L${minimumOffset} ${halfHeight}`,
    optional,
    minimumOffset,
    circleRadius: 2,
    maximumOffset,
    apexOffset
  }
}
