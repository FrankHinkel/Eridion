import { describe, expect, it } from 'vitest'
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH, parseStoredSidebarWidth } from './sidebar-resize'

describe('sidebar splitter', () => {
  it('keeps enough room for both sidebar and diagram', () => {
    expect(clampSidebarWidth(100)).toBe(180)
    expect(clampSidebarWidth(800)).toBe(520)
    expect(clampSidebarWidth(500, 850)).toBe(430)
  })

  it('restores only valid persisted widths', () => {
    expect(parseStoredSidebarWidth('320')).toBe(320)
    expect(parseStoredSidebarWidth('invalid')).toBe(DEFAULT_SIDEBAR_WIDTH)
  })
})
