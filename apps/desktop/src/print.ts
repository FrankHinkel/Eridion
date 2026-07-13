import { Position } from '@vue-flow/core'
import { TABLE_BASE_RENDER_SCALE, markInfoBlockLastRow, nodeSize, nodesForPage, pageDimensions, pageMargins, shortTypeName, sortTableColumns, type AnchorSide, type DiagramEdge, type DiagramNode, type DiagramPage, type EridionDocument, type InfoBlockNodeData, type RelationshipAnchor, type TableNodeData, type TextNodeData } from './model'
import {
  cardinalityGeometry, RELATIONSHIP_DASH_PATTERN,
  RELATIONSHIP_STROKE_WIDTH
} from './relationship-geometry'
import { relationshipPath } from './relationship-path'
import { TABLE_COLUMN_GAP, TABLE_COLUMN_SIDE_PADDING, TABLE_TYPE_MIN_CHARACTERS } from './render-metrics'
import type { PdfTooltip } from '../electron/types'
import { escapeHtml as escapeMarkdownHtml, renderMarkdown } from './markdown'
import { resolveTextPlaceholders } from './text-placeholders'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!)

const keyRoundIcon = '<svg class="column-icon pk" data-lucide="key-round" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Primärschlüssel"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>'
const link2Icon = '<svg class="column-icon fk" data-lucide="link-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Fremdschlüssel"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>'

function tableHtml(data: TableNodeData, document: EridionDocument, pageTableScale: number): string {
  const color = data.color ?? document.styles.tableColor
  const header = data.headerColor ?? document.styles.tableHeaderColor
  const showTypes = data.showTypes ?? document.styles.showTypes
  const showIcons = data.showIcons ?? document.styles.showIcons
  const scale = Number((data.scale * pageTableScale).toFixed(6))
  return `<article class="table" style="--scale:${scale};--table-color:${color};--header-color:${header};--text-color:${document.styles.tableTextColor}">
    ${data.alias ? `<div class="alias">${escapeHtml(data.alias)}</div>` : ''}
    <header><small>${escapeHtml(data.schema ? `${data.schema} · ${data.objectType}` : data.objectType)}</small><strong>${escapeHtml(data.name)}</strong></header>
    <div class="columns">${sortTableColumns(data.columns).map((column) => `<div class="column">
      <span class="flags">${showIcons && column.primaryKey ? keyRoundIcon : ''}${showIcons && column.foreignKey ? link2Icon : ''}</span>
      <span class="column-name ${column.nullable ? '' : 'not-null'}">${escapeHtml(column.name)}</span>
      ${showTypes ? `<code title="${escapeHtml(column.typeName)}">${escapeHtml(shortTypeName(column.typeName))}</code>` : ''}
    </div>`).join('')}</div>
  </article>`
}

function textHtml(data: TextNodeData, document: EridionDocument, page: DiagramPage, pageIndex: number, savedAt: string): string {
  const text = resolveTextPlaceholders(data.text, { document, page, pageIndex, date: savedAt })
  const content = data.markdown === false ? escapeMarkdownHtml(text).replace(/\n/g, '<br>') : renderMarkdown(text)
  return `<div class="note" style="--scale:${data.scale};--font-size:${data.fontSize}px;color:${data.color ?? '#334155'};background:${data.backgroundColor ?? '#ffffff'};text-align:${data.textAlign ?? 'left'}"><div class="markdown-content">${content}</div></div>`
}

function infoBlockHtml(data: InfoBlockNodeData, document: EridionDocument, page: DiagramPage, pageIndex: number, savedAt: string): string {
  const savedDate = new Date(savedAt)
  const formattedSavedAt = Number.isNaN(savedDate.getTime())
    ? '–'
    : new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(savedDate)
  const cells = markInfoBlockLastRow([
    data.showDocumentName ? { label: 'Dokument', value: document.title, wide: true, end: true, multiline: false } : undefined,
    data.showPageName ? { label: 'Blatt', value: page.name, wide: false, end: false, multiline: false } : undefined,
    data.showPageNumber ? { label: 'Seite', value: `${pageIndex + 1} / ${document.pages.length}`, wide: false, end: false, multiline: false } : undefined,
    data.showSavedAt ? { label: 'Stand', value: formattedSavedAt, wide: false, end: true, multiline: false } : undefined,
    data.showInfo && data.infoText.trim() ? { label: 'Info', value: data.infoText, wide: true, end: true, multiline: true } : undefined,
    data.showAuthor ? { label: 'Bearbeiter', value: data.author || '–', wide: false, end: true, multiline: false } : undefined,
    data.showDocumentId ? { label: 'Dokument-ID', value: document.documentId, wide: true, end: true, multiline: false } : undefined
  ].filter((cell): cell is { label: string; value: string; wide: boolean; end: boolean; multiline: boolean } => Boolean(cell)))
  return `<article class="info-block-print" style="--scale:${data.scale}">
    <header><strong>${escapeHtml(data.heading || 'ERIDION · ERD')}</strong></header>
    <div class="info-grid">${cells.map((cell) => `<div class="info-cell${cell.wide ? ' wide' : ''}${cell.end ? ' end' : ''}${cell.multiline ? ' multiline' : ''}${cell.lastRow ? ' last-row' : ''}"><small>${escapeHtml(cell.label)}</small><b>${escapeHtml(cell.value)}</b></div>`).join('')}</div>
  </article>`
}

const anchorPositions: Record<AnchorSide, Position> = {
  top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left
}

function anchorPoint(node: DiagramNode, anchor: RelationshipAnchor | undefined, fallback: AnchorSide, pageTableScale: number) {
  const size = nodeSize(node, pageTableScale)
  const side = anchor?.side ?? fallback
  const position = Math.max(-1, Math.min(1, anchor?.position ?? 0))
  const centerX = node.position.x + size.width / 2
  const centerY = node.position.y + size.height / 2
  if (side === 'top') return { x: centerX + position * size.width / 2, y: node.position.y, side }
  if (side === 'bottom') return { x: centerX + position * size.width / 2, y: node.position.y + size.height, side }
  if (side === 'left') return { x: node.position.x, y: centerY + position * size.height / 2, side }
  return { x: node.position.x + size.width, y: centerY + position * size.height / 2, side }
}

function sideAngle(side: AnchorSide): number {
  if (side === 'bottom') return 90
  if (side === 'left') return 180
  if (side === 'top') return -90
  return 0
}

function cardinalitySvg(point: { x: number; y: number; side: AnchorSide }, cardinality: DiagramEdge['data']['sourceCardinality'], color: string): string {
  const geometry = cardinalityGeometry(cardinality)
  const minimumEnd = geometry.optional
    ? `<circle cx="${geometry.minimumOffset}" cy="0" r="${geometry.circleRadius}" fill="white"/>`
    : `<path d="${geometry.minimumPath}"/>`
  return `<g class="cardinality" data-cardinality="${cardinality}" transform="translate(${point.x} ${point.y}) rotate(${sideAngle(point.side)})" fill="none" stroke="${color}" stroke-width="${RELATIONSHIP_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"><path d="${geometry.maximumPath}"/>${minimumEnd}</g>`
}

function edgeSvg(edge: DiagramEdge, nodes: Map<string, DiagramNode>, pageTableScale: number): string {
  const source = nodes.get(edge.source)
  const target = nodes.get(edge.target)
  if (!source || !target) return ''
  const sourceAnchor = anchorPoint(source, edge.data.sourceAnchor, 'right', pageTableScale)
  const targetAnchor = anchorPoint(target, edge.data.targetAnchor, 'left', pageTableScale)
  const color = edge.data?.color ?? '#475569'
  const [path, anchorX, anchorY] = relationshipPath({
    sourceX: sourceAnchor.x, sourceY: sourceAnchor.y, sourcePosition: anchorPositions[sourceAnchor.side],
    targetX: targetAnchor.x, targetY: targetAnchor.y, targetPosition: anchorPositions[targetAnchor.side],
    data: edge.data
  })
  const label = `${edge.data.xorGroup ? '(+) ' : ''}${edge.data.label ?? ''}`.trim()
  const labelSvg = label
    ? `<text class="edge-text" x="${anchorX + (edge.data.labelOffsetX ?? 0)}" y="${anchorY + (edge.data.labelOffsetY ?? 0)}">${escapeHtml(label)}</text>`
    : ''
  const dash = edge.data.optional ? ` stroke-dasharray="${RELATIONSHIP_DASH_PATTERN}"` : ''
  return `<path class="relationship-line" d="${path}" fill="none" stroke="${color}" stroke-width="${RELATIONSHIP_STROKE_WIDTH}"${dash} stroke-linecap="round" stroke-linejoin="round" />${cardinalitySvg(sourceAnchor, edge.data.sourceCardinality, color)}${cardinalitySvg(targetAnchor, edge.data.targetCardinality, color)}${labelSvg}`
}

export function buildPrintHtml(document: EridionDocument, savedAt = document.modifiedAt): string {
  const dimensions = pageDimensions(document.page)
  const margins = pageMargins(document.page)
  const pages = document.pages.map((page, pageIndex) => {
    const pageNodes = nodesForPage(document, page.id)
    const nodeIds = new Set(pageNodes.map((node) => node.id))
    const pageEdges = document.relationships.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    const nodeMap = new Map(pageNodes.map((node) => [node.id, node]))
    const tableScale = TABLE_BASE_RENDER_SCALE * document.styles.baseScale * (page.tableScale ?? 1)
    const objects = pageNodes.map((node) => {
      const size = nodeSize(node, tableScale, document)
      const content = node.data.kind === 'table'
        ? tableHtml(node.data, document, tableScale)
        : node.data.kind === 'text'
          ? textHtml(node.data, document, page, pageIndex, savedAt)
          : infoBlockHtml(node.data, document, page, pageIndex, savedAt)
      return `<div class="object" style="left:${node.position.x}px;top:${node.position.y}px;width:${size.width}px;min-height:${size.height}px">${content}</div>`
    }).join('')
    const edges = pageEdges.map((edge) => edgeSvg(edge, nodeMap, tableScale)).join('')
    return `<section class="page"><div class="page-content" style="width:${dimensions.width}px;height:${dimensions.height}px"><svg class="edges" viewBox="0 0 ${dimensions.width} ${dimensions.height}">${edges}</svg>${objects}</div>${document.page.showPageNumbers ? `<footer>${escapeHtml(page.name)} · ${pageIndex + 1} / ${document.pages.length}</footer>` : ''}</section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    @page{size:${dimensions.widthMm}mm ${dimensions.heightMm}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:${dimensions.widthMm}mm;height:${dimensions.heightMm}mm;position:relative;overflow:hidden;break-after:page;background:white}.page:last-child{break-after:auto}.page-content{position:absolute;left:0;top:0;transform-origin:0 0}.edges{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.edge-text{font-size:9px;fill:#475569;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:white;stroke-width:5px;stroke-linejoin:round}.object{position:absolute}.table{width:100%;min-height:100%;overflow:hidden;background:var(--table-color);border:1px solid #64748b;border-radius:4px;color:var(--text-color);font-size:calc(10px * var(--scale));line-height:1}.alias{min-height:calc(22px * var(--scale));display:flex;align-items:center;padding:0 calc(4px * var(--scale));background:white;font-size:calc(13px * var(--scale));font-weight:800;line-height:1}.table header{min-height:calc(32px * var(--scale));display:flex;flex-direction:column;justify-content:center;gap:calc(1px * var(--scale));padding:calc(3px * var(--scale)) calc(4px * var(--scale));background:var(--header-color);border-bottom:1px solid #94a3b8}.table header small{font-size:calc(7px * var(--scale));line-height:1;text-transform:uppercase;color:#64748b;letter-spacing:.04em}.table header strong{font-size:calc(11px * var(--scale));line-height:1.05}.columns{width:100%;display:grid;grid-template-columns:max-content minmax(0,1fr) max-content;overflow:hidden}.column{height:calc(18px * var(--scale));display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;gap:calc(${TABLE_COLUMN_GAP}px * var(--scale));padding:0 calc(${TABLE_COLUMN_SIDE_PADDING}px * var(--scale))}.flags{display:flex;align-items:center;gap:calc(1px * var(--scale));min-height:calc(10px * var(--scale));color:#64748b}.column-icon{display:block;width:calc(10px * var(--scale));height:calc(10px * var(--scale))}.column-icon.pk{color:#d97706}.column-icon.fk{color:#2563eb}.column-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.column-name.not-null{font-weight:750}.column code{min-width:${TABLE_TYPE_MIN_CHARACTERS}ch;font-size:calc(7.5px * var(--scale));line-height:1;color:#64748b;text-align:right;white-space:nowrap}.note{width:100%;height:100%;padding:8px;overflow:hidden;border:0;border-radius:0;font-size:calc(var(--font-size) * var(--scale));white-space:normal}.markdown-content{width:100%;height:100%;overflow:hidden;line-height:1.25;overflow-wrap:anywhere}.markdown-content p,.markdown-content h1,.markdown-content h2,.markdown-content h3,.markdown-content h4,.markdown-content h5,.markdown-content h6,.markdown-content blockquote,.markdown-content pre,.markdown-content ul,.markdown-content ol{margin:0 0 .35em}.markdown-content h1{font-size:1.7em}.markdown-content h2{font-size:1.45em}.markdown-content h3{font-size:1.25em}.markdown-content ul,.markdown-content ol{padding-left:1.35em}.markdown-content blockquote{padding-left:.65em;border-left:3px solid currentColor;opacity:.8}.markdown-content code{padding:.08em .24em;border-radius:3px;background:#64748b1f;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em}.markdown-content pre{padding:.45em;overflow:hidden;background:#64748b14;white-space:pre-wrap}.markdown-content pre code{padding:0;background:transparent}.markdown-content a{color:#2563eb;text-decoration:underline}.info-block-print{width:100%;min-height:100%;overflow:hidden;color:#111827;background:white;border:calc(1.5px * var(--scale)) solid #334155;font-size:calc(8px * var(--scale));line-height:1.05}.info-block-print>header{height:calc(28px * var(--scale));display:flex;align-items:center;gap:calc(8px * var(--scale));padding:0 calc(6px * var(--scale));background:#f8fafc;border-bottom:calc(2px * var(--scale)) solid #334155}.info-block-print>header strong{font-size:calc(12px * var(--scale));letter-spacing:.04em}.info-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.info-cell{min-width:0;min-height:calc(24px * var(--scale));display:flex;flex-direction:column;justify-content:center;gap:calc(2px * var(--scale));padding:calc(3px * var(--scale)) calc(5px * var(--scale));border-right:calc(1px * var(--scale)) solid #64748b;border-bottom:calc(1px * var(--scale)) solid #64748b}.info-cell.end,.info-cell.wide{border-right:0}.info-cell.last-row{border-bottom:0}.info-cell.wide{grid-column:1/-1}.info-cell small{color:#64748b;font-size:calc(6px * var(--scale));text-transform:uppercase;letter-spacing:.06em}.info-cell b{overflow:hidden;font-size:calc(8px * var(--scale));font-weight:650;text-overflow:ellipsis;white-space:nowrap}.info-cell.multiline b{overflow:visible;line-height:1.2;overflow-wrap:anywhere;text-overflow:clip;white-space:pre-wrap}footer{position:absolute;right:${margins.right}mm;bottom:3mm;color:#94a3b8;font-size:9px}
    </style></head><body>${pages}</body></html>`
}

export function buildPdfTooltips(document: EridionDocument): PdfTooltip[] {
  return document.pages.flatMap((page, pageIndex) => {
    const pageTableScale = TABLE_BASE_RENDER_SCALE * document.styles.baseScale * (page.tableScale ?? 1)
    return nodesForPage(document, page.id).flatMap((node) => {
      if (node.data.kind !== 'table' || !(node.data.showTypes ?? document.styles.showTypes)) return []
      const scale = node.data.scale * pageTableScale
      const size = nodeSize(node, pageTableScale, document)
      const headerHeight = (32 + (node.data.alias ? 22 : 0)) * scale
      const rowHeight = 18 * scale
      const tooltipWidth = Math.min(size.width, Math.max(42 * scale, 28))
      return sortTableColumns(node.data.columns).map((column, rowIndex) => ({
        pageIndex,
        x: node.position.x + size.width - tooltipWidth,
        y: node.position.y + headerHeight + rowIndex * rowHeight,
        width: tooltipWidth,
        height: rowHeight,
        text: `${column.name}: ${column.typeName}${column.remarks?.trim() ? `\n${column.remarks.trim()}` : ''}`
      }))
    })
  })
}
