import { describe, expect, it } from 'vitest'
import { fitPrintableArea } from './page-view'

describe('printable-area page fit', () => {
  it('fills the available space up to six pixels around the printable border without distortion', () => {
    const view = fitPrintableArea({
      stageWidth: 1000, stageHeight: 600,
      sheetWidth: 800, sheetHeight: 800 / (297 / 210),
      paperWidthMm: 297, paperHeightMm: 210,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      padding: 6
    })
    const printableHeight = 800 / (297 / 210) * 190 / 210
    expect(printableHeight * view.zoom).toBeCloseTo(588, 6)
    expect(view.panX).toBeCloseTo(0, 6)
    expect(view.panY).toBeCloseTo(0, 6)
  })

  it('centers an asymmetric printable area rather than the physical sheet', () => {
    const view = fitPrintableArea({
      stageWidth: 1000, stageHeight: 600, sheetWidth: 800, sheetHeight: 566,
      paperWidthMm: 297, paperHeightMm: 210,
      margins: { top: 8, right: 10, bottom: 8, left: 20 }
    })
    expect(view.panX).toBeLessThan(0)
    expect(view.panY).toBeCloseTo(0, 6)
  })
})
