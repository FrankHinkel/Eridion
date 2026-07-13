<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw, Search, Settings2, Table2, View } from 'lucide-vue-next'
import type { SnapshotInfo, StoredConnection } from '../../electron/types'
import type { SchemaSnapshot, SchemaTable } from '../model'
import { relatedSchemaTableKeys, schemaTableIdentityKey, schemaTablePlacement, type SchemaTableIdentity } from '../database-object-filter'
import { preferredDatabaseSchema, preferredDatabaseSource } from '../database-palette-preferences'

const props = withDefaults(defineProps<{
  refreshKey: number
  selectedTable?: SchemaTableIdentity
  currentPageTables?: SchemaTableIdentity[]
  otherPageTables?: SchemaTableIdentity[]
}>(), { currentPageTables: () => [], otherPageTables: () => [] })
const emit = defineEmits<{
  manage: []
  snapshot: [snapshot: SchemaSnapshot, connectionId: string]
}>()

const connections = ref<StoredConnection[]>([])
const snapshots = ref<SnapshotInfo[]>([])
const connectionId = ref('')
const schemas = ref<string[]>([])
const schema = ref('')
const snapshot = ref<SchemaSnapshot>()
const search = ref('')
const loading = ref(false)
const message = ref('')
const isOffline = computed(() => connectionId.value.startsWith('snapshot:'))
const relatedTableKeys = computed(() => snapshot.value ? relatedSchemaTableKeys(snapshot.value, props.selectedTable) : undefined)
const SOURCE_STORAGE_KEY = 'eridion.databasePalette.source'
const SCHEMA_STORAGE_KEY = 'eridion.databasePalette.schemas'

function storedSource(): string | undefined {
  try { return window.localStorage.getItem(SOURCE_STORAGE_KEY) ?? undefined } catch { return undefined }
}

function storedSchemas(): Record<string, string> {
  try { return JSON.parse(window.localStorage.getItem(SCHEMA_STORAGE_KEY) ?? '{}') as Record<string, string> } catch { return {} }
}

function storeSource() {
  try { window.localStorage.setItem(SOURCE_STORAGE_KEY, connectionId.value) } catch { /* Browser storage may be disabled. */ }
}

function storeSchema() {
  if (!connectionId.value) return
  try {
    window.localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify({ ...storedSchemas(), [connectionId.value]: schema.value }))
  } catch { /* Browser storage may be disabled. */ }
}

const filteredTables = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  const tables = (snapshot.value?.tables ?? []).filter((table) =>
    (!schema.value || table.schema === schema.value)
    && (!relatedTableKeys.value || relatedTableKeys.value.has(schemaTableIdentityKey(table)))
  )
  if (!query) return tables
  return tables.filter((table) =>
    `${table.schema ?? ''}.${table.name} ${table.type}`.toLocaleLowerCase().includes(query)
  )
})

async function refreshConnections() {
  const previous = connectionId.value
  connections.value = await window.eridion.listConnections()
  snapshots.value = await window.eridion.listSnapshots()
  const availableIds = [
    ...connections.value.map((connection) => connection.id),
    ...snapshots.value.map((item) => `snapshot:${item.id}`)
  ]
  connectionId.value = preferredDatabaseSource(availableIds, previous, storedSource())
  storeSource()
  if (connectionId.value) await connectionChanged()
  else {
    schemas.value = []
    snapshot.value = undefined
    message.value = 'Zuerst eine JDBC-Connection anlegen.'
  }
}

async function connectionChanged() {
  storeSource()
  schemas.value = []
  schema.value = ''
  snapshot.value = undefined
  search.value = ''
  if (!connectionId.value) return
  loading.value = true
  message.value = 'Schemas werden geladen …'
  try {
    if (isOffline.value) {
      const value = await window.eridion.loadSnapshot(connectionId.value.slice('snapshot:'.length)) as SchemaSnapshot
      snapshot.value = value
      schemas.value = [...new Set(value.tables.map((table) => table.schema).filter((item): item is string => Boolean(item)))].sort()
      schema.value = preferredDatabaseSchema(schemas.value, storedSchemas()[connectionId.value])
      emit('snapshot', value, connectionId.value)
      message.value = `${value.tables.length} Objekte aus dem Offline-Snapshot.`
      return
    }
    schemas.value = await window.eridion.listSchemas(connectionId.value)
    schema.value = preferredDatabaseSchema(schemas.value, storedSchemas()[connectionId.value], schemas.value[0] ?? '')
    await loadObjects()
  } catch (error) {
    message.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

async function schemaChanged() {
  storeSchema()
  await loadObjects()
}

async function loadObjects() {
  if (!connectionId.value) return
  if (isOffline.value) {
    message.value = `${filteredTables.value.length} Objekte im Offline-Snapshot.`
    return
  }
  loading.value = true
  message.value = 'Tabellen und Views werden gelesen …'
  try {
    const value = await window.eridion.inspectSchema({
      connectionId: connectionId.value,
      schema: schema.value || undefined,
      tableTypes: ['TABLE', 'VIEW', 'MATERIALIZED VIEW']
    }) as SchemaSnapshot
    snapshot.value = value
    emit('snapshot', value, connectionId.value)
    message.value = `${value.tables.length} Objekte gefunden.`
  } catch (error) {
    snapshot.value = undefined
    message.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

function dragTable(event: DragEvent, table: SchemaTable) {
  if (!snapshot.value || !event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/eridion-schema-table', JSON.stringify({
    schema: table.schema ?? '',
    name: table.name
  }))
}

function placement(table: SchemaTable) {
  return schemaTablePlacement(table, props.currentPageTables, props.otherPageTables)
}

watch(() => props.refreshKey, refreshConnections)
onMounted(refreshConnections)
</script>

<template>
  <section class="database-palette">
    <label><span>Verbindung / Snapshot</span><select v-model="connectionId" @change="connectionChanged"><option value="">Quelle wählen …</option><optgroup label="Live-Verbindungen"><option v-for="connection in connections" :key="connection.id" :value="connection.id">{{ connection.name }}</option></optgroup><optgroup v-if="snapshots.length" label="Offline-Snapshots"><option v-for="item in snapshots" :key="item.id" :value="`snapshot:${item.id}`">{{ item.name }} · {{ new Date(item.createdAt).toLocaleDateString('de-DE') }}</option></optgroup></select></label>
    <button class="palette-manage" @click="emit('manage')"><Settings2 :size="13" /> Connections verwalten</button>
    <label><span>Schema</span><select v-model="schema" :disabled="!connectionId || loading" @change="schemaChanged"><option value="">Standard / alle</option><option v-for="item in schemas" :key="item" :value="item">{{ item }}</option></select></label>
    <label><span>Suchen</span><div class="palette-search"><Search :size="13" /><input v-model="search" :disabled="!snapshot" placeholder="Tabelle oder View …" /></div></label>
    <div class="database-list-title"><span>{{ selectedTable ? `Verknüpft mit ${selectedTable.name}` : 'Auf das Blatt ziehen' }}</span><button v-if="!isOffline" title="Objektliste aktualisieren" :disabled="!connectionId || loading" @click="loadObjects"><RefreshCw :size="13" :class="{ spinning: loading }" /></button></div>
    <div class="database-object-list">
      <button
        v-for="table in filteredTables"
        :key="`${table.schema ?? ''}.${table.name}`"
        :class="`table-placement-${placement(table)}`"
        draggable="true"
        :title="`${table.name} auf die aktive Seite ziehen`"
        @dragstart="dragTable($event, table)"
      >
        <View v-if="table.type.toUpperCase().includes('VIEW')" :size="14" />
        <Table2 v-else :size="14" />
        <span><strong>{{ table.name }}</strong><small>{{ table.schema || table.type }} · {{ table.columns.length }} Spalten</small></span>
      </button>
      <p v-if="!loading && snapshot && !filteredTables.length" class="palette-empty">{{ selectedTable ? 'Keine verknüpften Objekte gefunden.' : 'Keine passenden Objekte.' }}</p>
    </div>
    <p class="database-message">{{ message }}</p>
  </section>
</template>
