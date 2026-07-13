import type { DiagramPage, EridionDocument } from './model'

export interface TextPlaceholderContext {
  document: EridionDocument
  page: DiagramPage
  pageIndex: number
  date?: string | Date
}

function placeholderDate(value: string | Date | undefined): Date {
  const date = value instanceof Date ? value : new Date(value ?? Date.now())
  return Number.isNaN(date.getTime()) ? new Date() : date
}

export function resolveTextPlaceholders(text: string, context: TextPlaceholderContext): string {
  const date = placeholderDate(context.date)
  const formattedDate = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(date)
  const formattedTime = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit', minute: '2-digit'
  }).format(date)
  const values: Record<string, string> = {
    TAB: context.page.name,
    PAGE_NAME: context.page.name,
    PAGE: String(context.pageIndex + 1),
    PAGES: String(context.document.pages.length),
    DATE: formattedDate,
    TIME: formattedTime,
    DATETIME: `${formattedDate} ${formattedTime}`,
    DOCUMENT: context.document.title,
    TITLE: context.document.title,
    DOCUMENT_ID: context.document.documentId
  }

  return text.replace(/\{([A-Z][A-Z0-9_]*)\}/gi, (placeholder, name: string) => values[name.toUpperCase()] ?? placeholder)
}
