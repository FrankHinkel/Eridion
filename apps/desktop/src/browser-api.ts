import type { EridionDesktopApi, StoredConnection } from '../electron/types'

const nativeOnly = (feature: string): never => {
  throw new Error(`${feature} ist im Browser-Dev-Modus nicht verfügbar. Bitte dafür „pnpm dev“ im Electron-Modus starten.`)
}

export function installBrowserApi(): void {
  if (window.eridion) return

  const api: EridionDesktopApi = {
    runtime: 'browser',
    openDiagram: async () => nativeOnly('Das Öffnen editierbarer Eridion-PDFs'),
    saveDiagram: async () => nativeOnly('Das Speichern editierbarer Eridion-PDFs'),
    exportPdf: async ({ printHtml }) => {
      const preview = window.open('', '_blank')
      if (!preview) throw new Error('Das Druckfenster wurde vom Browser blockiert.')
      preview.document.open()
      preview.document.write(printHtml)
      preview.document.close()
      preview.addEventListener('load', () => preview.print(), { once: true })
      return { canceled: false }
    },
    listConnections: async () => [],
    saveConnection: async (_connection: StoredConnection) => nativeOnly('Die JDBC-Verwaltung'),
    deleteConnection: async () => nativeOnly('Die JDBC-Verwaltung'),
    testConnection: async () => nativeOnly('JDBC-Verbindungen'),
    listSchemas: async () => nativeOnly('Der Schemaimport'),
    inspectSchema: async () => nativeOnly('Der Schemaimport'),
    listSnapshots: async () => [],
    createSnapshot: async () => nativeOnly('Datenbank-Snapshots'),
    renameSnapshot: async () => nativeOnly('Datenbank-Snapshots'),
    deleteSnapshot: async () => nativeOnly('Datenbank-Snapshots'),
    loadSnapshot: async () => nativeOnly('Datenbank-Snapshots'),
    importDriver: async () => nativeOnly('Der JDBC-Treiberimport'),
    onMenuCommand: () => () => undefined
  }

  Object.defineProperty(window, 'eridion', { value: api, configurable: false, writable: false })
}
