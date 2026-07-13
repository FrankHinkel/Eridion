import { computed, ref } from 'vue'
import { newDocument, parseDocument, type EridionDocument } from './model'

const document = ref<EridionDocument>(newDocument())
const filePath = ref<string>()
const dirty = ref(false)
const selectedNodeId = ref<string>()
const selectedEdgeId = ref<string>()
const undoStack: EridionDocument[] = []
const redoStack: EridionDocument[] = []
let checkpoint: EridionDocument = cloneDocument(document.value as unknown as EridionDocument)
let savedContent = contentKey(checkpoint)

const HISTORY_LIMIT = 100

function contentKey(value: EridionDocument): string {
  return JSON.stringify({ ...value, modifiedAt: '' })
}

function cloneDocument(value: EridionDocument): EridionDocument {
  return JSON.parse(JSON.stringify(value)) as EridionDocument
}

function resetHistory() {
  undoStack.length = 0
  redoStack.length = 0
  checkpoint = cloneDocument(document.value as unknown as EridionDocument)
  savedContent = contentKey(checkpoint)
}

export function useDocumentState() {
  function replace(value: EridionDocument, path?: string) {
    document.value = parseDocument(value)
    filePath.value = path
    dirty.value = false
    selectedNodeId.value = undefined
    selectedEdgeId.value = undefined
    resetHistory()
  }

  function reset() {
    replace(newDocument())
  }

  function changed() {
    const current = document.value as unknown as EridionDocument
    if (contentKey(current) === contentKey(checkpoint)) return
    undoStack.push(cloneDocument(checkpoint))
    if (undoStack.length > HISTORY_LIMIT) undoStack.splice(0, undoStack.length - HISTORY_LIMIT)
    redoStack.length = 0
    document.value.modifiedAt = new Date().toISOString()
    checkpoint = cloneDocument(document.value as unknown as EridionDocument)
    dirty.value = contentKey(checkpoint) !== savedContent
  }

  function undo(): boolean {
    const previous = undoStack.pop()
    if (!previous) return false
    redoStack.push(cloneDocument(document.value as unknown as EridionDocument))
    document.value = parseDocument(previous)
    checkpoint = cloneDocument(document.value as unknown as EridionDocument)
    dirty.value = contentKey(checkpoint) !== savedContent
    selectedNodeId.value = undefined
    selectedEdgeId.value = undefined
    return true
  }

  function redo(): boolean {
    const next = redoStack.pop()
    if (!next) return false
    undoStack.push(cloneDocument(document.value as unknown as EridionDocument))
    document.value = parseDocument(next)
    checkpoint = cloneDocument(document.value as unknown as EridionDocument)
    dirty.value = contentKey(checkpoint) !== savedContent
    selectedNodeId.value = undefined
    selectedEdgeId.value = undefined
    return true
  }

  function saved() {
    checkpoint = cloneDocument(document.value as unknown as EridionDocument)
    savedContent = contentKey(checkpoint)
    dirty.value = false
  }

  return {
    document,
    filePath,
    dirty,
    selectedNodeId,
    selectedEdgeId,
    displayName: computed(() => filePath.value?.split(/[\\/]/).pop() ?? document.value.title),
    replace,
    reset,
    changed,
    undo,
    redo,
    saved
  }
}
