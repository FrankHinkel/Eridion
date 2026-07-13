function childrenMarkdown(node: ParentNode): string {
  return Array.from(node.childNodes).map(childMarkdown).join('')
}

function listMarkdown(element: Element, ordered: boolean): string {
  return Array.from(element.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((item, index) => {
      const value = childrenMarkdown(item).trim().replace(/\n+/g, ' ')
      return `${ordered ? `${index + 1}.` : '-'} ${value}`
    })
    .join('\n') + '\n'
}

function childMarkdown(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  const content = childrenMarkdown(element)

  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return `**${content}**`
  if (tag === 'em' || tag === 'i') return `*${content}*`
  if (tag === 'code' && element.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${content}\``
  if (tag === 'a') return `[${content}](${element.getAttribute('href') ?? ''})`
  if (tag === 'ul') return listMarkdown(element, false)
  if (tag === 'ol') return listMarkdown(element, true)
  if (tag === 'pre') return `\`\`\`\n${element.textContent ?? ''}\n\`\`\`\n`
  if (tag === 'blockquote') return content.trim().split('\n').map((line) => `> ${line}`).join('\n') + '\n'
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${content.trim()}\n`
  if (tag === 'p' || tag === 'div') return `${content.trimEnd()}\n`
  return content
}

export function htmlToMarkdown(root: ParentNode): string {
  return childrenMarkdown(root)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}
