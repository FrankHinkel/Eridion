import { contextBridge, ipcRenderer } from 'electron'
import type { EridionDesktopApi } from './types'

const api: EridionDesktopApi = {
  runtime: 'electron',
  openDiagram: (path) => ipcRenderer.invoke('file:open', path),
  saveDiagram: (input) => ipcRenderer.invoke('file:save', input),
  exportPdf: (input) => ipcRenderer.invoke('file:export-pdf', input),
  listConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (connection) => ipcRenderer.invoke('connections:save', connection),
  deleteConnection: (id) => ipcRenderer.invoke('connections:delete', id),
  testConnection: (id) => ipcRenderer.invoke('connections:test', id),
  listSchemas: (id) => ipcRenderer.invoke('schema:list', id),
  inspectSchema: (input) => ipcRenderer.invoke('schema:inspect', input),
  listSnapshots: (connectionId) => ipcRenderer.invoke('snapshots:list', connectionId),
  createSnapshot: (input) => ipcRenderer.invoke('snapshots:create', input),
  renameSnapshot: (id, name) => ipcRenderer.invoke('snapshots:rename', id, name),
  deleteSnapshot: (id) => ipcRenderer.invoke('snapshots:delete', id),
  loadSnapshot: (id) => ipcRenderer.invoke('snapshots:load', id),
  importDriver: () => ipcRenderer.invoke('driver:import'),
  onMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: string) => listener(command)
    ipcRenderer.on('menu:command', handler)
    return () => ipcRenderer.removeListener('menu:command', handler)
  }
}

contextBridge.exposeInMainWorld('eridion', api)
