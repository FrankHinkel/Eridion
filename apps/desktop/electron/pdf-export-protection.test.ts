import { describe, expect, it } from 'vitest'
import { sameFilePath } from './pdf-export-protection'

describe('PDF export protection', () => {
  it('recognizes normalized and Windows case-insensitive source paths', async () => {
    expect(await sameFilePath('/tmp/eridion/folder/../diagram.pdf', '/tmp/eridion/diagram.pdf')).toBe(true)
    expect(await sameFilePath('C:\\ERIDION\\Diagram.pdf', 'c:\\eridion\\diagram.pdf', 'win32')).toBe(true)
  })

  it('does not protect an unrelated export path', async () => {
    expect(await sameFilePath('/tmp/eridion/source.pdf', '/tmp/eridion/export.pdf')).toBe(false)
    expect(await sameFilePath(undefined, '/tmp/eridion/export.pdf')).toBe(false)
  })
})
