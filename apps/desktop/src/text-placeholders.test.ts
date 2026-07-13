import { describe, expect, it } from 'vitest'
import { newDocument } from './model'
import { resolveTextPlaceholders } from './text-placeholders'

describe('free-text placeholders', () => {
  it('resolves page, document and date values without changing unknown fields', () => {
    const document = newDocument()
    document.title = 'Datenmodell'
    document.pages[0].name = 'Übersicht'

    const resolved = resolveTextPlaceholders(
      '{DOCUMENT} · {TAB} · {PAGE}/{PAGES} · {DATE} {TIME} · {UNKNOWN}',
      { document, page: document.pages[0], pageIndex: 0, date: new Date(2026, 6, 13, 12, 34) }
    )

    expect(resolved).toBe('Datenmodell · Übersicht · 1/1 · 13.07.2026 12:34 · {UNKNOWN}')
  })

  it('supports case-insensitive aliases', () => {
    const document = newDocument()
    document.title = 'ERD'
    document.pages[0].name = 'Tab A'

    expect(resolveTextPlaceholders('{title}: {page_name}', {
      document, page: document.pages[0], pageIndex: 0
    })).toBe('ERD: Tab A')
  })
})
