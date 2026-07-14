export const DEFAULT_SIDEBAR_WIDTH = 245
export const MINIMUM_SIDEBAR_WIDTH = 180
export const MAXIMUM_SIDEBAR_WIDTH = 520

export function clampSidebarWidth(width: number, workspaceWidth = Number.POSITIVE_INFINITY): number {
  const availableMaximum = Number.isFinite(workspaceWidth)
    ? Math.max(MINIMUM_SIDEBAR_WIDTH, workspaceWidth - 420)
    : MAXIMUM_SIDEBAR_WIDTH
  return Math.round(Math.max(MINIMUM_SIDEBAR_WIDTH, Math.min(MAXIMUM_SIDEBAR_WIDTH, availableMaximum, width)))
}

export function parseStoredSidebarWidth(value: string | null): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? clampSidebarWidth(parsed) : DEFAULT_SIDEBAR_WIDTH
}
