import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { WorkerClient } from './worker-client'
import { ConnectionStore } from './connection-store'
import { sameFilePath } from './pdf-export-protection'
import type { PdfTooltip, SnapshotInfo, StoredConnection } from './types'

let mainWindow: BrowserWindow | undefined
let worker: WorkerClient
let connectionStore: ConnectionStore
let pendingOpenPath: string | undefined

type SnapshotRecord = SnapshotInfo & { path: string }

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Electron uses its own executable name during development unless the app name
// is set explicitly. Keep the macOS application menu identical in dev builds
// and packaged Eridion builds.
app.setName('Eridion')

function workerJarPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'worker', 'eridion-worker.jar')
    : resolve(app.getAppPath(), '../../worker/build/libs/eridion-worker-all.jar')
}

function javaExecutablePath(): string {
  if (!app.isPackaged) return 'java'
  return join(process.resourcesPath, 'runtime', 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1040,
    minHeight: 700,
    title: 'Eridion',
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (isDev) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!)
  else mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) mainWindow?.webContents.send('menu:command', `open:${pendingOpenPath}`)
    pendingOpenPath = undefined
  })
}

function sendCommand(command: string): void {
  mainWindow?.webContents.send('menu:command', command)
}

function sendEditCommand(command: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'select-all'): void {
  const contents = mainWindow?.webContents
  if (!contents) return
  void contents.executeJavaScript(`['INPUT','TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable === true`)
    .then((editable) => {
      if (!editable) return sendCommand(command)
      if (command === 'undo') contents.undo()
      else if (command === 'redo') contents.redo()
      else if (command === 'cut') contents.cut()
      else if (command === 'copy') contents.copy()
      else if (command === 'paste') contents.paste()
      else contents.selectAll()
    })
}

function installMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Datei',
      submenu: [
        { label: 'Neu', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new') },
        { label: 'Öffnen…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
        { type: 'separator' },
        { label: 'Speichern', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        { label: 'Speichern unter…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('save-as') },
        { label: 'Saubere PDF exportieren…', click: () => sendCommand('export') },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' }
      ]
    },
    { label: 'Bearbeiten', submenu: [
      { label: 'Rückgängig', accelerator: 'CmdOrCtrl+Z', click: () => sendEditCommand('undo') },
      { label: 'Wiederholen', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendEditCommand('redo') },
      { type: 'separator' },
      { label: 'Ausschneiden', accelerator: 'CmdOrCtrl+X', click: () => sendEditCommand('cut') },
      { label: 'Kopieren', accelerator: 'CmdOrCtrl+C', click: () => sendEditCommand('copy') },
      { label: 'Einfügen', accelerator: 'CmdOrCtrl+V', click: () => sendEditCommand('paste') },
      { label: 'Alles auswählen', accelerator: 'CmdOrCtrl+A', click: () => sendEditCommand('select-all') }
    ] },
    { label: 'Ansicht', submenu: [
      { label: 'Blatt herauszoomen', accelerator: 'CmdOrCtrl+-', click: () => sendCommand('page-zoom-out') },
      { label: 'Blatt hineinzoomen', accelerator: 'CmdOrCtrl+=', click: () => sendCommand('page-zoom-in') },
      { label: 'Ganze Seite / vorige Ansicht', accelerator: 'Esc', click: () => sendCommand('page-fit') },
      { type: 'separator' },
      ...(isDev ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }, { type: 'separator' as const }] : []),
      { role: 'togglefullscreen' }
    ] },
    { label: 'Datenbank', submenu: [
      { label: 'Connections verwalten…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('database') }
    ] },
    { label: 'Fenster', submenu: [{ role: 'minimize' }, { role: 'zoom' }] }
  ]
  if (process.platform === 'darwin') template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function renderPdf(printHtml: string): Promise<Buffer> {
  const temporary = join(tmpdir(), `eridion-print-${randomUUID()}.html`)
  await fs.writeFile(temporary, printHtml, 'utf8')
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await window.loadURL(pathToFileURL(temporary).toString())
    await window.webContents.executeJavaScript('document.fonts.ready')
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
  } finally {
    window.destroy()
    await fs.rm(temporary, { force: true })
  }
}

async function choosePdfPath(defaultPath: string): Promise<string | undefined> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  return result.canceled ? undefined : result.filePath
}

async function replaceFile(source: string, target: string): Promise<void> {
  const backup = `${target}.${randomUUID()}.backup`
  let hadTarget = false
  try {
    await fs.rename(target, backup)
    hadTarget = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    await fs.rename(source, target)
    if (hadTarget) await fs.rm(backup, { force: true })
  } catch (error) {
    if (hadTarget) await fs.rename(backup, target).catch(() => undefined)
    throw error
  }
}

async function openDiagram(filePath?: string) {
  if (!filePath) {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'Eridion PDF', extensions: ['pdf'] }]
    })
    if (result.canceled) return { canceled: true }
    filePath = result.filePaths[0]
  }
  const payload = await worker.call<{ documentJson: string }>('pdf.extract', { path: filePath })
  return { path: filePath, data: JSON.parse(payload.documentJson) }
}

async function saveDiagram(input: { path?: string; documentJson: string; printHtml: string; tooltips?: PdfTooltip[] }) {
  const filePath = input.path ?? await choosePdfPath('diagram.pdf')
  if (!filePath) return { canceled: true }
  const basePdf = join(tmpdir(), `eridion-base-${randomUUID()}.pdf`)
  const output = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(basePdf, await renderPdf(input.printHtml))
    await worker.call('pdf.embed', { inputPath: basePdf, outputPath: output, documentJson: input.documentJson, tooltips: input.tooltips ?? [] }, 120_000)
    await replaceFile(output, filePath)
    return { path: filePath }
  } finally {
    await fs.rm(basePdf, { force: true })
    await fs.rm(output, { force: true })
  }
}

const protectedExportMessage = 'Eine bearbeitbare Eridion-PDF darf nicht durch einen normalen PDF-Export überschrieben werden. Bitte wähle einen anderen Dateinamen.'

async function containsEridionDocument(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    await worker.call('pdf.extract', { path: filePath }, 15_000)
    return true
  } catch {
    return false
  }
}

async function rejectProtectedExport(filePath: string, protectedPath?: string): Promise<boolean> {
  if (!await sameFilePath(filePath, protectedPath) && !await containsEridionDocument(filePath)) return false
  await dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    title: 'Eridion-PDF geschützt',
    message: 'Exportziel ist eine bearbeitbare Eridion-PDF',
    detail: protectedExportMessage,
    buttons: ['OK']
  })
  return true
}

async function exportPdf(input: { path?: string; protectedPath?: string; printHtml: string; tooltips?: PdfTooltip[] }) {
  const filePath = input.path ?? await choosePdfPath('diagram-export.pdf')
  if (!filePath) return { canceled: true }
  if (await rejectProtectedExport(filePath, input.protectedPath)) return { canceled: true, error: protectedExportMessage }
  const basePdf = join(tmpdir(), `eridion-export-${randomUUID()}.pdf`)
  const output = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(basePdf, await renderPdf(input.printHtml))
    await worker.call('pdf.annotate', { inputPath: basePdf, outputPath: output, tooltips: input.tooltips ?? [] }, 120_000)
    await replaceFile(output, filePath)
  } finally {
    await fs.rm(basePdf, { force: true })
    await fs.rm(output, { force: true })
  }
  return { path: filePath }
}

function snapshotsDirectory(): string {
  return join(app.getPath('userData'), 'snapshots')
}

async function snapshotRecords(connectionId?: string): Promise<SnapshotRecord[]> {
  const directory = snapshotsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sqlite'))
  const records = await Promise.all(files.map(async (name) => {
    const path = join(directory, name)
    try {
      const metadata = await worker.call<SnapshotInfo>('snapshot.meta', { path })
      return { ...metadata, path }
    } catch { return undefined }
  }))
  return records.filter((record): record is SnapshotRecord => Boolean(record) && (!connectionId || record!.connectionId === connectionId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function requireSnapshot(id: string): Promise<SnapshotRecord> {
  const record = (await snapshotRecords()).find((item) => item.id === id)
  if (!record) throw new Error('Der Snapshot wurde nicht gefunden.')
  return record
}

function registerIpc(): void {
  ipcMain.handle('file:open', (_event, path?: string) => openDiagram(path))
  ipcMain.handle('file:save', (_event, input) => saveDiagram(input))
  ipcMain.handle('file:export-pdf', (_event, input) => exportPdf(input))
  ipcMain.handle('connections:list', () => connectionStore.list())
  ipcMain.handle('connections:save', (_event, connection: StoredConnection) => connectionStore.save(connection))
  ipcMain.handle('connections:delete', (_event, id: string) => connectionStore.delete(id))
  ipcMain.handle('connections:test', async (_event, id: string) => {
    const connection = await connectionStore.resolved(id)
    return worker.call('connection.test', { connection })
  })
  ipcMain.handle('schema:list', async (_event, id: string) => {
    const connection = await connectionStore.resolved(id)
    return worker.call('schema.list', { connection, sql: connection.schemaSql ?? '' })
  })
  ipcMain.handle('schema:inspect', async (_event, input: { connectionId: string; catalog?: string; schema?: string; tableTypes: string[] }) => {
    const connection = await connectionStore.resolved(input.connectionId)
    return worker.call('schema.inspect', {
      connection,
      catalog: input.catalog,
      schema: input.schema,
      tableTypes: input.tableTypes,
      objectSql: connection.objectSql,
      timeoutSeconds: 30
    }, 180_000)
  })
  ipcMain.handle('snapshots:list', async (_event, connectionId?: string) => (await snapshotRecords(connectionId)).map(({ path: _path, ...metadata }) => metadata))
  ipcMain.handle('snapshots:create', async (_event, input: { connectionId: string; name: string }) => {
    const connection = await connectionStore.resolved(input.connectionId)
    const snapshot = await worker.call<unknown>('schema.inspect', {
      connection, tableTypes: ['TABLE', 'VIEW', 'MATERIALIZED VIEW'], objectSql: connection.objectSql, timeoutSeconds: 30
    }, 180_000)
    const { contentHash } = await worker.call<{ contentHash: string }>('snapshot.hash', { snapshot })
    const existing = (await snapshotRecords(input.connectionId)).find((item) => item.contentHash === contentHash)
    if (existing) {
      const { path: _path, ...metadata } = existing
      return { created: false, snapshot: metadata }
    }
    const id = randomUUID()
    const path = join(snapshotsDirectory(), `${id}.sqlite`)
    const metadata = await worker.call<SnapshotInfo>('snapshot.write', {
      path, id, name: input.name, connectionId: input.connectionId, connectionName: connection.name, snapshot
    }, 180_000)
    return { created: true, snapshot: metadata }
  })
  ipcMain.handle('snapshots:rename', async (_event, id: string, name: string) => {
    const record = await requireSnapshot(id)
    return worker.call<SnapshotInfo>('snapshot.rename', { path: record.path, name })
  })
  ipcMain.handle('snapshots:delete', async (_event, id: string) => {
    const record = await requireSnapshot(id)
    await fs.rm(record.path, { force: true })
  })
  ipcMain.handle('snapshots:load', async (_event, id: string) => {
    const record = await requireSnapshot(id)
    const stored = await worker.call<{ snapshot: unknown }>('snapshot.read', { path: record.path })
    return stored.snapshot
  })
  ipcMain.handle('driver:import', async () => {
    const selected = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'JDBC-Treiber', extensions: ['jar'] }]
    })
    if (selected.canceled) return { canceled: true }
    const source = selected.filePaths[0]
    const directory = join(app.getPath('userData'), 'drivers')
    await fs.mkdir(directory, { recursive: true })
    const safeName = basename(source).replace(/[^a-zA-Z0-9._-]/g, '_')
    const destination = join(directory, `${Date.now()}-${safeName}`)
    await fs.copyFile(source, destination)
    return { path: destination, data: { path: destination } }
  })
}

const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else {
  app.on('second-instance', (_event, argv) => {
    const path = argv.find((argument) => extname(argument).toLowerCase() === '.pdf')
    if (path) sendCommand(`open:${path}`)
    mainWindow?.show()
    mainWindow?.focus()
  })
  app.on('open-file', (event, path) => {
    event.preventDefault()
    if (mainWindow) sendCommand(`open:${path}`)
    else pendingOpenPath = path
  })
  app.whenReady().then(() => {
    worker = new WorkerClient(workerJarPath(), javaExecutablePath())
    connectionStore = new ConnectionStore(join(app.getPath('userData'), 'connections.json'), {
      encrypt(value) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Der Betriebssystem-Schlüsselspeicher ist nicht verfügbar.')
        return safeStorage.encryptString(value).toString('base64')
      },
      decrypt(value) {
        return safeStorage.decryptString(Buffer.from(value, 'base64'))
      }
    })
    registerIpc()
    installMenu()
    const path = process.argv.find((argument) => extname(argument).toLowerCase() === '.pdf')
    if (path && app.isPackaged) pendingOpenPath = path
    createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => worker?.stop())
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}
