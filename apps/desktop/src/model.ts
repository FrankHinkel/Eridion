import type { Edge, Node } from '@vue-flow/core'
import {
  TABLE_NAME_CHARACTER_WIDTH, TABLE_ROW_FIXED_WIDTH, TABLE_TYPE_CHARACTER_WIDTH, TABLE_TYPE_MIN_CHARACTERS
} from './render-metrics'

const CSS_PIXELS_PER_MM = 96 / 25.4
export const TABLE_BASE_RENDER_SCALE = 0.75

export type PageFormat = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'Letter' | 'Legal'
export type PageOrientation = 'landscape' | 'portrait'

const PAGE_FORMATS_MM: Record<PageFormat, { width: number; height: number }> = {
  A0: { width: 841, height: 1189 },
  A1: { width: 594, height: 841 },
  A2: { width: 420, height: 594 },
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 }
}

export interface DiagramColumn {
  id: string
  name: string
  typeName: string
  nullable: boolean
  primaryKey: boolean
  foreignKey: boolean
  remarks?: string
}

export interface TableNodeData {
  kind: 'table'
  schema?: string
  name: string
  alias?: string
  objectType: 'TABLE' | 'VIEW'
  columns: DiagramColumn[]
  scale: number
  color?: string
  headerColor?: string
  showTypes?: boolean
  showIcons?: boolean
}

export interface TextNodeData {
  kind: 'text'
  text: string
  scale: number
  color?: string
  fontSize: number
  backgroundColor?: string
  markdown?: boolean
  textAlign?: 'left' | 'center' | 'right'
  width?: number
  height?: number
}

export interface InfoBlockNodeData {
  kind: 'infoBlock'
  scale: number
  heading: string
  infoText: string
  author: string
  repeatMode: 'current' | 'all' | 'range'
  pageRange: string
  showDocumentName: boolean
  showPageName: boolean
  showPageNumber: boolean
  showSavedAt: boolean
  showAuthor: boolean
  showDocumentId: boolean
  showInfo: boolean
  anchor: InfoBlockAnchor
  anchorOffsetX: number
  anchorOffsetY: number
}

export type InfoBlockAnchor = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left'

export type DiagramNodeData = TableNodeData | TextNodeData | InfoBlockNodeData
export type DiagramNode = Omit<Node<DiagramNodeData>, 'data'> & { data: DiagramNodeData; pageId: string }

const VIRTUAL_PAGE_MARKER = '__eridion_page__'

export function storedNodeId(nodeId: string): string {
  return nodeId.split(VIRTUAL_PAGE_MARKER)[0]
}

export function renderedNodePageId(document: EridionDocument, nodeId: string): string | undefined {
  const markerIndex = nodeId.indexOf(VIRTUAL_PAGE_MARKER)
  if (markerIndex >= 0) return nodeId.slice(markerIndex + VIRTUAL_PAGE_MARKER.length)
  return document.nodes.find((node) => node.id === nodeId)?.pageId
}

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left'
export interface RelationshipAnchor {
  side: AnchorSide
  position: number
  columnId?: string
  columnOffset?: number
}

export interface RelationshipColumnBounds {
  id: string
  top: number
  bottom: number
}

const TABLE_HEADER_HEIGHT = 32
const TABLE_ALIAS_HEIGHT = 22
const TABLE_COLUMN_HEIGHT = 18

function clampAnchorPosition(value: number): number {
  return Math.round(Math.max(-1, Math.min(1, value)) * 1000) / 1000
}

export function tableColumnAnchorPosition(data: TableNodeData, columnId: string): number | undefined {
  const columns = sortTableColumns(data.columns)
  const index = columns.findIndex((column) => column.id === columnId)
  if (index < 0) return undefined
  const height = TABLE_HEADER_HEIGHT + (data.alias ? TABLE_ALIAS_HEIGHT : 0) + Math.max(1, columns.length) * TABLE_COLUMN_HEIGHT
  const center = TABLE_HEADER_HEIGHT + (data.alias ? TABLE_ALIAS_HEIGHT : 0) + (index + 0.5) * TABLE_COLUMN_HEIGHT
  return clampAnchorPosition(center / height * 2 - 1)
}

export function resolvedRelationshipAnchor(anchor: RelationshipAnchor | undefined, data: TableNodeData): RelationshipAnchor | undefined {
  if (!anchor?.columnId || (anchor.side !== 'left' && anchor.side !== 'right')) return anchor
  const columnPosition = tableColumnAnchorPosition(data, anchor.columnId)
  if (columnPosition === undefined) return { side: anchor.side, position: anchor.position }
  return {
    ...anchor,
    position: clampAnchorPosition(columnPosition + (anchor.columnOffset ?? 0))
  }
}

export interface RectangleBounds {
  left: number
  top: number
  width: number
  height: number
}

export function nearestRelationshipAnchor(
  rect: RectangleBounds,
  clientX: number,
  clientY: number,
  precise = false
): { anchor: RelationshipAnchor; distance: number } {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
  const candidates: Array<{ side: AnchorSide; x: number; y: number }> = [
    { side: 'top', x: clamp(clientX, rect.left, right), y: rect.top },
    { side: 'right', x: right, y: clamp(clientY, rect.top, bottom) },
    { side: 'bottom', x: clamp(clientX, rect.left, right), y: bottom },
    { side: 'left', x: rect.left, y: clamp(clientY, rect.top, bottom) }
  ]
  const nearest = candidates.reduce<{ side: AnchorSide; x: number; y: number; distance: number }>((best, candidate) => {
    const distance = Math.hypot(clientX - candidate.x, clientY - candidate.y)
    return distance < best.distance ? { ...candidate, distance } : best
  }, { ...candidates[0], distance: Number.POSITIVE_INFINITY })
  const rawPosition = nearest.side === 'top' || nearest.side === 'bottom'
    ? (nearest.x - rect.left) / Math.max(1, rect.width) * 2 - 1
    : (nearest.y - rect.top) / Math.max(1, rect.height) * 2 - 1
  const step = precise ? 0.001 : 0.05
  const position = Math.round(clamp(rawPosition, -1, 1) / step) * step
  return {
    anchor: { side: nearest.side, position: Math.round(position * 1000) / 1000 },
    distance: nearest.distance
  }
}

export function alignedRelationshipAnchor(
  rect: RectangleBounds,
  clientX: number,
  clientY: number,
  otherEndpoint: { x: number; y: number } | undefined,
  precise = false,
  alignmentThreshold = 10
): { anchor: RelationshipAnchor; aligned?: 'horizontal' | 'vertical' } {
  const exact = nearestRelationshipAnchor(rect, clientX, clientY, true).anchor
  if (precise || !otherEndpoint) return { anchor: exact }
  if ((exact.side === 'left' || exact.side === 'right')
    && otherEndpoint.y >= rect.top && otherEndpoint.y <= rect.top + rect.height
    && Math.abs(clientY - otherEndpoint.y) <= alignmentThreshold) {
    const position = (otherEndpoint.y - rect.top) / Math.max(1, rect.height) * 2 - 1
    return { anchor: { side: exact.side, position: Math.round(position * 1000) / 1000 }, aligned: 'horizontal' }
  }
  if ((exact.side === 'top' || exact.side === 'bottom')
    && otherEndpoint.x >= rect.left && otherEndpoint.x <= rect.left + rect.width
    && Math.abs(clientX - otherEndpoint.x) <= alignmentThreshold) {
    const position = (otherEndpoint.x - rect.left) / Math.max(1, rect.width) * 2 - 1
    return { anchor: { side: exact.side, position: Math.round(position * 1000) / 1000 }, aligned: 'vertical' }
  }
  return { anchor: nearestRelationshipAnchor(rect, clientX, clientY, false).anchor }
}

export function columnAwareRelationshipAnchor(
  rect: RectangleBounds,
  clientX: number,
  clientY: number,
  columns: readonly RelationshipColumnBounds[],
  otherEndpoint?: { x: number; y: number },
  precise = false
): { anchor: RelationshipAnchor; aligned?: 'horizontal' | 'vertical' } {
  const exact = nearestRelationshipAnchor(rect, clientX, clientY, true).anchor
  if ((exact.side === 'left' || exact.side === 'right') && columns.length) {
    const nearestColumn = columns.reduce((best, column) => {
      const distance = Math.abs(clientY - (column.top + column.bottom) / 2)
      return distance < best.distance ? { column, distance } : best
    }, { column: columns[0], distance: Number.POSITIVE_INFINITY })
    const insideColumns = columns.some((column) => clientY >= column.top && clientY <= column.bottom)
    if (precise || insideColumns) {
      const centerY = (nearestColumn.column.top + nearestColumn.column.bottom) / 2
      const centerPosition = (centerY - rect.top) / Math.max(1, rect.height) * 2 - 1
      const exactPosition = (clientY - rect.top) / Math.max(1, rect.height) * 2 - 1
      const columnOffset = precise ? clampAnchorPosition(exactPosition - centerPosition) : 0
      return {
        anchor: {
          side: exact.side,
          position: clampAnchorPosition(centerPosition + columnOffset),
          columnId: nearestColumn.column.id,
          ...(columnOffset ? { columnOffset } : {})
        }
      }
    }
  }
  if (!precise && !otherEndpoint) return { anchor: nearestRelationshipAnchor(rect, clientX, clientY, false).anchor }
  return alignedRelationshipAnchor(rect, clientX, clientY, otherEndpoint, precise)
}

export function parseSnapAnchor(handle: string | null | undefined, fallback: AnchorSide): RelationshipAnchor {
  const match = handle?.match(/^snap-(?:source|target)-(top|right|bottom|left)-(-?\d+(?:\.\d+)?)$/)
  return {
    side: (match?.[1] as AnchorSide | undefined) ?? fallback,
    position: match ? Math.max(-1, Math.min(1, Number(match[2]))) : 0
  }
}

export interface RelationshipData {
  sourceCardinality: '0..1' | '1' | '0..n' | '1..n'
  targetCardinality: '0..1' | '1' | '0..n' | '1..n'
  imported: boolean
  label?: string
  labelOffsetX?: number
  labelOffsetY?: number
  sourceAnchor?: RelationshipAnchor
  targetAnchor?: RelationshipAnchor
  relationshipKey?: string
  xorGroup?: string
  color?: string
  optional?: boolean
  routeType?: 'smoothstep' | 'step' | 'bezier' | 'straight'
  routeOffsetX?: number
  routeOffsetY?: number
  routePoints?: Array<{ x: number; y: number }>
  routeSectionOffsets?: Array<{ x: number; y: number }>
}

export type DiagramEdge = Omit<Edge<RelationshipData>, 'data'> & { data: RelationshipData }

export interface DiagramStyles {
  tableColor: string
  tableHeaderColor: string
  tableTextColor: string
  relationshipColor: string
  showTypes: boolean
  showIcons: boolean
  baseScale: number
}

export interface PageSettings {
  format: PageFormat
  orientation: PageOrientation
  marginMm?: number
  marginTopMm?: number
  marginRightMm?: number
  marginBottomMm?: number
  marginLeftMm?: number
  showPageNumbers: boolean
}

export function pageMargins(settings: PageSettings): { top: number; right: number; bottom: number; left: number } {
  const legacy = settings.marginMm ?? 8
  return {
    top: settings.marginTopMm ?? legacy,
    right: settings.marginRightMm ?? legacy,
    bottom: settings.marginBottomMm ?? legacy,
    left: settings.marginLeftMm ?? legacy
  }
}

export interface DiagramPage {
  id: string
  name: string
  tableScale: number
}

export function reorderPages(pages: readonly DiagramPage[], draggedId: string, targetId: string, after: boolean): DiagramPage[] {
  if (draggedId === targetId) return [...pages]
  const dragged = pages.find((page) => page.id === draggedId)
  if (!dragged || !pages.some((page) => page.id === targetId)) return [...pages]
  const reordered = pages.filter((page) => page.id !== draggedId)
  const targetIndex = reordered.findIndex((page) => page.id === targetId)
  reordered.splice(targetIndex + (after ? 1 : 0), 0, dragged)
  return reordered
}

export function movePageToTarget(pages: readonly DiagramPage[], draggedId: string, targetId: string): DiagramPage[] {
  const draggedIndex = pages.findIndex((page) => page.id === draggedId)
  const targetIndex = pages.findIndex((page) => page.id === targetId)
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return [...pages]
  return reorderPages(pages, draggedId, targetId, draggedIndex < targetIndex)
}

export function deletePage(document: EridionDocument, pageId: string): { deleted: boolean; nextPageId?: string } {
  if (document.pages.length <= 1) return { deleted: false }
  const pageIndex = document.pages.findIndex((page) => page.id === pageId)
  if (pageIndex < 0) return { deleted: false }
  const nextPage = document.pages[pageIndex + 1] ?? document.pages[pageIndex - 1]
  if (!nextPage) return { deleted: false }

  const deletedNodeIds = new Set<string>()
  document.nodes = document.nodes.flatMap((node) => {
    if (node.pageId !== pageId) return [node]
    if (node.data.kind === 'infoBlock' && node.data.repeatMode !== 'current') {
      return [{ ...node, pageId: nextPage.id }]
    }
    deletedNodeIds.add(node.id)
    return []
  })
  document.relationships = document.relationships.filter((edge) =>
    !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target)
  )
  document.pages.splice(pageIndex, 1)
  return { deleted: true, nextPageId: nextPage.id }
}

export function duplicatePage(document: EridionDocument, sourcePageId: string, targetPageId = sourcePageId): DiagramPage | undefined {
  const sourcePage = document.pages.find((page) => page.id === sourcePageId)
  const targetIndex = document.pages.findIndex((page) => page.id === targetPageId)
  if (!sourcePage || targetIndex < 0) return undefined
  const page: DiagramPage = { ...sourcePage, id: crypto.randomUUID(), name: `${sourcePage.name} Kopie` }
  const sourceNodes = document.nodes.filter((node) =>
    node.pageId === sourcePageId && !(node.data.kind === 'infoBlock' && node.data.repeatMode !== 'current')
  )
  const nodeIds = new Map(sourceNodes.map((node) => [node.id, crypto.randomUUID()]))
  const clonedNodes = sourceNodes.map((node) => ({
    ...JSON.parse(JSON.stringify(node)) as DiagramNode,
    id: nodeIds.get(node.id)!,
    pageId: page.id
  }))
  const clonedEdges = document.relationships.flatMap((edge) => {
    const source = nodeIds.get(edge.source)
    const target = nodeIds.get(edge.target)
    if (!source || !target) return []
    const id = crypto.randomUUID()
    return [{
      ...JSON.parse(JSON.stringify(edge)) as DiagramEdge, id, source, target,
      sourceHandle: `source-${id}`, targetHandle: `target-${id}`
    }]
  })
  document.pages.splice(targetIndex + 1, 0, page)
  document.nodes.push(...clonedNodes)
  document.relationships.push(...clonedEdges)
  return page
}

export interface SchemaSnapshot {
  databaseProduct: string
  databaseVersion: string
  importedAt: string
  tables: SchemaTable[]
  relationships: SchemaRelationship[]
}

export interface SchemaTable {
  catalog?: string
  schema?: string
  name: string
  type: string
  remarks?: string
  columns: Array<{
    name: string
    typeName: string
    nullable: boolean
    primaryKey: boolean
    foreignKey: boolean
    remarks?: string
  }>
}

export interface SchemaRelationship {
  name?: string
  sourceSchema?: string
  sourceTable: string
  sourceColumn: string
  targetSchema?: string
  targetTable: string
  targetColumn: string
}

export interface EridionDocument {
  formatVersion: 1
  documentId: string
  title: string
  createdAt: string
  modifiedAt: string
  page: PageSettings
  pages: DiagramPage[]
  styles: DiagramStyles
  connectionReference?: string
  schemaSnapshot?: SchemaSnapshot
  nodes: DiagramNode[]
  relationships: DiagramEdge[]
}

export function newDocument(): EridionDocument {
  const now = new Date().toISOString()
  const firstPage = createPage(1)
  return {
    formatVersion: 1,
    documentId: crypto.randomUUID(),
    title: 'Unbenanntes Diagramm',
    createdAt: now,
    modifiedAt: now,
    page: {
      format: 'A4', orientation: 'landscape', marginMm: 8,
      marginTopMm: 8, marginRightMm: 8, marginBottomMm: 8, marginLeftMm: 8,
      showPageNumbers: true
    },
    pages: [firstPage],
    styles: {
      tableColor: '#ffffff',
      tableHeaderColor: '#dbeafe',
      tableTextColor: '#172033',
      relationshipColor: '#475569',
      showTypes: true,
      showIcons: true,
      baseScale: 1
    },
    nodes: [],
    relationships: []
  }
}

export function createPage(number: number): DiagramPage {
  return { id: crypto.randomUUID(), name: `Seite ${number}`, tableScale: 1 }
}

export function pageDimensions(settings: PageSettings): {
  width: number
  height: number
  widthMm: number
  heightMm: number
  ratio: number
} {
  const format = PAGE_FORMATS_MM[settings.format]
  const portrait = settings.orientation === 'portrait'
  const widthMm = portrait ? format.width : format.height
  const heightMm = portrait ? format.height : format.width
  const width = widthMm * CSS_PIXELS_PER_MM
  const height = heightMm * CSS_PIXELS_PER_MM
  return { width, height, widthMm, heightMm, ratio: width / height }
}

export function pageViewportScale(settings: PageSettings, viewportWidth: number, viewportHeight: number): number {
  const dimensions = pageDimensions(settings)
  return Math.min(viewportWidth / dimensions.width, viewportHeight / dimensions.height)
}

type SortableColumn = Pick<DiagramColumn, 'name' | 'primaryKey' | 'foreignKey'>

export function sortTableColumns<T extends SortableColumn>(columns: readonly T[]): T[] {
  const rank = (column: SortableColumn) => column.primaryKey ? 0 : column.foreignKey ? 1 : 2
  return [...columns].sort((left, right) => {
    const rankDifference = rank(left) - rank(right)
    return rankDifference || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function shortTypeName(typeName: string): string {
  const normalized = typeName.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return '–'
  const array = normalized.endsWith('[]')
  const base = (array ? normalized.slice(0, -2) : normalized).replace(/\([^)]*\)/g, '').trim()
  const abbreviation = (() => {
    if (['varchar', 'varchar2', 'character varying'].includes(base)) return 'VC'
    if (['nvarchar', 'nvarchar2', 'national character varying'].includes(base)) return 'NVC'
    if (['char', 'character', 'bpchar'].includes(base)) return 'CH'
    if (['nchar', 'national character'].includes(base)) return 'NCH'
    if (base === 'text') return 'TX'
    if (base === 'clob') return 'CLB'
    if (base === 'nclob') return 'NCLB'
    if (['bigint', 'int8', 'bigserial'].includes(base)) return 'I8'
    if (['integer', 'int', 'int4', 'serial'].includes(base)) return 'I4'
    if (['smallint', 'int2', 'smallserial'].includes(base)) return 'I2'
    if (['tinyint', 'int1'].includes(base)) return 'I1'
    if (['decimal', 'numeric', 'number', 'dec'].includes(base)) return 'DEC'
    if (['double', 'double precision', 'float8', 'binary_double'].includes(base)) return 'F8'
    if (['real', 'float4', 'binary_float'].includes(base)) return 'F4'
    if (['float'].includes(base)) return 'FLT'
    if (['boolean', 'bool', 'bit'].includes(base)) return 'BL'
    if (base === 'date') return 'DT'
    if (['timestamp with time zone', 'timestamp with local time zone', 'timestamptz'].includes(base)) return 'TSZ'
    if (['timestamp', 'timestamp without time zone', 'datetime', 'datetime2'].includes(base)) return 'TS'
    if (['time with time zone', 'timetz'].includes(base)) return 'TMZ'
    if (['time', 'time without time zone'].includes(base)) return 'TM'
    if (['bytea', 'binary', 'varbinary', 'longvarbinary', 'raw'].includes(base)) return 'BIN'
    if (['blob', 'longblob'].includes(base)) return 'BLB'
    if (base === 'json') return 'JS'
    if (base === 'jsonb') return 'JB'
    if (base === 'xml') return 'XML'
    if (['uniqueidentifier', 'uuid'].includes(base)) return 'UUID'
    if (base === 'interval') return 'IV'
    if (base === 'money') return 'MON'
    if (base === 'geometry') return 'GEO'
    if (base === 'geography') return 'GEOG'
    return base.replace(/[^a-z0-9_]/g, '').slice(0, 6).toUpperCase() || '?'
  })()
  return `${abbreviation}${array ? '[]' : ''}`
}

export function tableSize(data: TableNodeData): { width: number; height: number } {
  const scale = data.scale || 1
  const showIcons = data.showIcons !== false
  const showTypes = data.showTypes !== false
  const flagsWidth = data.columns.reduce((maximum, column) => Math.max(maximum,
    showIcons && (column.primaryKey || column.foreignKey) ? (column.primaryKey && column.foreignKey ? 22 : 11) : 0), 0)
  const nameWidth = data.columns.reduce((maximum, column) => Math.max(maximum, column.name.length * TABLE_NAME_CHARACTER_WIDTH), 0)
  const typeWidth = showTypes
    ? data.columns.reduce((maximum, column) => Math.max(maximum,
        Math.max(TABLE_TYPE_MIN_CHARACTERS, shortTypeName(column.typeName).length) * TABLE_TYPE_CHARACTER_WIDTH), 0)
    : 0
  const rowWidth = flagsWidth + nameWidth + typeWidth + TABLE_ROW_FIXED_WIDTH
  const headerWidth = Math.max(data.name.length * 6.8 + 8, `${data.schema ?? ''}${data.objectType}`.length * 4.5 + 18)
  const aliasWidth = data.alias ? data.alias.length * 7.5 + 8 : 0
  return {
    width: Math.max(84, Math.min(520, Math.ceil(Math.max(rowWidth, headerWidth, aliasWidth)))) * scale,
    height: (32 + (data.alias ? 22 : 0) + Math.max(1, data.columns.length) * 18) * scale
  }
}

export function textSize(data: TextNodeData): { width: number; height: number } {
  const lines = data.text.split('\n')
  return {
    width: (data.width ?? Math.max(180, Math.min(520, Math.max(...lines.map((line) => line.length), 10) * data.fontSize * 0.62))) * data.scale,
    height: (data.height ?? Math.max(64, lines.length * data.fontSize * 1.45 + 28)) * data.scale
  }
}

export function infoBlockSize(data: InfoBlockNodeData, document?: EridionDocument): { width: number; height: number } {
  const hasInfo = data.showInfo && Boolean(data.infoText.trim())
  const fieldWidth = (label: string, value: string) => Math.max(label.length * 4.5, value.length * 5.2) + 18
  const pageCountText = document ? `${document.pages.length} / ${document.pages.length}` : '99 / 99'
  const longestPageName = document?.pages.reduce((longest, page) => page.name.length > longest.length ? page.name : longest, '') ?? ''
  const longestInfoLine = hasInfo
    ? data.infoText.split(/\r?\n/).reduce((longest, line) => line.length > longest.length ? line : longest, '')
    : ''
  const fullWidthCandidates = [
    data.heading.length * 7 + 18,
    ...(data.showDocumentName ? [fieldWidth('Dokument', document?.title ?? '')] : []),
    ...(data.showPageName ? [fieldWidth('Blatt', longestPageName)] : []),
    ...(hasInfo ? [fieldWidth('Info', longestInfoLine)] : []),
    ...(data.showDocumentId ? [fieldWidth('Dokument-ID', document?.documentId ?? '')] : [])
  ]
  const thirdWidthCandidates = [
    ...(data.showPageName ? [fieldWidth('Blatt', longestPageName) * 3] : []),
    ...(data.showPageNumber ? [fieldWidth('Seite', pageCountText) * 3] : []),
    ...(data.showSavedAt ? [fieldWidth('Stand', '00.00.00, 00:00') * 3] : []),
    ...(data.showAuthor ? [fieldWidth('Bearbeiter', data.author || '–') * 3] : [])
  ]
  const paperWidth = document ? pageDimensions(document.page).width : 520
  const fixedHorizontalOffset = (data.anchor ?? '').includes('left') || (data.anchor ?? '').includes('right')
    ? Math.max(0, data.anchorOffsetX)
    : 8
  const maximumPaperWidth = Math.max(80, paperWidth - fixedHorizontalOffset - 8)
  const maximumWidth = Math.min(520, maximumPaperWidth)
  const minimumWidth = Math.min(210, maximumWidth)
  const baseWidth = Math.min(maximumWidth, Math.max(minimumWidth, ...fullWidthCandidates, ...thirdWidthCandidates))
  const cellWidths: Array<1 | 3> = [
    ...(data.showDocumentName ? [3 as const] : []),
    ...(data.showPageName ? [1 as const] : []),
    ...(data.showPageNumber ? [1 as const] : []),
    ...(data.showSavedAt ? [1 as const] : []),
    ...(hasInfo ? [3 as const] : []),
    ...(data.showAuthor ? [1 as const] : []),
    ...(data.showDocumentId ? [3 as const] : [])
  ]
  let rows = 0
  let occupiedColumns = 0
  for (const width of cellWidths) {
    if (width === 3) {
      if (occupiedColumns) rows += 1
      rows += 1
      occupiedColumns = 0
    } else if (occupiedColumns === 2) {
      rows += 1
      occupiedColumns = 0
    } else {
      occupiedColumns += 1
    }
  }
  if (occupiedColumns) rows += 1
  const infoLines = hasInfo
    ? data.infoText.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(20, Math.floor((baseWidth - 20) / 5.2)))), 0)
    : 0
  const infoHeight = hasInfo ? Math.max(24, 15 + infoLines * 9) : 0
  return { width: baseWidth * data.scale, height: Math.max(76, 28 + rows * 24 + Math.max(0, infoHeight - 24)) * data.scale }
}

export function markInfoBlockLastRow<T extends { wide: boolean }>(fields: readonly T[]): Array<T & { lastRow: boolean }> {
  let row = 0
  let column = 0
  const positioned = fields.map((field) => {
    if (field.wide && column > 0) {
      row += 1
      column = 0
    }
    const fieldRow = row
    if (field.wide) {
      row += 1
      column = 0
    } else {
      column += 1
      if (column === 3) {
        row += 1
        column = 0
      }
    }
    return { field, row: fieldRow }
  })
  const lastRow = positioned.reduce((maximum, item) => Math.max(maximum, item.row), 0)
  return positioned.map((item) => ({ ...item.field, lastRow: item.row === lastRow }))
}

export function infoBlockAnchorLabel(anchor: InfoBlockAnchor): string {
  return ({
    'top-left': 'Oben links', top: 'Obere Kante', 'top-right': 'Oben rechts', right: 'Rechte Kante',
    'bottom-right': 'Unten rechts', bottom: 'Untere Kante', 'bottom-left': 'Unten links', left: 'Linke Kante'
  } satisfies Record<InfoBlockAnchor, string>)[anchor]
}

export function captureInfoBlockAnchor(document: EridionDocument, node: DiagramNode): void {
  if (node.data.kind !== 'infoBlock') return
  const dimensions = pageDimensions(document.page)
  const size = infoBlockSize(node.data, document)
  const x = Math.max(0, Math.min(dimensions.width - size.width, node.position.x))
  const y = Math.max(0, Math.min(dimensions.height - size.height, node.position.y))
  node.position = { x, y }
  const left = x
  const right = dimensions.width - x - size.width
  const top = y
  const bottom = dimensions.height - y - size.height
  const horizontalSide = left <= right ? 'left' : 'right'
  const verticalSide = top <= bottom ? 'top' : 'bottom'
  const horizontalDistance = Math.min(left, right)
  const verticalDistance = Math.min(top, bottom)
  const cornerThreshold = Math.max(32, Math.min(size.width, size.height) * 0.35)
  const isCorner = Math.abs(horizontalDistance - verticalDistance) <= cornerThreshold

  if (isCorner) {
    node.data.anchor = `${verticalSide}-${horizontalSide}` as InfoBlockAnchor
    node.data.anchorOffsetX = horizontalDistance
    node.data.anchorOffsetY = verticalDistance
  } else if (horizontalDistance < verticalDistance) {
    node.data.anchor = horizontalSide
    node.data.anchorOffsetX = horizontalDistance
    node.data.anchorOffsetY = (y + size.height / 2) / dimensions.height
  } else {
    node.data.anchor = verticalSide
    node.data.anchorOffsetX = (x + size.width / 2) / dimensions.width
    node.data.anchorOffsetY = verticalDistance
  }
}

export function positionInfoBlockFromAnchor(document: EridionDocument, node: DiagramNode): void {
  if (node.data.kind !== 'infoBlock') return
  if (!node.data.anchor) {
    captureInfoBlockAnchor(document, node)
    return
  }
  const dimensions = pageDimensions(document.page)
  const size = infoBlockSize(node.data, document)
  const horizontalCenter = node.data.anchorOffsetX * dimensions.width - size.width / 2
  const verticalCenter = node.data.anchorOffsetY * dimensions.height - size.height / 2
  let x = node.position.x
  let y = node.position.y
  if (node.data.anchor.includes('left')) x = node.data.anchorOffsetX
  else if (node.data.anchor.includes('right')) x = dimensions.width - size.width - node.data.anchorOffsetX
  else x = horizontalCenter
  if (node.data.anchor.includes('top')) y = node.data.anchorOffsetY
  else if (node.data.anchor.includes('bottom')) y = dimensions.height - size.height - node.data.anchorOffsetY
  else y = verticalCenter
  node.position = {
    x: Math.max(0, Math.min(dimensions.width - size.width, x)),
    y: Math.max(0, Math.min(dimensions.height - size.height, y))
  }
}

export function positionAllInfoBlocksFromAnchors(document: EridionDocument): void {
  document.nodes.forEach((node) => positionInfoBlockFromAnchor(document, node))
}

export function nodeSize(node: DiagramNode, pageTableScale = 1, document?: EridionDocument): { width: number; height: number } {
  if (node.data.kind === 'table') return tableSize({ ...node.data, scale: node.data.scale * pageTableScale })
  if (node.data.kind === 'text') return textSize(node.data)
  return infoBlockSize(node.data, document)
}

export function nearestNeighborSides(
  source: DiagramNode,
  target: DiagramNode,
  pageTableScale = 1,
  document?: EridionDocument
): { source: AnchorSide; target: AnchorSide } {
  const sourceSize = nodeSize(source, pageTableScale, document)
  const targetSize = nodeSize(target, pageTableScale, document)
  const sourceCenter = { x: source.position.x + sourceSize.width / 2, y: source.position.y + sourceSize.height / 2 }
  const targetCenter = { x: target.position.x + targetSize.width / 2, y: target.position.y + targetSize.height / 2 }
  const deltaX = targetCenter.x - sourceCenter.x
  const deltaY = targetCenter.y - sourceCenter.y
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' }
  }
  return deltaY >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' }
}

export interface ObjectAlignmentGuide {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
}

export function alignNodeToNearbyObjects(
  document: EridionDocument,
  node: DiagramNode,
  position: { x: number; y: number },
  nearbyNodes: readonly DiagramNode[],
  pageTableScale: number,
  threshold = 8
): { position: { x: number; y: number }; guides: ObjectAlignmentGuide[] } {
  const size = nodeSize(node, pageTableScale, document)
  type Candidate = { delta: number; line: number; target: DiagramNode; targetSize: { width: number; height: number } }
  let bestX: Candidate | undefined
  let bestY: Candidate | undefined
  const ownX = [0, size.width / 2, size.width]
  const ownY = [0, size.height / 2, size.height]
  for (const target of nearbyNodes) {
    if (target.id === node.id) continue
    const targetSize = nodeSize(target, pageTableScale, document)
    const targetX = [target.position.x, target.position.x + targetSize.width / 2, target.position.x + targetSize.width]
    const targetY = [target.position.y, target.position.y + targetSize.height / 2, target.position.y + targetSize.height]
    for (const line of targetX) for (const offset of ownX) {
      const delta = line - (position.x + offset)
      if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, line, target, targetSize }
    }
    for (const line of targetY) for (const offset of ownY) {
      const delta = line - (position.y + offset)
      if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, line, target, targetSize }
    }
  }
  const alignedPosition = { x: position.x + (bestX?.delta ?? 0), y: position.y + (bestY?.delta ?? 0) }
  const guides: ObjectAlignmentGuide[] = []
  if (bestX) guides.push({
    axis: 'x', position: bestX.line,
    start: Math.min(alignedPosition.y, bestX.target.position.y) - 12,
    end: Math.max(alignedPosition.y + size.height, bestX.target.position.y + bestX.targetSize.height) + 12
  })
  if (bestY) guides.push({
    axis: 'y', position: bestY.line,
    start: Math.min(alignedPosition.x, bestY.target.position.x) - 12,
    end: Math.max(alignedPosition.x + size.width, bestY.target.position.x + bestY.targetSize.width) + 12
  })
  return { position: alignedPosition, guides }
}

export function snapTablePositionToPageGrid(
  document: EridionDocument,
  node: DiagramNode,
  position: { x: number; y: number },
  pageTableScale: number,
  desiredSpacing = 20
): { x: number; y: number } {
  const page = pageDimensions(document.page)
  const size = nodeSize(node, pageTableScale, document)
  const horizontalStep = page.width / Math.max(1, Math.round(page.width / desiredSpacing))
  const verticalStep = page.height / Math.max(1, Math.round(page.height / desiredSpacing))
  const snapAxis = (start: number, objectSize: number, pageSize: number, step: number) => {
    const startGap = start
    const endGap = pageSize - start - objectSize
    const snapped = startGap <= endGap
      ? Math.round(startGap / step) * step
      : pageSize - objectSize - Math.round(endGap / step) * step
    return snapped
  }
  return {
    x: snapAxis(position.x, size.width, page.width, horizontalStep),
    y: snapAxis(position.y, size.height, page.height, verticalStep)
  }
}

export function pageRangeIncludes(range: string, pageNumber: number, pageCount: number): boolean {
  return range.split(',').some((rawPart) => {
    const part = rawPart.trim()
    if (!part) return false
    const single = part.match(/^(\d+)$/)
    if (single) return pageNumber === Number(single[1])
    const interval = part.match(/^(\d*)-(\d*)$/)
    if (!interval || (!interval[1] && !interval[2])) return false
    const start = interval[1] ? Number(interval[1]) : 1
    const end = interval[2] ? Number(interval[2]) : pageCount
    return pageNumber >= Math.min(start, end) && pageNumber <= Math.max(start, end)
  })
}

export function nodesForPage(document: EridionDocument, pageId: string): DiagramNode[] {
  const pageNumber = document.pages.findIndex((page) => page.id === pageId) + 1
  if (pageNumber <= 0) return []
  return document.nodes.flatMap((node) => {
    if (node.data.kind !== 'infoBlock') return node.pageId === pageId ? [node] : []
    const visible = node.data.repeatMode === 'all'
      || (node.data.repeatMode === 'current' && node.pageId === pageId)
      || (node.data.repeatMode === 'range' && pageRangeIncludes(node.data.pageRange, pageNumber, document.pages.length))
    if (!visible) return []
    return [{
      ...node,
      id: node.pageId === pageId ? node.id : `${node.id}${VIRTUAL_PAGE_MARKER}${pageId}`,
      pageId,
      position: { ...node.position },
      data: { ...node.data }
    }]
  })
}

export function serializeDocument(document: EridionDocument): string {
  return JSON.stringify(document)
}

export function parseDocument(value: unknown): EridionDocument {
  const document = value as Partial<EridionDocument>
  if (document.formatVersion !== 1 || !document.documentId || !Array.isArray(document.nodes)) {
    throw new Error('Die PDF enthält kein unterstütztes Eridion-Dokument.')
  }
  const migrated = document as EridionDocument
  const legacyMargin = migrated.page.marginMm ?? 8
  migrated.page.marginTopMm ??= legacyMargin
  migrated.page.marginRightMm ??= legacyMargin
  migrated.page.marginBottomMm ??= legacyMargin
  migrated.page.marginLeftMm ??= legacyMargin
  if (!Array.isArray(migrated.pages) || !migrated.pages.length) {
    const firstPage = createPage(1)
    migrated.pages = [firstPage]
    migrated.nodes = migrated.nodes.map((node) => ({ ...node, pageId: firstPage.id }))
  } else {
    const firstPageId = migrated.pages[0].id
    migrated.nodes = migrated.nodes.map((node) => ({ ...node, pageId: node.pageId || firstPageId }))
  }
  migrated.styles.baseScale ??= 1
  migrated.pages = migrated.pages.map((page) => ({ ...page, tableScale: page.tableScale ?? 1 }))
  migrated.nodes.forEach((node) => {
    if (node.data.kind === 'infoBlock' && !node.data.anchor) captureInfoBlockAnchor(migrated, node)
    if (node.data.kind === 'table') node.data.columns = sortTableColumns(node.data.columns)
    if (node.data.kind === 'text') {
      node.data.markdown ??= true
      node.data.backgroundColor ??= '#ffffff'
      node.data.textAlign ??= 'left'
    }
  })
  migrated.relationships = migrated.relationships.map((edge) => ({
    ...edge,
    sourceHandle: `source-${edge.id}`,
    targetHandle: `target-${edge.id}`,
    data: {
      ...edge.data,
      optional: edge.data.optional ?? (edge.data.imported && [edge.source, edge.target]
        .map((nodeId) => migrated.nodes.find((node) => node.id === nodeId))
        .flatMap((node) => node?.data.kind === 'table' ? node.data.columns : [])
        .some((column) => column.foreignKey && column.nullable && column.name.toLocaleLowerCase() === (edge.data.label ?? '').toLocaleLowerCase())),
      sourceAnchor: edge.data.sourceAnchor ?? { side: 'right', position: 0 },
      targetAnchor: edge.data.targetAnchor ?? { side: 'left', position: 0 },
      routeType: edge.data.routeType ?? 'smoothstep',
      routeOffsetX: edge.data.routeOffsetX ?? 0,
      routeOffsetY: edge.data.routeOffsetY ?? 0
    }
  }))
  return migrated
}

function columnAnchor(table: SchemaTable, columnName: string, side: AnchorSide): RelationshipAnchor {
  if (side === 'top' || side === 'bottom') return { side, position: 0 }
  const columns = sortTableColumns(table.columns)
  const index = columns.findIndex((column) => column.name === columnName)
  if (index < 0) return { side, position: 0 }
  const height = TABLE_HEADER_HEIGHT + Math.max(1, columns.length) * TABLE_COLUMN_HEIGHT
  const center = TABLE_HEADER_HEIGHT + (index + 0.5) * TABLE_COLUMN_HEIGHT
  return {
    side,
    position: clampAnchorPosition(center / height * 2 - 1),
    columnId: `${table.schema ?? ''}.${table.name}.${columns[index].name}`
  }
}

function schemaTable(snapshot: SchemaSnapshot, schema: string | undefined, name: string): SchemaTable | undefined {
  const key = `${schema ?? ''}.${name}`.toLocaleLowerCase()
  return snapshot.tables.find((table) => `${table.schema ?? ''}.${table.name}`.toLocaleLowerCase() === key)
}

function schemaColumn(table: SchemaTable | undefined, name: string) {
  return table?.columns.find((column) => column.name.toLocaleLowerCase() === name.toLocaleLowerCase())
}

function orientRelationship(snapshot: SchemaSnapshot, relationship: SchemaRelationship): SchemaRelationship {
  const sourceColumn = schemaColumn(schemaTable(snapshot, relationship.sourceSchema, relationship.sourceTable), relationship.sourceColumn)
  const targetColumn = schemaColumn(schemaTable(snapshot, relationship.targetSchema, relationship.targetTable), relationship.targetColumn)
  if (!sourceColumn?.primaryKey || targetColumn?.primaryKey) return relationship
  return {
    name: relationship.name,
    sourceSchema: relationship.targetSchema,
    sourceTable: relationship.targetTable,
    sourceColumn: relationship.targetColumn,
    targetSchema: relationship.sourceSchema,
    targetTable: relationship.sourceTable,
    targetColumn: relationship.sourceColumn
  }
}

function relationshipKey(relationship: SchemaRelationship): string {
  const endpoints = [
    `${relationship.sourceSchema ?? ''}.${relationship.sourceTable}.${relationship.sourceColumn}`,
    `${relationship.targetSchema ?? ''}.${relationship.targetTable}.${relationship.targetColumn}`
  ].map((value) => value.toLocaleLowerCase()).sort()
  return endpoints.join('<->')
}

function shortRelationshipLabel(snapshot: SchemaSnapshot, relationship: SchemaRelationship): string {
  const sourceColumn = schemaColumn(schemaTable(snapshot, relationship.sourceSchema, relationship.sourceTable), relationship.sourceColumn)
  const targetColumn = schemaColumn(schemaTable(snapshot, relationship.targetSchema, relationship.targetTable), relationship.targetColumn)
  if (targetColumn?.primaryKey) return relationship.sourceColumn
  if (sourceColumn?.primaryKey) return relationship.targetColumn
  if (relationship.sourceColumn.toLocaleLowerCase() === relationship.targetColumn.toLocaleLowerCase()) return relationship.sourceColumn
  return `${relationship.sourceColumn} → ${relationship.targetColumn}`
}

export function importSnapshot(document: EridionDocument, snapshot: SchemaSnapshot, pageId = document.pages[0].id): EridionDocument {
  const existing = new Map<string, DiagramNode>(
    document.nodes.flatMap((node) => node.pageId === pageId && node.data.kind === 'table'
      ? [[`${node.data.schema ?? ''}.${node.data.name}`, node] as const]
      : [])
  )
  const start = document.nodes.filter((node) => node.pageId === pageId).length
  const tableNodes: DiagramNode[] = snapshot.tables.map((table, index) => {
    const key = `${table.schema ?? ''}.${table.name}`
    const previous = existing.get(key)
    return {
      id: previous?.id ?? crypto.randomUUID(),
      type: 'table',
      pageId,
      position: previous?.position ?? {
        x: 50 + ((start + index) % 3) * 360,
        y: 50 + Math.floor((start + index) / 3) * 330
      },
      data: {
        kind: 'table',
        schema: table.schema,
        name: table.name,
        alias: previous?.data.kind === 'table' ? previous.data.alias : undefined,
        objectType: table.type.toUpperCase().includes('VIEW') ? 'VIEW' : 'TABLE',
        columns: sortTableColumns(table.columns.map((column) => ({ id: `${key}.${column.name}`, ...column }))),
        scale: previous?.data.scale ?? 1,
        color: previous?.data.kind === 'table' ? previous.data.color : undefined,
        headerColor: previous?.data.kind === 'table' ? previous.data.headerColor : undefined,
        showTypes: previous?.data.kind === 'table' ? previous.data.showTypes : undefined,
        showIcons: previous?.data.kind === 'table' ? previous.data.showIcons : undefined
      }
    }
  })
  const byKey = new Map(tableNodes.map((node) => [`${node.data.kind === 'table' ? node.data.schema ?? '' : ''}.${node.data.kind === 'table' ? node.data.name : ''}`, node]))
  const seenRelationships = new Set<string>()
  const importedEdges: DiagramEdge[] = snapshot.relationships.flatMap((rawRelationship) => {
    const relationship = orientRelationship(snapshot, rawRelationship)
    const key = relationshipKey(relationship)
    if (seenRelationships.has(key)) return []
    seenRelationships.add(key)
    const source = byKey.get(`${relationship.sourceSchema ?? ''}.${relationship.sourceTable}`)
    const target = byKey.get(`${relationship.targetSchema ?? ''}.${relationship.targetTable}`)
    if (!source || !target) return []
    const id = `fk:${source.id}:${relationship.sourceColumn}:${target.id}:${relationship.targetColumn}`
    const sourceTable = snapshot.tables.find((table) => `${table.schema ?? ''}.${table.name}` === `${relationship.sourceSchema ?? ''}.${relationship.sourceTable}`)!
    const targetTable = snapshot.tables.find((table) => `${table.schema ?? ''}.${table.name}` === `${relationship.targetSchema ?? ''}.${relationship.targetTable}`)!
    const optional = Boolean(schemaColumn(sourceTable, relationship.sourceColumn)?.nullable)
    const sides = nearestNeighborSides(source, target)
    return [{
      id,
      type: 'crowFoot',
      source: source.id,
      target: target.id,
      sourceHandle: `source-${id}`,
      targetHandle: `target-${id}`,
      data: {
        sourceCardinality: '0..n',
        targetCardinality: optional ? '0..1' : '1',
        optional,
        imported: true,
        label: shortRelationshipLabel(snapshot, relationship),
        relationshipKey: key,
        sourceAnchor: columnAnchor(sourceTable, relationship.sourceColumn, sides.source),
        targetAnchor: columnAnchor(targetTable, relationship.targetColumn, sides.target),
        routeType: 'smoothstep'
      }
    }]
  })
  const replacedTableIds = new Set([...existing.values()].map((node) => node.id))
  const preservedNodes = document.nodes.filter((node) => node.pageId !== pageId || node.data.kind !== 'table')
  const preservedEdges = document.relationships.filter((edge) => {
    const belongsToPage = replacedTableIds.has(edge.source) || replacedTableIds.has(edge.target)
    return !belongsToPage || !edge.data?.imported
  })
  return { ...document, schemaSnapshot: snapshot, nodes: [...preservedNodes, ...tableNodes], relationships: [...preservedEdges, ...importedEdges] }
}

export function addSchemaTableToPage(
  document: EridionDocument,
  snapshot: SchemaSnapshot,
  table: SchemaTable,
  pageId: string,
  position: { x: number; y: number }
): { added: boolean; node?: DiagramNode } {
  const tableKey = `${table.schema ?? ''}.${table.name}`
  const pageTables = document.nodes.filter((node) => node.pageId === pageId && node.data.kind === 'table')
  const existing = pageTables.find((node) => node.data.kind === 'table' && `${node.data.schema ?? ''}.${node.data.name}` === tableKey)
  if (existing) return { added: false, node: existing }

  const node: DiagramNode = {
    id: crypto.randomUUID(),
    type: 'table',
    pageId,
    position,
    data: {
      kind: 'table',
      schema: table.schema,
      name: table.name,
      objectType: table.type.toUpperCase().includes('VIEW') ? 'VIEW' : 'TABLE',
      columns: sortTableColumns(table.columns.map((column) => ({ id: `${tableKey}.${column.name}`, ...column }))),
      scale: 1
    }
  }
  document.nodes = [...document.nodes, node]
  document.schemaSnapshot = snapshot

  const allPageTables = [...pageTables, node]
  const byKey = new Map<string, DiagramNode>(allPageTables.flatMap((candidate) => candidate.data.kind === 'table'
    ? [[`${candidate.data.schema ?? ''}.${candidate.data.name}`, candidate] as const]
    : []))
  for (const rawRelationship of snapshot.relationships) {
    const relationship = orientRelationship(snapshot, rawRelationship)
    const sourceTableKey = `${relationship.sourceSchema ?? ''}.${relationship.sourceTable}`
    const targetTableKey = `${relationship.targetSchema ?? ''}.${relationship.targetTable}`
    if (sourceTableKey !== tableKey && targetTableKey !== tableKey) continue
    const key = relationshipKey(relationship)
    const source = byKey.get(sourceTableKey)
    const target = byKey.get(targetTableKey)
    if (!source || !target) continue
    const id = `fk:${source.id}:${relationship.sourceColumn}:${target.id}:${relationship.targetColumn}`
    if (document.relationships.some((edge) => edge.id === id || edge.data.relationshipKey === key)) continue
    const sourceTable = snapshot.tables.find((table) => `${table.schema ?? ''}.${table.name}` === `${relationship.sourceSchema ?? ''}.${relationship.sourceTable}`)!
    const targetTable = snapshot.tables.find((table) => `${table.schema ?? ''}.${table.name}` === `${relationship.targetSchema ?? ''}.${relationship.targetTable}`)!
    const optional = Boolean(schemaColumn(sourceTable, relationship.sourceColumn)?.nullable)
    const sides = nearestNeighborSides(source, target)
    document.relationships = [...document.relationships, {
      id,
      type: 'crowFoot',
      source: source.id,
      target: target.id,
      sourceHandle: `source-${id}`,
      targetHandle: `target-${id}`,
      data: {
        sourceCardinality: '0..n',
        targetCardinality: optional ? '0..1' : '1',
        optional,
        imported: true,
        label: shortRelationshipLabel(snapshot, relationship),
        relationshipKey: key,
        sourceAnchor: columnAnchor(sourceTable, relationship.sourceColumn, sides.source),
        targetAnchor: columnAnchor(targetTable, relationship.targetColumn, sides.target),
        routeType: 'smoothstep'
      }
    }]
  }
  return { added: true, node }
}
