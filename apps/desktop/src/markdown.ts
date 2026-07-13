const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
})[character]!)

function inlineMarkdown(value: string): string {
  const tokens: string[] = []
  const token = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`
  let result = value.replace(/`([^`]+)`/g, (_match, code: string) => token(`<code>${escapeHtml(code)}</code>`))
  result = result.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const target = url.trim()
    if (!/^(https?:\/\/|mailto:)/i.test(target)) return escapeHtml(label)
    return token(`<a href="${escapeHtml(target)}">${escapeHtml(label)}</a>`)
  })
  result = escapeHtml(result)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return result.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? '')
}

export function renderMarkdown(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let list: 'ul' | 'ol' | undefined
  let code: string[] | undefined
  const closeList = () => { if (list) output.push(`</${list}>`); list = undefined }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList()
      if (code) { output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = undefined }
      else code = []
      continue
    }
    if (code) { code.push(line); continue }
    const unordered = /^\s*[-+*]\s+(.+)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (unordered || ordered) {
      const type = unordered ? 'ul' : 'ol'
      if (list !== type) { closeList(); list = type; output.push(`<${type}>`) }
      output.push(`<li>${inlineMarkdown((unordered ?? ordered)![1])}</li>`)
      continue
    }
    closeList()
    if (!line.trim()) { output.push('<br>'); continue }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) { const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) { output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); continue }
    output.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  closeList()
  if (code) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return output.join('')
}

export { escapeHtml }
