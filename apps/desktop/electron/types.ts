export interface StoredConnection {
  id: string
  name: string
  driverId: string
  url: string
  user: string
  password?: string
  hasPassword?: boolean
  driverClass?: string
  driverJar?: string
  properties: Record<string, string>
  schemaSql?: string
  objectSql?: string
}

export interface FileResult<T = unknown> {
  canceled?: boolean
  error?: string
  path?: string
  data?: T
}

export interface SnapshotInfo {
  id: string
  name: string
  connectionId: string
  connectionName: string
  createdAt: string
  updatedAt: string
  contentHash: string
  databaseProduct: string
  databaseVersion: string
}

export interface SnapshotCreateResult {
  created: boolean
  snapshot: SnapshotInfo
}

export interface PdfTooltip {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  text: string
}

export interface EridionDesktopApi {
  runtime: 'electron' | 'browser'
  openDiagram(path?: string): Promise<FileResult>
  saveDiagram(input: { path?: string; documentJson: string; printHtml: string; tooltips?: PdfTooltip[] }): Promise<FileResult>
  exportPdf(input: { path?: string; protectedPath?: string; printHtml: string; tooltips?: PdfTooltip[] }): Promise<FileResult>
  listConnections(): Promise<StoredConnection[]>
  saveConnection(connection: StoredConnection): Promise<StoredConnection[]>
  deleteConnection(id: string): Promise<StoredConnection[]>
  testConnection(id: string): Promise<Record<string, string>>
  listSchemas(id: string): Promise<string[]>
  inspectSchema(input: { connectionId: string; catalog?: string; schema?: string; tableTypes: string[] }): Promise<unknown>
  listSnapshots(connectionId?: string): Promise<SnapshotInfo[]>
  createSnapshot(input: { connectionId: string; name: string }): Promise<SnapshotCreateResult>
  renameSnapshot(id: string, name: string): Promise<SnapshotInfo>
  deleteSnapshot(id: string): Promise<void>
  loadSnapshot(id: string): Promise<unknown>
  importDriver(): Promise<FileResult<{ path: string }>>
  onMenuCommand(listener: (command: string) => void): () => void
}
