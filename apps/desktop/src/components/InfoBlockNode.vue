<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useVueFlow, type NodeProps } from '@vue-flow/core'
import { useDocumentState } from '../document-state'
import { infoBlockSize, markInfoBlockLastRow, positionInfoBlockFromAnchor, renderedNodePageId, storedNodeId, type EridionDocument, type InfoBlockNodeData } from '../model'

const props = defineProps<NodeProps<InfoBlockNodeData>>()
const state = useDocumentState()
const document = state.document as unknown as { value: EridionDocument }
const { updateNodeInternals } = useVueFlow()
const size = computed(() => infoBlockSize(props.data, document.value))

const pageId = computed(() => renderedNodePageId(document.value, props.id))
const pageIndex = computed(() => Math.max(0, document.value.pages.findIndex((page) => page.id === pageId.value)))
const page = computed(() => document.value.pages[pageIndex.value] ?? document.value.pages[0])
const savedAt = computed(() => {
  const value = new Date(document.value.modifiedAt)
  return Number.isNaN(value.getTime()) ? '–' : new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(value)
})
const fields = computed(() => markInfoBlockLastRow([
  props.data.showDocumentName ? { label: 'Dokument', value: document.value.title, wide: true, end: true, multiline: false } : undefined,
  props.data.showPageName ? { label: 'Blatt', value: page.value.name, wide: false, end: false, multiline: false } : undefined,
  props.data.showPageNumber ? { label: 'Seite', value: `${pageIndex.value + 1} / ${document.value.pages.length}`, wide: false, end: false, multiline: false } : undefined,
  props.data.showSavedAt ? { label: 'Stand', value: savedAt.value, wide: false, end: true, multiline: false } : undefined,
  props.data.showInfo && props.data.infoText.trim() ? { label: 'Info', value: props.data.infoText, wide: true, end: true, multiline: true } : undefined,
  props.data.showAuthor ? { label: 'Bearbeiter', value: props.data.author || '–', wide: false, end: true, multiline: false } : undefined,
  props.data.showDocumentId ? { label: 'Dokument-ID', value: document.value.documentId, wide: true, end: true, multiline: false } : undefined
].filter((field): field is { label: string; value: string; wide: boolean; end: boolean; multiline: boolean } => Boolean(field))))

watch(size, () => {
  const source = document.value.nodes.find((node) => node.id === storedNodeId(props.id))
  if (source?.data.kind === 'infoBlock') positionInfoBlockFromAnchor(document.value, source)
  nextTick(() => updateNodeInternals([props.id]))
}, { deep: true })
</script>

<template>
  <article class="info-block" :style="{ '--info-scale': data.scale, '--info-width': `${size.width}px`, '--info-min-height': `${size.height}px` }">
    <header><strong>{{ data.heading || 'ERIDION · ERD' }}</strong></header>
    <div class="info-block-grid">
      <div v-for="field in fields" :key="field.label" :class="['info-block-cell', { wide: field.wide, end: field.end, multiline: field.multiline, 'last-row': field.lastRow }]">
        <small>{{ field.label }}</small><b>{{ field.value }}</b>
      </div>
    </div>
  </article>
</template>
