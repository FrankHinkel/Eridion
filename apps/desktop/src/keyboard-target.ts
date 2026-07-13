interface KeyboardTargetLike {
  tagName?: string
  isContentEditable?: boolean
  parentElement?: KeyboardTargetLike | null
  getAttribute?: (name: string) => string | null
}

export function isEditableKeyboardTarget(target: unknown): boolean {
  let element = target as KeyboardTargetLike | null
  while (element) {
    const tagName = element.tagName?.toUpperCase()
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable) return true
    const contentEditable = element.getAttribute?.('contenteditable')?.toLowerCase()
    if (contentEditable === '' || contentEditable === 'true' || contentEditable === 'plaintext-only') return true
    element = element.parentElement ?? null
  }
  return false
}
