export interface PrintableAreaFitInput {
  stageWidth: number
  stageHeight: number
  sheetWidth: number
  sheetHeight: number
  paperWidthMm: number
  paperHeightMm: number
  margins: { top: number; right: number; bottom: number; left: number }
  padding?: number
  minimumZoom?: number
  maximumZoom?: number
}

export interface PrintableAreaView {
  zoom: number
  panX: number
  panY: number
}

export function fitPrintableArea(input: PrintableAreaFitInput): PrintableAreaView {
  const padding = Math.max(0, input.padding ?? 6)
  const printableWidthMm = Math.max(0.1, input.paperWidthMm - input.margins.left - input.margins.right)
  const printableHeightMm = Math.max(0.1, input.paperHeightMm - input.margins.top - input.margins.bottom)
  const printableWidth = input.sheetWidth * printableWidthMm / input.paperWidthMm
  const printableHeight = input.sheetHeight * printableHeightMm / input.paperHeightMm
  const availableWidth = Math.max(1, input.stageWidth - padding * 2)
  const availableHeight = Math.max(1, input.stageHeight - padding * 2)
  const rawZoom = Math.min(availableWidth / printableWidth, availableHeight / printableHeight)
  const zoom = Math.max(input.minimumZoom ?? 0.25, Math.min(input.maximumZoom ?? 4, rawZoom))

  const printableCenterX = (input.margins.left + printableWidthMm / 2) / input.paperWidthMm - 0.5
  const printableCenterY = (input.margins.top + printableHeightMm / 2) / input.paperHeightMm - 0.5
  return {
    zoom,
    panX: -printableCenterX * input.sheetWidth * zoom,
    panY: -printableCenterY * input.sheetHeight * zoom
  }
}
