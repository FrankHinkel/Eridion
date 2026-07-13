import { describe, expect, it } from 'vitest'
import { buildPdfTooltips, buildPrintHtml } from './print'
import { cardinalityGeometry, RELATIONSHIP_STROKE_WIDTH } from './relationship-geometry'
import { relationshipPath, snapRouteCoordinate } from './relationship-path'
import {
  addSchemaTableToPage, alignedRelationshipAnchor, alignNodeToNearbyObjects, captureInfoBlockAnchor, createPage, deletePage, duplicatePage, importSnapshot, infoBlockSize, newDocument,
  nearestNeighborSides, nearestRelationshipAnchor, nodeSize, nodesForPage, pageDimensions, pageMargins, pageRangeIncludes, pageViewportScale, parseDocument, parseSnapAnchor, positionInfoBlockFromAnchor, serializeDocument, shortTypeName,
  movePageToTarget, reorderPages, snapTablePositionToPageGrid, sortTableColumns, TABLE_BASE_RENDER_SCALE, tableSize,
  storedNodeId, type DiagramNode, type SchemaSnapshot
} from './model'

function tableNode(pageId: string, x = 20, y = 20): DiagramNode {
  return {
    id: 'table-1',
    type: 'table',
    pageId,
    position: { x, y },
    data: {
      kind: 'table',
      name: 'CUSTOMERS',
      alias: 'Kunden',
      objectType: 'TABLE',
      scale: 0.95,
      columns: [
        { id: 'id', name: 'ID', typeName: 'BIGINT', nullable: false, primaryKey: true, foreignKey: false }
      ]
    }
  }
}

describe('Eridion document model', () => {
  it('reorders pages before and after a tab without changing their identity', () => {
    const pages = [createPage(1), createPage(2), createPage(3)]
    expect(reorderPages(pages, pages[2].id, pages[0].id, false).map((page) => page.id)).toEqual([pages[2].id, pages[0].id, pages[1].id])
    expect(reorderPages(pages, pages[0].id, pages[1].id, true).map((page) => page.id)).toEqual([pages[1].id, pages[0].id, pages[2].id])
  })

  it('moves an adjacent page unambiguously onto the target tab position', () => {
    const pages = [createPage(1), createPage(2), createPage(3)]
    expect(movePageToTarget(pages, pages[0].id, pages[1].id).map((page) => page.id)).toEqual([pages[1].id, pages[0].id, pages[2].id])
    expect(movePageToTarget(pages, pages[2].id, pages[1].id).map((page) => page.id)).toEqual([pages[0].id, pages[2].id, pages[1].id])
  })

  it('duplicates a page with its local objects and internal relationships', () => {
    const document = newDocument()
    const secondNode = tableNode(document.pages[0].id, 300, 20)
    secondNode.id = 'table-2'
    document.nodes = [tableNode(document.pages[0].id), secondNode, {
      id: 'global-info', type: 'infoBlock', pageId: document.pages[0].id, position: { x: 10, y: 300 },
      data: {
        kind: 'infoBlock', scale: 1, heading: 'Info', infoText: '', author: '', repeatMode: 'all', pageRange: '1-',
        showDocumentName: true, showPageName: true, showPageNumber: true, showSavedAt: true, showAuthor: false,
        showDocumentId: false, showInfo: false, anchor: 'bottom-right', anchorOffsetX: 10, anchorOffsetY: 10
      }
    }]
    document.relationships = [{
      id: 'edge-1', type: 'crowFoot', source: 'table-1', target: 'table-2', data: {
        sourceCardinality: '0..n', targetCardinality: '1', optional: false, imported: false, routeType: 'smoothstep'
      }
    }]

    const copy = duplicatePage(document, document.pages[0].id)

    expect(copy?.name).toBe('Seite 1 Kopie')
    expect(document.pages).toHaveLength(2)
    const copiedNodes = document.nodes.filter((node) => node.pageId === copy?.id)
    expect(copiedNodes).toHaveLength(2)
    expect(document.relationships).toHaveLength(2)
    expect(copiedNodes.map((node) => node.id)).toContain(document.relationships[1].source)
    expect(copiedNodes.map((node) => node.id)).toContain(document.relationships[1].target)
  })

  it('deletes a page with its local objects and relationships while preserving repeated info blocks', () => {
    const document = newDocument()
    const firstPageId = document.pages[0].id
    const secondPage = createPage(2)
    document.pages.push(secondPage)
    const firstTable = tableNode(firstPageId)
    const secondTable = tableNode(secondPage.id)
    secondTable.id = 'table-2'
    document.nodes = [firstTable, secondTable, {
      id: 'global-info', type: 'infoBlock', pageId: firstPageId, position: { x: 10, y: 10 },
      data: {
        kind: 'infoBlock', scale: 1, heading: 'Info', infoText: '', author: '', repeatMode: 'all', pageRange: '1-',
        showDocumentName: true, showPageName: true, showPageNumber: true, showSavedAt: true, showAuthor: false,
        showDocumentId: false, showInfo: false, anchor: 'bottom-right', anchorOffsetX: 10, anchorOffsetY: 10
      }
    }]
    document.relationships = [{
      id: 'edge-1', type: 'crowFoot', source: firstTable.id, target: secondTable.id,
      data: { sourceCardinality: '0..n', targetCardinality: '1', imported: false }
    }]

    const result = deletePage(document, firstPageId)

    expect(result).toEqual({ deleted: true, nextPageId: secondPage.id })
    expect(document.pages.map((page) => page.id)).toEqual([secondPage.id])
    expect(document.nodes.map((node) => node.id)).toEqual(['table-2', 'global-info'])
    expect(document.nodes.find((node) => node.id === 'global-info')?.pageId).toBe(secondPage.id)
    expect(document.relationships).toEqual([])
    expect(deletePage(document, secondPage.id)).toEqual({ deleted: false })
  })

  it('calculates one fixed 100 percent viewport scale from the paper size', () => {
    const document = newDocument()
    const dimensions = pageDimensions(document.page)

    const scale = pageViewportScale(document.page, dimensions.width / 2, dimensions.height / 2)

    expect(scale).toBeCloseTo(0.5)
  })

  it('stores four paper margins and migrates the legacy shared margin', () => {
    const document = newDocument()
    expect(pageMargins(document.page)).toEqual({ top: 8, right: 8, bottom: 8, left: 8 })

    const legacy = JSON.parse(serializeDocument(document))
    legacy.page.marginMm = 12
    delete legacy.page.marginTopMm
    delete legacy.page.marginRightMm
    delete legacy.page.marginBottomMm
    delete legacy.page.marginLeftMm

    expect(pageMargins(parseDocument(legacy).page)).toEqual({ top: 12, right: 12, bottom: 12, left: 12 })
  })

  it('preserves table presentation while refreshing a schema snapshot', () => {
    const document = newDocument()
    document.nodes = [tableNode(document.pages[0].id)]
    const snapshot: SchemaSnapshot = {
      databaseProduct: 'PostgreSQL',
      databaseVersion: '17',
      importedAt: new Date().toISOString(),
      tables: [{
        schema: '', name: 'CUSTOMERS', type: 'TABLE',
        columns: [{ name: 'ID', typeName: 'BIGINT', nullable: false, primaryKey: true, foreignKey: false }]
      }],
      relationships: []
    }

    const refreshed = importSnapshot(document, snapshot)

    expect(refreshed.nodes[0].position).toEqual({ x: 20, y: 20 })
    expect(refreshed.nodes[0].data.kind === 'table' && refreshed.nodes[0].data.alias).toBe('Kunden')
    expect(refreshed.nodes[0].data.scale).toBe(0.95)
  })

  it('creates a multipage print document without editor controls', () => {
    const document = newDocument()
    const secondPage = createPage(2)
    secondPage.name = 'Details'
    secondPage.tableScale = 0.9
    document.pages.push(secondPage)
    document.nodes = [
      tableNode(document.pages[0].id), tableNode(secondPage.id),
      { id: 'text-1', type: 'text', pageId: document.pages[0].id, position: { x: 30, y: 300 }, data: { kind: 'text', text: 'Hinweis', fontSize: 18, scale: 1 } },
      { id: 'text-2', type: 'text', pageId: secondPage.id, position: { x: 30, y: 300 }, data: { kind: 'text', text: 'Hinweis', fontSize: 18, scale: 1 } }
    ]
    document.nodes[1].id = 'table-2'

    const html = buildPrintHtml(document)

    expect(html.match(/<section class="page">/g)).toHaveLength(2)
    expect(html).toContain('@page{size:297mm 210mm')
    expect(html).toContain('Details · 2 / 2')
    expect(html).toContain('Kunden')
    expect(html).toContain('column-name not-null')
    expect(html).not.toContain('column-name primary')
    expect(html).not.toContain('BIGINT •')
    expect(html).toContain('data-lucide="key-round"')
    expect(html).not.toContain('>PK<')
    expect(html).not.toContain('vue-flow')
    expect(html).toContain('--scale:0.7125;')
    expect(html).toContain('--scale:0.64125;')
    expect(html.match(/--font-size:18px/g)).toHaveLength(2)
    expect(html).not.toContain('fitContentToPage')
  })

  it('creates PDF tooltip rectangles for abbreviated database types', () => {
    const document = newDocument()
    document.nodes = [tableNode(document.pages[0].id)]
    const tooltips = buildPdfTooltips(document)
    expect(tooltips).toHaveLength(1)
    expect(tooltips[0]).toMatchObject({ pageIndex: 0, text: 'ID: BIGINT' })
    expect(tooltips[0].width).toBeGreaterThan(0)
    expect(tooltips[0].height).toBeGreaterThan(0)
  })

  it('uses 75 percent as the table size at three neutral 100 percent controls', () => {
    const document = newDocument()
    const node = tableNode(document.pages[0].id)
    node.data.scale = 1
    document.nodes = [node, {
      id: 'text-1', type: 'text', pageId: document.pages[0].id, position: { x: 30, y: 300 },
      data: { kind: 'text', text: 'Unskaliert', fontSize: 18, scale: 1 }
    }]

    const html = buildPrintHtml(document)

    expect(document.styles.baseScale).toBe(1)
    expect(document.pages[0].tableScale).toBe(1)
    expect(html).toContain('--scale:0.75;')
    expect(html).toContain('--font-size:18px')
  })

  it('uses compact type abbreviations when calculating table widths', () => {
    const node = tableNode(newDocument().pages[0].id)
    if (node.data.kind !== 'table') throw new Error('Testknoten ist keine Tabelle')
    node.data.columns = [
      { id: 'one', name: 'configuration_with_a_long_name', typeName: 'int8', nullable: true, primaryKey: true, foreignKey: false },
      { id: 'two', name: 'id', typeName: 'timestamp with time zone', nullable: false, primaryKey: false, foreignKey: true }
    ]

    expect(shortTypeName('varchar(3000)')).toBe('VC')
    expect(shortTypeName('INT8')).toBe('I8')
    expect(shortTypeName('timestamp with time zone')).toBe('TSZ')
    expect(shortTypeName('character varying(2048)[]')).toBe('VC[]')
    expect(tableSize(node.data).width).toBeGreaterThan(195)
    expect(tableSize(node.data).width).toBeLessThan(215)
    const html = buildPrintHtml({ ...newDocument(), nodes: [node] })
    expect(html).toContain('grid-template-columns:max-content minmax(0,1fr) max-content')
    expect(html).not.toContain('max-width:calc(70px * var(--scale))')
  })

  it('orders table attributes by primary key, foreign key and then alphabetically', () => {
    const columns = [
      { name: 'zeta', primaryKey: false, foreignKey: false },
      { name: 'customer_id', primaryKey: false, foreignKey: true },
      { name: 'id', primaryKey: true, foreignKey: false },
      { name: 'alpha', primaryKey: false, foreignKey: false },
      { name: 'parent_id', primaryKey: true, foreignKey: true }
    ]

    expect(sortTableColumns(columns).map((column) => column.name)).toEqual([
      'id', 'parent_id', 'customer_id', 'alpha', 'zeta'
    ])
  })

  it('keeps both bars outside the table and places the optional circle tightly behind the crow foot', () => {
    const one = cardinalityGeometry('1')
    const optionalMany = cardinalityGeometry('0..n')

    expect(one.maximumOffset).toBeGreaterThan(RELATIONSHIP_STROKE_WIDTH / 2)
    expect(one.minimumOffset - one.maximumOffset).toBeCloseTo(1.75 + RELATIONSHIP_STROKE_WIDTH)
    expect(optionalMany.maximumOffset).toBe(RELATIONSHIP_STROKE_WIDTH / 2)
    expect(optionalMany.minimumOffset - optionalMany.circleRadius - optionalMany.apexOffset).toBeLessThanOrEqual(0.5)
  })

  it('chooses the neighboring table edges for automatically created relationships', () => {
    const pageId = newDocument().pages[0].id
    const source = tableNode(pageId, 100, 100)
    const right = tableNode(pageId, 500, 120)
    const below = tableNode(pageId, 120, 500)

    expect(nearestNeighborSides(source, right)).toEqual({ source: 'right', target: 'left' })
    expect(nearestNeighborSides(source, below)).toEqual({ source: 'bottom', target: 'top' })
    expect(nearestNeighborSides(right, source)).toEqual({ source: 'left', target: 'right' })
  })

  it('moves relationship anchors along the table border and switches edges at corners', () => {
    const rect = { left: 100, top: 50, width: 200, height: 400 }

    expect(nearestRelationshipAnchor(rect, 300, 200).anchor).toEqual({ side: 'right', position: -0.25 })
    expect(nearestRelationshipAnchor(rect, 180, 40).anchor).toEqual({ side: 'top', position: -0.2 })
    expect(nearestRelationshipAnchor(rect, 200, 470).anchor).toEqual({ side: 'bottom', position: 0 })
    expect(nearestRelationshipAnchor(rect, 300, 196, true).anchor).toEqual({ side: 'right', position: -0.27 })
  })

  it('prefers a straight connector over the table-edge position grid', () => {
    const rect = { left: 100, top: 50, width: 200, height: 400 }

    expect(alignedRelationshipAnchor(rect, 300, 209, { x: 500, y: 203 })).toEqual({
      anchor: { side: 'right', position: -0.235 }, aligned: 'horizontal'
    })
    expect(alignedRelationshipAnchor(rect, 300, 209, { x: 500, y: 203 }, true)).toEqual({
      anchor: { side: 'right', position: -0.205 }
    })
  })

  it('aligns object edges and centers to nearby objects and returns temporary guides', () => {
    const document = newDocument()
    const source = tableNode(document.pages[0].id)
    const target = tableNode(document.pages[0].id, 400, 260)
    target.id = 'table-2'
    if (target.data.kind !== 'table') throw new Error('Testknoten ist keine Tabelle')
    target.data.scale = 1.5
    const sourceSize = nodeSize(source, 1, document)
    const targetSize = nodeSize(target, 1, document)
    const nearCenter = {
      x: target.position.x + targetSize.width / 2 - sourceSize.width / 2 + 4,
      y: target.position.y + targetSize.height / 2 - sourceSize.height / 2 - 3
    }

    const aligned = alignNodeToNearbyObjects(document, source, nearCenter, [target], 1)

    expect(aligned.position.x + sourceSize.width / 2).toBeCloseTo(target.position.x + targetSize.width / 2)
    expect(aligned.position.y + sourceSize.height / 2).toBeCloseTo(target.position.y + targetSize.height / 2)
    expect(aligned.guides.map((guide) => guide.axis).sort()).toEqual(['x', 'y'])
  })

  it('supports Vue route types and snapped manual route centers', () => {
    const base = { sourceX: 20, sourceY: 40, targetX: 220, targetY: 140 }
    const data = { sourceCardinality: '0..n' as const, targetCardinality: '1' as const, imported: false }

    expect(relationshipPath({ ...base, data: { ...data, routeType: 'straight' } })[0]).toContain('L 220,140')
    expect(relationshipPath({ ...base, data: { ...data, routeType: 'straight', routeOffsetX: 20 } })[0]).toContain('L140 90 L220 140')
    expect(relationshipPath({ ...base, data: { ...data, routeType: 'bezier', routeOffsetY: 20 } })[0]).toContain('Q120 130 220 140')
    expect(relationshipPath({ ...base, data: { ...data, routeType: 'step' } })[0])
      .not.toBe(relationshipPath({ ...base, data: { ...data, routeType: 'smoothstep' } })[0])
    expect(snapRouteCoordinate(24, false)).toBe(20)
    expect(snapRouteCoordinate(24, true)).toBe(24)
  })

  it('renders persistent route helper points in their explicit order', () => {
    const path = relationshipPath({
      sourceX: 10, sourceY: 20, targetX: 210, targetY: 120,
      data: {
        sourceCardinality: '0..n', targetCardinality: '1', imported: false,
        routeType: 'smoothstep', routePoints: [{ x: 80, y: 20 }, { x: 80, y: 120 }]
      }
    })
    expect(path[0]).toBe('M10 20 L80 20 L80 120 L210 120')
    expect(path.slice(1, 3)).toEqual([80, 20])
  })

  it('snaps the table edge nearest to the paper edge onto a grid that closes at both borders', () => {
    const document = newDocument()
    const node = tableNode(document.pages[0].id)
    const dimensions = pageDimensions(document.page)
    const tableScale = TABLE_BASE_RENDER_SCALE * document.styles.baseScale * document.pages[0].tableScale
    const size = tableSize({ ...node.data as Extract<DiagramNode['data'], { kind: 'table' }>, scale: node.data.scale * tableScale })

    expect(snapTablePositionToPageGrid(document, node, { x: 7, y: 8 }, tableScale)).toEqual({ x: 0, y: 0 })
    const bottomRight = snapTablePositionToPageGrid(document, node, {
      x: dimensions.width - size.width - 7,
      y: dimensions.height - size.height - 8
    }, tableScale)
    expect(bottomRight.x + size.width).toBeCloseTo(dimensions.width)
    expect(bottomRight.y + size.height).toBeCloseTo(dimensions.height)

    const beyondTopLeft = snapTablePositionToPageGrid(document, node, { x: -27, y: -23 }, tableScale)
    expect(beyondTopLeft.x).toBeLessThan(0)
    expect(beyondTopLeft.y).toBeLessThan(0)

    const beyondBottomRight = snapTablePositionToPageGrid(document, node, {
      x: dimensions.width - size.width + 27,
      y: dimensions.height - size.height + 23
    }, tableScale)
    expect(beyondBottomRight.x + size.width).toBeGreaterThan(dimensions.width)
    expect(beyondBottomRight.y + size.height).toBeGreaterThan(dimensions.height)
  })

  it('supports open page ranges and renders one info-block template only on matching pages', () => {
    const document = newDocument()
    while (document.pages.length < 5) document.pages.push(createPage(document.pages.length + 1))
    document.nodes = [{
      id: 'info-1', type: 'infoBlock', pageId: document.pages[0].id, position: { x: 700, y: 600 },
      data: {
        kind: 'infoBlock', scale: 1, heading: 'ERIDION · ERD', infoText: 'Freigabestand', author: 'FM',
        repeatMode: 'range', pageRange: '1-3,5-',
        showDocumentName: true, showPageName: true, showPageNumber: true, showSavedAt: true,
        showAuthor: true, showDocumentId: false, showInfo: true,
        anchor: 'bottom-right', anchorOffsetX: 20, anchorOffsetY: 20
      }
    }]

    expect(pageRangeIncludes('1-3,5-', 1, 5)).toBe(true)
    expect(pageRangeIncludes('1-3,5-', 4, 5)).toBe(false)
    expect(pageRangeIncludes('1-3,5-', 5, 5)).toBe(true)
    expect(nodesForPage(document, document.pages[3].id)).toHaveLength(0)
    const pageFiveNodes = nodesForPage(document, document.pages[4].id)
    expect(pageFiveNodes).toHaveLength(1)
    expect(storedNodeId(pageFiveNodes[0].id)).toBe('info-1')

    const html = buildPrintHtml(document, '2026-07-12T12:00:00.000Z')
    expect(html.match(/class="info-block-print"/g)).toHaveLength(4)
    expect(html).toContain('Freigabestand')
    expect(html).toContain('FM')
    expect(html).toContain('5 / 5')
    expect(html).not.toContain('ENTITY RELATIONSHIP DIAGRAM')
    expect(html).not.toContain('>Format<')
    expect(html).not.toContain('>Revision<')
    expect(html.indexOf('>Seite<')).toBeLessThan(html.indexOf('>Stand<'))
    expect(html.indexOf('>Stand<')).toBeLessThan(html.indexOf('>Info<'))
    expect(html).toContain('grid-template-columns:repeat(3,minmax(0,1fr))')
    expect(html).toContain('info-cell end last-row')
    expect(html).toContain('.info-cell.last-row{border-bottom:0}')

    if (document.nodes[0].data.kind !== 'infoBlock') throw new Error('Testknoten ist kein Infoblock')
    const oneLineSize = infoBlockSize(document.nodes[0].data, document)
    document.nodes[0].data.infoText = 'Sehr lange technische Zusatzinformation '.repeat(12)
    expect(infoBlockSize(document.nodes[0].data, document).width).toBeGreaterThan(oneLineSize.width)
    document.nodes[0].data.infoText = 'Erste Zeile\nZweite Zeile\nDritte Zeile'
    expect(infoBlockSize(document.nodes[0].data, document).height).toBeGreaterThan(oneLineSize.height)
    expect(buildPrintHtml(document)).toContain('Erste Zeile\nZweite Zeile\nDritte Zeile')
    document.nodes[0].data.infoText = '   '
    expect(buildPrintHtml(document)).not.toContain('>Info<')
  })

  it('keeps an info block fixed to its nearest corner when the paper format changes', () => {
    const document = newDocument()
    const node: DiagramNode = {
      id: 'info-anchor', type: 'infoBlock', pageId: document.pages[0].id, position: { x: 0, y: 0 },
      data: {
        kind: 'infoBlock', scale: 1, heading: 'INFO', infoText: '', author: '',
        repeatMode: 'all', pageRange: '1-', showDocumentName: true, showPageName: true,
        showPageNumber: true, showSavedAt: true, showAuthor: false,
        showDocumentId: false, showInfo: false, anchor: 'bottom-right', anchorOffsetX: 20, anchorOffsetY: 20
      }
    }
    document.nodes = [node]
    const oldDimensions = pageDimensions(document.page)
    if (node.data.kind !== 'infoBlock') throw new Error('Testknoten ist kein Infoblock')
    const size = infoBlockSize(node.data)
    node.position = { x: oldDimensions.width - size.width - 20, y: oldDimensions.height - size.height - 20 }
    captureInfoBlockAnchor(document, node)
    expect(node.data.kind === 'infoBlock' && node.data.anchor).toBe('bottom-right')

    document.page.format = 'A3'
    positionInfoBlockFromAnchor(document, node)
    const newDimensions = pageDimensions(document.page)
    expect(newDimensions.width - node.position.x - size.width).toBeCloseTo(20)
    expect(newDimensions.height - node.position.y - size.height).toBeCloseTo(20)

    node.data.showInfo = true
    node.data.infoText = 'Eine sehr lange technische Information ohne Verlust der rechten Verankerung '.repeat(5)
    document.page.format = 'A6'
    document.page.orientation = 'portrait'
    const smallPageDimensions = pageDimensions(document.page)
    const resizedBlock = infoBlockSize(node.data, document)
    positionInfoBlockFromAnchor(document, node)
    expect(resizedBlock.width).toBeLessThanOrEqual(smallPageDimensions.width - 28)
    expect(smallPageDimensions.width - node.position.x - resizedBlock.width).toBeCloseTo(20)
    expect(smallPageDimensions.height - node.position.y - resizedBlock.height).toBeCloseTo(20)
  })

  it('prints free text without a frame and with its configured background', () => {
    const document = newDocument()
    document.nodes = [{
      id: 'text-1', type: 'text', pageId: document.pages[0].id, position: { x: 20, y: 20 },
      data: { kind: 'text', text: '**Weißer Freitext**', fontSize: 18, scale: 1, backgroundColor: '#fff7ed', markdown: true, textAlign: 'right', width: 260, height: 90 }
    }]

    const html = buildPrintHtml(document)
    expect(html).toContain('.note{width:100%;height:100%;padding:8px;overflow:hidden;border:0;')
    expect(html).toContain('background:#fff7ed')
    expect(html).toContain('text-align:right')
    expect(html).toContain('<strong>Weißer Freitext</strong>')
    expect(nodeSize(document.nodes[0], 1)).toEqual({ width: 260, height: 90 })
  })

  it('resolves free-text placeholders identically in the PDF output', () => {
    const document = newDocument()
    document.title = 'Systemmodell'
    document.pages[0].name = 'Übersicht'
    document.nodes = [{
      id: 'text-1', type: 'text', pageId: document.pages[0].id, position: { x: 20, y: 20 },
      data: { kind: 'text', text: '{DOCUMENT} · {TAB} · {PAGE}/{PAGES} · {DATE}', fontSize: 18, scale: 1, markdown: false }
    }]

    const html = buildPrintHtml(document, new Date(2026, 6, 13, 12, 34).toISOString())

    expect(html).toContain('Systemmodell · Übersicht · 1/1 · 13.07.2026')
    expect(html).not.toContain('{PAGE}')
  })

  it('prints smart-step relationships with their persisted relative label position', () => {
    const document = newDocument()
    const second = tableNode(document.pages[0].id, 430, 160)
    second.id = 'table-2'
    document.nodes = [tableNode(document.pages[0].id, 20, 20), second]
    document.relationships = [{
      id: 'edge-1', type: 'crowFoot', source: 'table-1', target: 'table-2',
      data: {
        sourceCardinality: '0..n', targetCardinality: '1', imported: false,
        label: 'FK_CUSTOMER', labelOffsetX: 35, labelOffsetY: -12,
        sourceAnchor: { side: 'bottom', position: 0.5 },
        targetAnchor: { side: 'top', position: -0.25 }
      }
    }]

    const html = buildPrintHtml(document)

    expect(html).toContain('class="edge-text"')
    expect(html).toContain('FK_CUSTOMER')
    expect(html).toMatch(/<path d="M[^\"]+[LQ][^\"]+"/)
    expect(html).toContain('data-cardinality="0..n"')
    expect(html).toContain('data-cardinality="1"')
    expect(html).toContain('M0.7 -4.5 L6 0 M0.7 4.5 L6 0')
    expect(html).toContain('M5.65 -4.5 L5.65 4.5')
    expect(html).toContain('M2.5 -4.5 L2.5 4.5')
    expect(html).not.toContain('marker-end=')
    expect(JSON.parse(serializeDocument(document)).relationships[0].data).toMatchObject({
      labelOffsetX: 35, labelOffsetY: -12,
      sourceAnchor: { side: 'bottom', position: 0.5 },
      targetAnchor: { side: 'top', position: -0.25 }
    })
  })

  it('serializes a versioned source document', () => {
    const serialized = JSON.parse(serializeDocument(newDocument()))
    expect(serialized.formatVersion).toBe(1)
    expect(serialized.documentId).toBeTruthy()
  })

  it('persists an object lock in the editable document', () => {
    const document = newDocument()
    const node = tableNode(document.pages[0].id)
    node.draggable = false
    document.nodes = [node]

    expect(parseDocument(JSON.parse(serializeDocument(document))).nodes[0].draggable).toBe(false)
  })

  it('migrates legacy diagrams onto an explicit first page', () => {
    const document = newDocument()
    const legacy = { ...document, pages: undefined, nodes: [{ ...tableNode(document.pages[0].id), pageId: undefined }] }

    const migrated = parseDocument(legacy)

    expect(migrated.pages).toHaveLength(1)
    expect(migrated.pages[0].tableScale).toBe(1)
    expect(migrated.nodes[0].pageId).toBe(migrated.pages[0].id)
  })

  it('migrates old column handles to stable normalized table anchors', () => {
    const document = newDocument()
    document.nodes = [tableNode(document.pages[0].id), { ...tableNode(document.pages[0].id, 400, 20), id: 'table-2' }]
    document.relationships = [{
      id: 'legacy-edge', type: 'crowFoot', source: 'table-1', target: 'table-2',
      sourceHandle: 'source-ID', targetHandle: 'target-ID',
      data: { sourceCardinality: '0..n', targetCardinality: '1', imported: true }
    }]

    const migrated = parseDocument(JSON.parse(serializeDocument(document)))

    expect(migrated.relationships[0]).toMatchObject({
      sourceHandle: 'source-legacy-edge', targetHandle: 'target-legacy-edge',
      data: {
        sourceAnchor: { side: 'right', position: 0 },
        targetAnchor: { side: 'left', position: 0 }
      }
    })
  })

  it('keeps the exact configured Legal landscape ratio', () => {
    const dimensions = pageDimensions({ format: 'Legal', orientation: 'landscape', marginMm: 8, showPageNumbers: true })
    expect(dimensions.widthMm).toBe(355.6)
    expect(dimensions.heightMm).toBe(215.9)
    expect(dimensions.ratio).toBeCloseTo(355.6 / 215.9)
  })

  it('supports ISO A0 through A6 with the corresponding fixed base scale', () => {
    const expectedPortrait = {
      A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420],
      A4: [210, 297], A5: [148, 210], A6: [105, 148]
    } as const
    for (const [format, [width, height]] of Object.entries(expectedPortrait)) {
      const dimensions = pageDimensions({ format: format as keyof typeof expectedPortrait, orientation: 'portrait', marginMm: 8, showPageNumbers: true })
      expect(dimensions.widthMm).toBe(width)
      expect(dimensions.heightMm).toBe(height)
    }

    const viewport = { width: 1000, height: 700 }
    const a4Scale = pageViewportScale({ format: 'A4', orientation: 'landscape', marginMm: 8, showPageNumbers: true }, viewport.width, viewport.height)
    const a0Scale = pageViewportScale({ format: 'A0', orientation: 'landscape', marginMm: 8, showPageNumbers: true }, viewport.width, viewport.height)
    const a6Scale = pageViewportScale({ format: 'A6', orientation: 'landscape', marginMm: 8, showPageNumbers: true }, viewport.width, viewport.height)
    expect(a0Scale / a4Scale).toBeCloseTo(0.25, 2)
    expect(a6Scale / a4Scale).toBeCloseTo(2, 2)
  })

  it('uses the single hovered snap handle as a normalized relationship anchor', () => {
    expect(parseSnapAnchor('snap-source-top--0.375', 'right')).toEqual({ side: 'top', position: -0.375 })
    expect(parseSnapAnchor('snap-target-bottom-0.625', 'left')).toEqual({ side: 'bottom', position: 0.625 })
    expect(parseSnapAnchor(undefined, 'left')).toEqual({ side: 'left', position: 0 })
  })

  it('adds selected schema tables individually and creates their FK edge once both are present', () => {
    const document = newDocument()
    const snapshot: SchemaSnapshot = {
      databaseProduct: 'PostgreSQL',
      databaseVersion: '17',
      importedAt: new Date().toISOString(),
      tables: [
        {
          schema: 'public', name: 'CUSTOMERS', type: 'TABLE',
          columns: [{ name: 'ID', typeName: 'BIGINT', nullable: false, primaryKey: true, foreignKey: false }]
        },
        {
          schema: 'public', name: 'ORDERS', type: 'TABLE',
          columns: [
            { name: 'ZETA', typeName: 'TEXT', nullable: true, primaryKey: false, foreignKey: false },
            { name: 'CUSTOMER_ID', typeName: 'BIGINT', nullable: true, primaryKey: false, foreignKey: true },
            { name: 'ID', typeName: 'BIGINT', nullable: false, primaryKey: true, foreignKey: false },
            { name: 'ALPHA', typeName: 'TEXT', nullable: true, primaryKey: false, foreignKey: false }
          ]
        }
      ],
      relationships: [
        {
          name: 'FK_ORDERS_CUSTOMERS',
          sourceSchema: 'public', sourceTable: 'ORDERS', sourceColumn: 'CUSTOMER_ID',
          targetSchema: 'public', targetTable: 'CUSTOMERS', targetColumn: 'ID'
        },
        {
          name: 'FK_ORDERS_CUSTOMERS_REVERSE_METADATA',
          sourceSchema: 'public', sourceTable: 'CUSTOMERS', sourceColumn: 'ID',
          targetSchema: 'public', targetTable: 'ORDERS', targetColumn: 'CUSTOMER_ID'
        }
      ]
    }

    const first = addSchemaTableToPage(document, snapshot, snapshot.tables[0], document.pages[0].id, { x: 40, y: 50 })
    expect(first.added).toBe(true)
    expect(document.relationships).toHaveLength(0)

    const second = addSchemaTableToPage(document, snapshot, snapshot.tables[1], document.pages[0].id, { x: 400, y: 50 })
    expect(second.added).toBe(true)
    expect(document.nodes).toHaveLength(2)
    expect(document.relationships).toHaveLength(1)
    expect(document.relationships[0].data?.imported).toBe(true)
    expect(document.nodes[1].data.kind === 'table' && document.nodes[1].data.columns.map((column) => column.name)).toEqual(['ID', 'CUSTOMER_ID', 'ALPHA', 'ZETA'])
    expect(document.relationships[0]).toMatchObject({
      sourceHandle: `source-${document.relationships[0].id}`,
      targetHandle: `target-${document.relationships[0].id}`,
      data: {
        label: 'CUSTOMER_ID',
        optional: true,
        targetCardinality: '0..1',
        sourceAnchor: { side: 'left', position: -0.333 },
        targetAnchor: { side: 'right', position: 0 }
      }
    })
    expect(buildPrintHtml(document)).toContain('stroke-dasharray="5 4"')

    const savedAnchor = structuredClone(document.relationships[0].data.sourceAnchor)
    if (document.nodes[1].data.kind === 'table') {
      document.nodes[1].data.columns.push({ id: 'new', name: 'NEW_COLUMN', typeName: 'TEXT', nullable: true, primaryKey: false, foreignKey: false })
    }
    expect(document.relationships[0].data.sourceAnchor).toEqual(savedAnchor)

    const duplicate = addSchemaTableToPage(document, snapshot, snapshot.tables[1], document.pages[0].id, { x: 800, y: 50 })
    expect(duplicate.added).toBe(false)
    expect(document.nodes).toHaveLength(2)
    expect(document.relationships).toHaveLength(1)
  })

  it('only creates imported relationships involving the newly dropped table', () => {
    const document = newDocument()
    const tables = ['A', 'B', 'C'].map((name) => ({
      schema: 'public', name, type: 'TABLE',
      columns: [{ name: 'ID', typeName: 'BIGINT', nullable: false, primaryKey: true, foreignKey: false }]
    }))
    const initialSnapshot: SchemaSnapshot = {
      databaseProduct: 'PostgreSQL', databaseVersion: '17', importedAt: 'first', tables, relationships: []
    }
    addSchemaTableToPage(document, initialSnapshot, tables[0], document.pages[0].id, { x: 20, y: 20 })
    addSchemaTableToPage(document, initialSnapshot, tables[1], document.pages[0].id, { x: 220, y: 20 })

    const updatedSnapshot: SchemaSnapshot = {
      ...initialSnapshot,
      importedAt: 'second',
      relationships: [
        { sourceSchema: 'public', sourceTable: 'A', sourceColumn: 'ID', targetSchema: 'public', targetTable: 'B', targetColumn: 'ID' },
        { sourceSchema: 'public', sourceTable: 'C', sourceColumn: 'ID', targetSchema: 'public', targetTable: 'A', targetColumn: 'ID' }
      ]
    }
    const result = addSchemaTableToPage(document, updatedSnapshot, tables[2], document.pages[0].id, { x: 420, y: 20 })

    expect(result.added).toBe(true)
    expect(document.relationships).toHaveLength(1)
    expect(document.relationships[0].source).toBe(result.node?.id)
    expect(document.relationships[0].target).toBe(document.nodes[0].id)
  })
})
