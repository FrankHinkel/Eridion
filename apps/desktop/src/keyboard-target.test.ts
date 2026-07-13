import { describe, expect, it } from 'vitest'
import { isEditableKeyboardTarget } from './keyboard-target'

describe('keyboard target detection', () => {
  it('recognizes form controls', () => {
    expect(isEditableKeyboardTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableKeyboardTarget({ tagName: 'textarea' })).toBe(true)
    expect(isEditableKeyboardTarget({ tagName: 'SELECT' })).toBe(true)
  })

  it('recognizes contenteditable elements and their descendants', () => {
    const editor = { tagName: 'DIV', isContentEditable: true, parentElement: null }
    const heading = { tagName: 'H1', isContentEditable: false, parentElement: editor }
    expect(isEditableKeyboardTarget(editor)).toBe(true)
    expect(isEditableKeyboardTarget(heading)).toBe(true)
  })

  it('does not classify the diagram canvas as editable', () => {
    expect(isEditableKeyboardTarget({ tagName: 'DIV', isContentEditable: false, parentElement: null })).toBe(false)
  })
})
