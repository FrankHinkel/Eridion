package com.eridion.worker

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest
import java.sql.Connection
import java.sql.DriverManager
import java.time.Instant

object SnapshotService {
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }

    fun hash(snapshot: SchemaSnapshot): String = sha256(json.encodeToString(snapshot.copy(importedAt = "")))

    fun write(request: SnapshotWriteRequest): StoredSnapshotMetadata {
        File(request.path).parentFile?.mkdirs()
        val now = Instant.now().toString()
        val metadata = StoredSnapshotMetadata(
            id = request.id,
            name = request.name.trim().ifBlank { request.connectionName },
            connectionId = request.connectionId,
            connectionName = request.connectionName,
            createdAt = now,
            updatedAt = now,
            contentHash = hash(request.snapshot),
            databaseProduct = request.snapshot.databaseProduct,
            databaseVersion = request.snapshot.databaseVersion
        )
        DriverManager.getConnection("jdbc:sqlite:${request.path}").use { connection ->
            connection.autoCommit = false
            runCatching {
                createSchema(connection)
                connection.prepareStatement("INSERT INTO snapshot_metadata VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)").use { statement ->
                    listOf(metadata.id, metadata.name, metadata.connectionId, metadata.connectionName, metadata.createdAt,
                        metadata.updatedAt, metadata.contentHash, metadata.databaseProduct, metadata.databaseVersion)
                        .forEachIndexed { index, value -> statement.setString(index + 1, value) }
                    statement.executeUpdate()
                }
                connection.prepareStatement("INSERT INTO snapshot_payload VALUES (1, ?)").use { statement ->
                    statement.setString(1, json.encodeToString(request.snapshot)); statement.executeUpdate()
                }
                request.snapshot.tables.forEachIndexed { tableIndex, table ->
                    connection.prepareStatement("INSERT INTO schema_object VALUES (?, ?, ?, ?, ?, ?)").use { statement ->
                        statement.setInt(1, tableIndex); statement.setString(2, table.catalog); statement.setString(3, table.schema)
                        statement.setString(4, table.name); statement.setString(5, table.type); statement.setString(6, table.remarks)
                        statement.executeUpdate()
                    }
                    table.columns.forEachIndexed { columnIndex, column ->
                        connection.prepareStatement("INSERT INTO schema_column VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").use { statement ->
                            statement.setInt(1, tableIndex); statement.setInt(2, columnIndex); statement.setString(3, column.name)
                            statement.setString(4, column.typeName); statement.setObject(5, column.size); statement.setObject(6, column.scale)
                            statement.setInt(7, if (column.nullable) 1 else 0); statement.setString(8, column.defaultValue)
                            statement.setString(9, column.remarks); statement.setInt(10, if (column.primaryKey) 1 else 0)
                            statement.setInt(11, if (column.foreignKey) 1 else 0); statement.setInt(12, column.ordinal)
                            statement.executeUpdate()
                        }
                    }
                }
                request.snapshot.relationships.forEachIndexed { index, relation ->
                    connection.prepareStatement("INSERT INTO schema_relationship VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").use { statement ->
                        val values = listOf(relation.name, relation.sourceCatalog, relation.sourceSchema, relation.sourceTable,
                            relation.sourceColumn, relation.targetCatalog, relation.targetSchema, relation.targetTable, relation.targetColumn)
                        statement.setInt(1, index); values.forEachIndexed { i, value -> statement.setString(i + 2, value) }
                        statement.executeUpdate()
                    }
                }
                connection.commit()
            }.getOrElse { error -> connection.rollback(); throw error }
        }
        return metadata
    }

    fun read(path: String): StoredSnapshot = DriverManager.getConnection("jdbc:sqlite:$path").use { connection ->
        StoredSnapshot(readMetadata(connection), connection.createStatement().use { statement ->
            statement.executeQuery("SELECT snapshot_json FROM snapshot_payload WHERE singleton = 1").use { result ->
                require(result.next()) { "Snapshot enthält keine Schemadaten." }
                json.decodeFromString<SchemaSnapshot>(result.getString(1))
            }
        })
    }

    fun metadata(path: String): StoredSnapshotMetadata = DriverManager.getConnection("jdbc:sqlite:$path").use(::readMetadata)

    fun rename(request: SnapshotRenameRequest): StoredSnapshotMetadata = DriverManager.getConnection("jdbc:sqlite:${request.path}").use { connection ->
        connection.prepareStatement("UPDATE snapshot_metadata SET name = ?, updated_at = ? WHERE singleton = 1").use { statement ->
            statement.setString(1, request.name.trim().ifBlank { error("Der Snapshot-Name darf nicht leer sein.") })
            statement.setString(2, Instant.now().toString()); statement.executeUpdate()
        }
        readMetadata(connection)
    }

    private fun readMetadata(connection: Connection): StoredSnapshotMetadata = connection.createStatement().use { statement ->
        statement.executeQuery("SELECT id, name, connection_id, connection_name, created_at, updated_at, content_hash, database_product, database_version FROM snapshot_metadata WHERE singleton = 1").use { result ->
            require(result.next()) { "Ungültige Eridion-Snapshot-Datei." }
            StoredSnapshotMetadata(result.getString(1), result.getString(2), result.getString(3), result.getString(4),
                result.getString(5), result.getString(6), result.getString(7), result.getString(8), result.getString(9))
        }
    }

    private fun createSchema(connection: Connection) = connection.createStatement().use { statement ->
        statement.execute("CREATE TABLE snapshot_metadata(singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL, name TEXT NOT NULL, connection_id TEXT NOT NULL, connection_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, content_hash TEXT NOT NULL, database_product TEXT NOT NULL, database_version TEXT NOT NULL)")
        statement.execute("CREATE TABLE snapshot_payload(singleton INTEGER PRIMARY KEY CHECK(singleton=1), snapshot_json TEXT NOT NULL)")
        statement.execute("CREATE TABLE schema_object(object_id INTEGER PRIMARY KEY, catalog_name TEXT, schema_name TEXT, object_name TEXT NOT NULL, object_type TEXT NOT NULL, remarks TEXT)")
        statement.execute("CREATE TABLE schema_column(object_id INTEGER NOT NULL, column_index INTEGER NOT NULL, column_name TEXT NOT NULL, type_name TEXT NOT NULL, size INTEGER, scale INTEGER, nullable INTEGER NOT NULL, default_value TEXT, remarks TEXT, primary_key INTEGER NOT NULL, foreign_key INTEGER NOT NULL, ordinal INTEGER NOT NULL, PRIMARY KEY(object_id,column_index))")
        statement.execute("CREATE TABLE schema_relationship(relation_index INTEGER PRIMARY KEY, relation_name TEXT, source_catalog TEXT, source_schema TEXT, source_table TEXT NOT NULL, source_column TEXT NOT NULL, target_catalog TEXT, target_schema TEXT, target_table TEXT NOT NULL, target_column TEXT NOT NULL)")
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
