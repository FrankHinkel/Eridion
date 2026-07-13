package com.eridion.worker

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
data class RpcRequest(
    val id: String,
    val method: String,
    val params: JsonObject = JsonObject(emptyMap())
)

@Serializable
data class RpcError(val code: String, val message: String, val details: String? = null)

@Serializable
data class RpcResponse(
    val id: String,
    val result: JsonElement? = null,
    val error: RpcError? = null
)

@Serializable
data class ConnectionRequest(
    val url: String,
    val user: String = "",
    val password: String = "",
    val driverId: String = "postgresql",
    val driverClass: String? = null,
    val driverJar: String? = null,
    val properties: Map<String, String> = emptyMap()
)

@Serializable
data class IntrospectionRequest(
    val connection: ConnectionRequest,
    val catalog: String? = null,
    val schema: String? = null,
    val tableTypes: List<String> = listOf("TABLE", "VIEW"),
    val objectSql: String? = null,
    val timeoutSeconds: Int = 30
)

@Serializable
data class SchemaColumn(
    val name: String,
    val typeName: String,
    val size: Int? = null,
    val scale: Int? = null,
    val nullable: Boolean = true,
    val defaultValue: String? = null,
    val remarks: String? = null,
    val primaryKey: Boolean = false,
    val foreignKey: Boolean = false,
    val ordinal: Int = 0
)

@Serializable
data class SchemaTable(
    val catalog: String? = null,
    val schema: String? = null,
    val name: String,
    val type: String,
    val remarks: String? = null,
    val columns: List<SchemaColumn>
)

@Serializable
data class SchemaRelationship(
    val name: String? = null,
    val sourceCatalog: String? = null,
    val sourceSchema: String? = null,
    val sourceTable: String,
    val sourceColumn: String,
    val targetCatalog: String? = null,
    val targetSchema: String? = null,
    val targetTable: String,
    val targetColumn: String
)

@Serializable
data class SchemaSnapshot(
    val databaseProduct: String,
    val databaseVersion: String,
    val importedAt: String,
    val tables: List<SchemaTable>,
    val relationships: List<SchemaRelationship>
)

@Serializable
data class SnapshotWriteRequest(
    val path: String,
    val id: String,
    val name: String,
    val connectionId: String,
    val connectionName: String,
    val snapshot: SchemaSnapshot
)

@Serializable
data class SnapshotRenameRequest(val path: String, val name: String)

@Serializable
data class StoredSnapshotMetadata(
    val id: String,
    val name: String,
    val connectionId: String,
    val connectionName: String,
    val createdAt: String,
    val updatedAt: String,
    val contentHash: String,
    val databaseProduct: String,
    val databaseVersion: String
)

@Serializable
data class StoredSnapshot(val metadata: StoredSnapshotMetadata, val snapshot: SchemaSnapshot)

@Serializable
data class PdfTooltip(val pageIndex: Int, val x: Float, val y: Float, val width: Float, val height: Float, val text: String)

@Serializable
data class PdfPayload(
    val formatVersion: Int,
    val documentId: String,
    val payloadSha256: String,
    val documentJson: String
)
