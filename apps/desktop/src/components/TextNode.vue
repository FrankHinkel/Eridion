<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position, useVueFlow, type NodeProps } from '@vue-flow/core'
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, Code2, Heading1, Heading2, Italic, Link2, List, ListOrdered } from 'lucide-vue-next'
import { useDocumentState } from '../document-state'
import { escapeHtml, renderMarkdown } from '../markdown'
import { htmlToMarkdown } from '../markdown-editor'
import { storedNodeId, textSize, type EridionDocument, type TextNodeData } from '../model'
import { resolveTextPlaceholders } from '../text-placeholders'

const props = defineProps<NodeProps<TextNodeData>>()
const state = useDocumentState()
const document = state.document as unknown as { value: EridionDocument }
const { screenToFlowCoordinate, updateNode } = useVueFlow()
const resizing = ref(false)
const editing = ref(false)
const root = ref<HTMLElement>()
const editor = ref<HTMLElement>()

const width = computed(() => props.data.width ?? textSize(props.data).width / props.data.scale)
const height = computed(() => props.data.height ?? textSize(props.data).height / props.data.scale)
const resolvedText = computed(() => {
  const node = document.value.nodes.find((candidate) => candidate.id === storedNodeId(props.id))
  const pageIndex = Math.max(0, document.value.pages.findIndex((page) => page.id === node?.pageId))
  const page = document.value.pages[pageIndex] ?? document.value.pages[0]
  return page
    ? resolveTextPlaceholders(props.data.text, {
        document: document.value, page, pageIndex, date: document.value.modifiedAt
      })
    : props.data.text
})
const content = computed(() => props.data.markdown === false
  ? escapeHtml(resolvedText.value).replace(/\n/g, '<br>')
  : renderMarkdown(resolvedText.value))

let cleanupResize: (() => void) | undefined
let cleanupOutsideEdit: (() => void) | undefined
let draftMarkdown = ''
let draftUsesMarkdown = true

function initialEditorHtml(): string {
  return props.data.markdown === false
    ? escapeHtml(props.data.text).replace(/\n/g, '<br>')
    : renderMarkdown(props.data.text)
}

function captureEditorDraft() {
  if (editor.value) draftMarkdown = htmlToMarkdown(editor.value)
}

function finishEdit() {
  if (!editing.value) return
  captureEditorDraft()
  editing.value = false
  props.data.text = draftMarkdown
  props.data.markdown = draftUsesMarkdown
  cleanupOutsideEdit?.()
  cleanupOutsideEdit = undefined
  state.changed()
}

function beginEdit() {
  if (editing.value) return
  draftMarkdown = props.data.text
  draftUsesMarkdown = props.data.markdown !== false
  editing.value = true
  nextTick(() => {
    if (!editor.value) return
    editor.value.innerHTML = initialEditorHtml()
    editor.value.focus()
    const outside = (event: PointerEvent) => {
      if (!root.value?.contains(event.target as globalThis.Node)) finishEdit()
    }
    globalThis.document.addEventListener('pointerdown', outside, true)
    cleanupOutsideEdit = () => globalThis.document.removeEventListener('pointerdown', outside, true)
  })
}

function applyCommand(command: string, value?: string) {
  if (!editor.value) return
  draftUsesMarkdown = true
  editor.value.focus()
  globalThis.document.execCommand(command, false, value)
  captureEditorDraft()
}

function insertLink() {
  const selection = globalThis.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined
  const url = globalThis.prompt('Link-Ziel (https://… oder mailto:…):', 'https://')?.trim()
  if (!url || !/^(https?:\/\/|mailto:)/i.test(url)) return
  if (range && selection) {
    selection.removeAllRanges()
    selection.addRange(range)
  }
  applyCommand('createLink', url)
}

function setAlignment(alignment: 'left' | 'center' | 'right') {
  props.data.textAlign = alignment
}

function onEditorKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
    event.preventDefault()
    event.stopPropagation()
    finishEdit()
  }
}

function beginResize(event: PointerEvent, horizontal: -1 | 1, vertical: -1 | 1) {
  const id = storedNodeId(props.id)
  const node = document.value.nodes.find((candidate) => candidate.id === id)
  if (!node || node.draggable === false || node.data.kind !== 'text') return
  const data = node.data
  event.preventDefault()
  event.stopPropagation()
  const start = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const original = {
    position: { ...node.position }, width: width.value, height: height.value,
    scale: Math.max(0.01, data.scale)
  }
  resizing.value = true

  const move = (pointer: PointerEvent) => {
    const current = screenToFlowCoordinate({ x: pointer.clientX, y: pointer.clientY })
    const deltaX = (current.x - start.x) / original.scale
    const deltaY = (current.y - start.y) / original.scale
    const nextWidth = Math.max(60, original.width + horizontal * deltaX)
    const nextHeight = Math.max(30, original.height + vertical * deltaY)
    data.width = Math.round(nextWidth)
    data.height = Math.round(nextHeight)
    node.position = {
      x: horizontal < 0 ? original.position.x + (original.width - nextWidth) * original.scale : original.position.x,
      y: vertical < 0 ? original.position.y + (original.height - nextHeight) * original.scale : original.position.y
    }
    updateNode(id, { position: { ...node.position } })
  }
  const finish = () => {
    cleanupResize?.()
    cleanupResize = undefined
    resizing.value = false
    state.changed()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
  cleanupResize = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
  }
}

watch(() => props.selected, (selected) => { if (!selected) finishEdit() })
onMounted(() => globalThis.window.addEventListener('eridion:commit-editors', finishEdit))
onBeforeUnmount(() => {
  cleanupResize?.()
  cleanupOutsideEdit?.()
  globalThis.window.removeEventListener('eridion:commit-editors', finishEdit)
  if (editing.value) {
    captureEditorDraft()
    props.data.text = draftMarkdown
    props.data.markdown = draftUsesMarkdown
  }
})
</script>

<template>
  <div
    ref="root"
    :class="['text-node', { resizing, editing }]"
    :style="{
      '--node-scale': data.scale,
      '--font-size': `${data.fontSize}px`,
      '--text-width': `${width}px`,
      '--text-height': `${height}px`,
      color: data.color || '#334155',
      backgroundColor: data.backgroundColor || '#ffffff',
      textAlign: data.textAlign || 'left'
    }"
  >
    <Handle class="connection-handle" type="target" :position="Position.Left" />
    <div v-if="editing" class="text-editor-shell nodrag nopan nowheel" :style="{ backgroundColor: data.backgroundColor || '#ffffff' }" @pointerdown.stop @dblclick.stop>
      <div class="text-edit-toolbar" role="toolbar" aria-label="Markdown formatieren">
        <button title="Fett" @pointerdown.stop.prevent @click.stop="applyCommand('bold')"><Bold :size="14" /></button>
        <button title="Kursiv" @pointerdown.stop.prevent @click.stop="applyCommand('italic')"><Italic :size="14" /></button>
        <button title="Überschrift 1" @pointerdown.stop.prevent @click.stop="applyCommand('formatBlock', 'h1')"><Heading1 :size="14" /></button>
        <button title="Überschrift 2" @pointerdown.stop.prevent @click.stop="applyCommand('formatBlock', 'h2')"><Heading2 :size="14" /></button>
        <button title="Codeblock" @pointerdown.stop.prevent @click.stop="applyCommand('formatBlock', 'pre')"><Code2 :size="14" /></button>
        <button title="Aufzählung" @pointerdown.stop.prevent @click.stop="applyCommand('insertUnorderedList')"><List :size="14" /></button>
        <button title="Nummerierte Liste" @pointerdown.stop.prevent @click.stop="applyCommand('insertOrderedList')"><ListOrdered :size="14" /></button>
        <button title="Link" @pointerdown.stop.prevent @click.stop="insertLink"><Link2 :size="14" /></button>
        <span class="text-toolbar-separator" />
        <button :class="{ active: (data.textAlign || 'left') === 'left' }" title="Linksbündig" @pointerdown.stop.prevent @click.stop="setAlignment('left')"><AlignLeft :size="14" /></button>
        <button :class="{ active: data.textAlign === 'center' }" title="Zentriert" @pointerdown.stop.prevent @click.stop="setAlignment('center')"><AlignCenter :size="14" /></button>
        <button :class="{ active: data.textAlign === 'right' }" title="Rechtsbündig" @pointerdown.stop.prevent @click.stop="setAlignment('right')"><AlignRight :size="14" /></button>
        <span class="text-toolbar-spacer" />
        <button class="finish" title="Bearbeitung beenden (Esc oder Ctrl/Cmd+Enter)" @pointerdown.stop.prevent @click.stop="finishEdit"><Check :size="15" /></button>
      </div>
      <div
        ref="editor" class="markdown-content text-inline-editor nodrag nopan nowheel" contenteditable="true" spellcheck="true"
        @input.stop="captureEditorDraft" @keydown.stop="onEditorKeydown" @keyup.stop
      />
    </div>
    <div v-else class="markdown-content" title="Doppelklick zum Bearbeiten" v-html="content" @dblclick.stop.prevent="beginEdit" />
    <Handle class="connection-handle" type="source" :position="Position.Right" />
    <template v-if="selected && !editing">
      <button class="text-resize-handle nodrag top-left" aria-label="Oben links skalieren" @pointerdown="beginResize($event, -1, -1)" />
      <button class="text-resize-handle nodrag top-right" aria-label="Oben rechts skalieren" @pointerdown="beginResize($event, 1, -1)" />
      <button class="text-resize-handle nodrag bottom-left" aria-label="Unten links skalieren" @pointerdown="beginResize($event, -1, 1)" />
      <button class="text-resize-handle nodrag bottom-right" aria-label="Unten rechts skalieren" @pointerdown="beginResize($event, 1, 1)" />
    </template>
  </div>
</template>
