package com.eridion.worker

import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant

object SchemaIntrospector {
    private data class TableRef(
        val catalog: String?,
        val schema: String?,
        val name: String,
        val type: String,
        val remarks: String?
    )

    fun test(request: ConnectionRequest): Map<String, String> =
        DriverRegistry.connect(request).use { connection ->
            val meta = connection.metaData
            mapOf(
                "product" to meta.databaseProductName,
                "version" to meta.databaseProductVersion,
                "driver" to meta.driverName,
                "driverVersion" to meta.driverVersion
            )
        }

    fun listSchemas(request: ConnectionRequest, sql: String?, timeoutSeconds: Int): List<String> =
        DriverRegistry.connect(request).use { connection ->
            enableReadOnlyWhenSupported(connection)
            if (!sql.isNullOrBlank()) {
                requireReadQuery(sql)
                connection.createStatement().use { statement ->
                    statement.queryTimeout = timeoutSeconds
                    statement.maxRows = 10_000
                    statement.executeQuery(sql).use { rs ->
                        buildList { while (rs.next()) add(rs.getString(1)) }
                    }
                }
            } else {
                connection.metaData.schemas.use { rs ->
                    buildList { while (rs.next()) add(rs.getString("TABLE_SCHEM")) }
                }
            }
        }

    fun inspect(request: IntrospectionRequest): SchemaSnapshot =
        DriverRegistry.connect(request.connection).use { connection ->
            enableReadOnlyWhenSupported(connection)
            val meta = connection.metaData
            val refs = if (request.objectSql.isNullOrBlank()) {
                readTablesFromMetadata(connection, request)
            } else {
                readTablesFromSql(connection, request.objectSql, request.timeoutSeconds)
            }
            val relationships = mutableListOf<SchemaRelationship>()
            val tables = refs.map { ref ->
                val primaryKeys = mutableSetOf<String>()
                meta.getPrimaryKeys(ref.catalog, ref.schema, ref.name).use { rs ->
                    while (rs.next()) primaryKeys += rs.getString("COLUMN_NAME")
                }
                val foreignKeys = mutableSetOf<String>()
                meta.getImportedKeys(ref.catalog, ref.schema, ref.name).use { rs ->
                    while (rs.next()) {
                        val sourceColumn = rs.getString("FKCOLUMN_NAME")
                        foreignKeys += sourceColumn
                        relationships += SchemaRelationship(
                            name = rs.getString("FK_NAME"),
                            sourceCatalog = ref.catalog,
                            sourceSchema = ref.schema,
                            sourceTable = ref.name,
                            sourceColumn = sourceColumn,
                            targetCatalog = rs.getString("PKTABLE_CAT"),
                            targetSchema = rs.getString("PKTABLE_SCHEM"),
                            targetTable = rs.getString("PKTABLE_NAME"),
                            targetColumn = rs.getString("PKCOLUMN_NAME")
                        )
                    }
                }
                val columns = meta.getColumns(ref.catalog, ref.schema, ref.name, "%").use { rs ->
                    buildList {
                        while (rs.next()) {
                            val name = rs.getString("COLUMN_NAME")
                            add(
                                SchemaColumn(
                                    name = name,
                                    typeName = rs.getString("TYPE_NAME"),
                                    size = rs.nullableInt("COLUMN_SIZE"),
                                    scale = rs.nullableInt("DECIMAL_DIGITS"),
                                    nullable = rs.getInt("NULLABLE") != java.sql.DatabaseMetaData.columnNoNulls,
                                    defaultValue = rs.getString("COLUMN_DEF"),
                                    remarks = rs.getString("REMARKS"),
                                    primaryKey = name in primaryKeys,
                                    foreignKey = name in foreignKeys,
                                    ordinal = rs.getInt("ORDINAL_POSITION")
                                )
                            )
                        }
                    }.sortedBy { it.ordinal }
                }
                SchemaTable(ref.catalog, ref.schema, ref.name, ref.type, ref.remarks, columns)
            }
            SchemaSnapshot(
                databaseProduct = meta.databaseProductName,
                databaseVersion = meta.databaseProductVersion,
                importedAt = Instant.now().toString(),
                tables = tables,
                relationships = relationships.distinct()
            )
        }

    private fun readTablesFromMetadata(connection: Connection, request: IntrospectionRequest): List<TableRef> =
        connection.metaData.getTables(
            request.catalog,
            request.schema,
            "%",
            request.tableTypes.toTypedArray()
        ).use { rs ->
            buildList {
                while (rs.next()) {
                    add(
                        TableRef(
                            rs.getString("TABLE_CAT"),
                            rs.getString("TABLE_SCHEM"),
                            rs.getString("TABLE_NAME"),
                            rs.getString("TABLE_TYPE"),
                            rs.getString("REMARKS")
                        )
                    )
                }
            }
        }

    private fun readTablesFromSql(connection: Connection, sql: String, timeoutSeconds: Int): List<TableRef> {
        requireReadQuery(sql)
        return connection.createStatement().use { statement ->
            statement.queryTimeout = timeoutSeconds
            statement.maxRows = 50_000
            statement.executeQuery(sql).use { rs ->
                buildList {
                    while (rs.next()) {
                        add(
                            TableRef(
                                rs.optionalString("TABLE_CATALOG"),
                                rs.optionalString("TABLE_SCHEMA"),
                                rs.getString("TABLE_NAME"),
                                rs.optionalString("TABLE_TYPE") ?: "TABLE",
                                rs.optionalString("REMARKS")
                            )
                        )
                    }
                }
            }
        }
    }

    private fun requireReadQuery(sql: String) {
        val normalized = sql.trimStart().lowercase()
        require(normalized.startsWith("select") || normalized.startsWith("with")) {
            "Nur lesende SELECT- beziehungsweise WITH-Abfragen sind erlaubt."
        }
        require(!sql.trimEnd().dropLast(1).contains(';')) { "Es ist nur eine SQL-Anweisung erlaubt." }
    }

    private fun enableReadOnlyWhenSupported(connection: Connection) {
        // Some drivers (notably SQLite) only accept read-only at connection creation time.
        runCatching { connection.isReadOnly = true }
    }

    private fun ResultSet.nullableInt(column: String): Int? {
        val value = getInt(column)
        return if (wasNull()) null else value
    }

    private fun ResultSet.optionalString(column: String): String? =
        runCatching { getString(column) }.getOrNull()
}
