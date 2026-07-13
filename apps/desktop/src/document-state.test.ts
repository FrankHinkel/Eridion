import { describe, expect, it } from 'vitest'
import { useDocumentState } from './document-state'
import { newDocument } from './model'

describe('document history', () => {
  it('undoes and redoes document mutations', () => {
    const state = useDocumentState()
    state.replace(newDocument())
    state.document.value.title = 'Erster Stand'
    state.changed()
    state.document.value.title = 'Zweiter Stand'
    state.changed()

    expect(state.undo()).toBe(true)
    expect(state.document.value.title).toBe('Erster Stand')
    expect(state.redo()).toBe(true)
    expect(state.document.value.title).toBe('Zweiter Stand')
  })

  it('retains at most one hundred undo steps', () => {
    const state = useDocumentState()
    state.replace(newDocument())
    for (let index = 1; index <= 105; index += 1) {
      state.document.value.title = `Stand ${index}`
      state.changed()
    }
    for (let index = 0; index < 100; index += 1) expect(state.undo()).toBe(true)
    expect(state.document.value.title).toBe('Stand 5')
    expect(state.undo()).toBe(false)
    for (let index = 0; index < 100; index += 1) expect(state.redo()).toBe(true)
    expect(state.document.value.title).toBe('Stand 105')
  })
})
