import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('safe Markdown renderer', () => {
  it('renders common technical-note markup', () => {
    const html = renderMarkdown('# Titel\n**fett** und `code`\n- Eins\n- Zwei\n[Dokumentation](https://example.com)')
    expect(html).toContain('<h1>Titel</h1>')
    expect(html).toContain('<strong>fett</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<ul><li>Eins</li><li>Zwei</li></ul>')
    expect(html).toContain('<a href="https://example.com">Dokumentation</a>')
  })

  it('escapes HTML and rejects executable links', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n[x](javascript:alert(1))')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('javascript:')
  })
})
