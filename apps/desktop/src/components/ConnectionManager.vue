<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Camera, Database, Pencil, Plus, Trash2, Upload, X, PlugZap, Save } from 'lucide-vue-next'
import type { SnapshotInfo, StoredConnection } from '../../electron/types'
import { createConnectionPayload } from '../connection-payload'

const emit = defineEmits<{ close: [] }>()
const connections = ref<StoredConnection[]>([])
const selectedId = ref<string>()
const message = ref('')
const busy = ref(false)
const deleteArmed = ref(false)
const form = reactive<StoredConnection>(emptyConnection())
const propertiesText = ref('{}')
const snapshots = ref<SnapshotInfo[]>([])
const snapshotName = ref('')
const editingSnapshotId = ref<string>()
const editingSnapshotName = ref('')
const persisted = computed(() => connections.value.some((connection) => connection.id === form.id))

function emptyConnection(): StoredConnection {
  return {
    id: crypto.randomUUID(),
    name: 'Neue Connection',
    driverId: 'postgresql',
    url: 'jdbc:postgresql://localhost:5432/postgres',
    user: '',
    password: '',
    properties: {}
  }
}

async function select(connection: StoredConnection) {
  selectedId.value = connection.id
  Object.assign(form, {
    id: connection.id,
    name: connection.name,
    driverId: connection.driverId,
    url: connection.url,
    user: connection.user ?? '',
    password: '',
    hasPassword: Boolean(connection.hasPassword),
    driverClass: connection.driverClass,
    driverJar: connection.driverJar,
    properties: { ...(connection.properties ?? {}) },
    schemaSql: connection.schemaSql,
    objectSql: connection.objectSql
  })
  propertiesText.value = JSON.stringify(connection.properties ?? {}, null, 2)
  message.value = ''
  deleteArmed.value = false
  await refreshSnapshots()
}

function create() {
  const value = emptyConnection()
  selectedId.value = undefined
  Object.assign(form, value)
  propertiesText.value = '{}'
  message.value = ''
  deleteArmed.value = false
  snapshots.value = []
}

async function refreshSnapshots() {
  snapshots.value = persisted.value ? await window.eridion.listSnapshots(form.id) : []
}

async function createSnapshot() {
  busy.value = true
  message.value = 'Datenbankschema wird gelesen …'
  try {
    if (!persisted.value) await save()
    if (!persisted.value) return
    const result = await window.eridion.createSnapshot({ connectionId: form.id, name: snapshotName.value.trim() || form.name })
    await refreshSnapshots()
    snapshotName.value = ''
    message.value = result.created ? 'Snapshot als SQLite-Datei gespeichert.' : 'Keine Änderungen – es wurde kein neuer Snapshot angelegt.'
  } catch (error) {
    message.value = (error as Error).message
  } finally { busy.value = false }
}

function beginSnapshotRename(snapshot: SnapshotInfo) {
  editingSnapshotId.value = snapshot.id
  editingSnapshotName.value = snapshot.name
}

async function renameSnapshot(snapshot: SnapshotInfo) {
  try {
    await window.eridion.renameSnapshot(snapshot.id, editingSnapshotName.value)
    editingSnapshotId.value = undefined
    await refreshSnapshots()
    message.value = 'Snapshot umbenannt.'
  } catch (error) { message.value = (error as Error).message }
}

async function deleteSnapshot(snapshot: SnapshotInfo) {
  if (!confirm(`Snapshot „${snapshot.name}“ wirklich löschen?`)) return
  try {
    await window.eridion.deleteSnapshot(snapshot.id)
    await refreshSnapshots()
    message.value = 'Snapshot gelöscht.'
  } catch (error) { message.value = (error as Error).message }
}

function applyDriverTemplate() {
  if (form.driverId === 'postgresql') form.url = 'jdbc:postgresql://localhost:5432/postgres'
  else if (form.driverId === 'mariadb' || form.driverId === 'mysql') form.url = 'jdbc:mariadb://localhost:3306/database'
  else if (form.driverId === 'sqlite') form.url = 'jdbc:sqlite:/path/to/database.sqlite'
  else if (form.driverId === 'sqlserver') form.url = 'jdbc:sqlserver://localhost:1433;databaseName=master;encrypt=true;trustServerCertificate=true'
  else if (form.driverId === 'h2') form.url = 'jdbc:h2:file:~/eridion'
  else if (form.driverId === 'oracle') {
    form.url = 'jdbc:oracle:thin:@//localhost:1521/ORCLPDB1'
    form.driverClass ||= 'oracle.jdbc.OracleDriver'
  }
}

async function save() {
  busy.value = true
  message.value = ''
  try {
    const payload = createConnectionPayload(form, propertiesText.value)
    connections.value = await window.eridion.saveConnection(payload)
    const saved = connections.value.find((connection) => connection.id === payload.id)
    if (!saved) throw new Error('Die gespeicherte Connection konnte nicht erneut geladen werden.')
    await select(saved)
    message.value = 'Connection gespeichert.'
  } catch (error) {
    message.value = (error as Error).message
  } finally {
    busy.value = false
  }
}

async function test() {
  await save()
  if (message.value !== 'Connection gespeichert.') return
  busy.value = true
  try {
    const result = await window.eridion.testConnection(form.id)
    message.value = `Verbunden: ${result.product} ${result.version} · ${result.driver}`
  } catch (error) {
    message.value = (error as Error).message
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!persisted.value) return
  if (!deleteArmed.value) {
    deleteArmed.value = true
    message.value = `Zum Löschen von „${form.name}“ bitte erneut bestätigen.`
    return
  }
  busy.value = true
  message.value = 'Connection wird gelöscht …'
  try {
    connections.value = await window.eridion.deleteConnection(form.id)
    if (connections.value.some((connection) => connection.id === form.id)) {
      message.value = 'Die Connection konnte nicht gelöscht werden.'
      return
    }
    create()
    message.value = 'Connection gelöscht.'
  } catch (error) {
    message.value = (error as Error).message
  } finally {
    busy.value = false
  }
}

async function importDriver() {
  const result = await window.eridion.importDriver()
  if (!result.canceled && result.path) {
    form.driverJar = result.path
    form.driverId = 'custom'
    message.value = 'Treiber übernommen. Bitte Treiberklasse eintragen.'
  }
}

onMounted(async () => {
  if (window.eridion.runtime !== 'electron') {
    message.value = 'JDBC-Connections sind nur im Electron-Modus verfügbar. Bitte ./eridionStart.sh verwenden.'
    return
  }
  busy.value = true
  try {
    connections.value = await window.eridion.listConnections()
    create()
  } catch (error) {
    message.value = (error as Error).message
  } finally {
    busy.value = false
  }
})
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <section class="modal connection-modal">
      <header class="modal-header"><div><Database :size="20" /><strong>JDBC-Connections</strong></div><button class="icon-button" @click="emit('close')"><X :size="19" /></button></header>
      <div class="connection-layout">
        <aside class="connection-list">
          <button class="secondary full" :disabled="busy" @click="create"><Plus :size="15" /> Neue Verbindung anlegen</button>
          <button v-for="connection in connections" :key="connection.id" :class="['connection-item', { active: selectedId === connection.id }]" @click="select(connection)">
            <Database :size="15" /><span><strong>{{ connection.name }}</strong><small>{{ connection.driverId }}</small></span>
          </button>
        </aside>
        <form class="connection-form" @submit.prevent="save">
          <div class="form-grid">
            <label>Name<input v-model="form.name" required /></label>
            <label>Treiber<select v-model="form.driverId" @change="applyDriverTemplate"><option value="postgresql">PostgreSQL</option><option value="mariadb">MariaDB / MySQL</option><option value="sqlserver">Microsoft SQL Server</option><option value="sqlite">SQLite</option><option value="h2">H2</option><option value="oracle">Oracle (externes JAR)</option><option value="custom">Benutzerdefiniert</option></select></label>
            <label class="wide">JDBC-URL<input v-model="form.url" required spellcheck="false" /></label>
            <label>Benutzer<input v-model="form.user" autocomplete="username" /></label>
            <label>Passwort<input v-model="form.password" type="password" :placeholder="form.hasPassword ? 'Gespeichertes Passwort beibehalten' : ''" autocomplete="current-password" /></label>
            <label class="wide">Treiber-JAR<div class="input-action"><input v-model="form.driverJar" readonly placeholder="Für integrierte Treiber nicht erforderlich" /><button type="button" class="secondary" @click="importDriver"><Upload :size="14" /> Importieren</button></div></label>
            <label class="wide">Treiberklasse<input v-model="form.driverClass" placeholder="z. B. oracle.jdbc.OracleDriver" spellcheck="false" /></label>
            <label class="wide">Connection Properties (JSON)<textarea v-model="propertiesText" rows="3" spellcheck="false" /></label>
            <label class="wide">Optionale SQL-Abfrage für Schemas<textarea v-model="form.schemaSql" rows="2" placeholder="SELECT schema_name FROM ..." spellcheck="false" /></label>
            <label class="wide">Optionale SQL-Abfrage für Tabellen/Views<textarea v-model="form.objectSql" rows="3" placeholder="Erwartete Aliase: TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, REMARKS" spellcheck="false" /></label>
          </div>
          <section v-if="persisted" class="snapshot-manager">
            <header><div><Camera :size="16" /><strong>Offline-Snapshots</strong></div><small>SQLite · nur bei Änderungen</small></header>
            <div class="snapshot-create"><input v-model="snapshotName" :placeholder="`${form.name} – ${new Date().toLocaleDateString('de-DE')}`" /><button type="button" class="secondary" :disabled="busy" @click="createSnapshot"><Camera :size="14" /> Snapshot erzeugen</button></div>
            <div v-if="snapshots.length" class="snapshot-list">
              <div v-for="item in snapshots" :key="item.id" class="snapshot-row">
                <div v-if="editingSnapshotId === item.id" class="snapshot-edit"><input v-model="editingSnapshotName" @keyup.enter="renameSnapshot(item)" /><button type="button" class="icon-button" title="Namen speichern" @click="renameSnapshot(item)"><Save :size="14" /></button></div>
                <div v-else class="snapshot-description"><strong>{{ item.name }}</strong><small>{{ new Date(item.createdAt).toLocaleString('de-DE') }} · {{ item.databaseProduct }} {{ item.databaseVersion }}</small></div>
                <button v-if="editingSnapshotId !== item.id" type="button" class="icon-button" title="Snapshot umbenennen" @click="beginSnapshotRename(item)"><Pencil :size="14" /></button>
                <button type="button" class="icon-button danger-quiet" title="Snapshot löschen" @click="deleteSnapshot(item)"><Trash2 :size="14" /></button>
              </div>
            </div>
            <p v-else class="snapshot-empty">Noch keine Offline-Snapshots vorhanden.</p>
          </section>
          <p class="security-note">Externe JDBC-JARs enthalten ausführbaren Code. Importiere ausschließlich vertrauenswürdige Treiber. Für Schemaabfragen sollte ein technisch schreibgeschützter Datenbankbenutzer verwendet werden.</p>
          <p v-if="message" class="status-message">{{ message }}</p>
          <footer class="modal-actions">
            <button v-if="persisted" type="button" class="danger" :disabled="busy" @click="remove"><Trash2 :size="15" /> {{ deleteArmed ? 'Löschen bestätigen' : 'Löschen' }}</button>
            <span class="spacer" />
            <button type="button" class="secondary" :disabled="busy" @click="test"><PlugZap :size="15" /> Verbindung testen</button>
            <button type="submit" class="primary" :disabled="busy"><Save :size="15" /> Speichern</button>
          </footer>
        </form>
      </div>
    </section>
  </div>
</template>
