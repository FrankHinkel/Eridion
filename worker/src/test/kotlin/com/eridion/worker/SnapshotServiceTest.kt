package com.eridion.worker

import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.sql.DriverManager
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class SnapshotServiceTest {
    private fun snapshot(importedAt: String, type: String = "BIGINT") = SchemaSnapshot(
        databaseProduct = "PostgreSQL", databaseVersion = "17", importedAt = importedAt,
        tables = listOf(SchemaTable(schema = "public", name = "customer", type = "TABLE", columns = listOf(
            SchemaColumn(name = "id", typeName = type, nullable = false, primaryKey = true)
        ))), relationships = emptyList()
    )

    @Test
    fun `hash ignores import time but detects schema changes`() {
        assertEquals(SnapshotService.hash(snapshot("first")), SnapshotService.hash(snapshot("second")))
        assertNotEquals(SnapshotService.hash(snapshot("first")), SnapshotService.hash(snapshot("first", "UUID")))
    }

    @Test
    fun `writes reads and renames a real sqlite snapshot`() {
        val path = Files.createTempDirectory("eridion-snapshot").resolve("schema.sqlite").toString()
        val request = SnapshotWriteRequest(path, "snapshot-1", "Stand 1", "connection-1", "Test DB", snapshot("now"))
        val written = SnapshotService.write(request)
        val stored = SnapshotService.read(path)
        val renamed = SnapshotService.rename(SnapshotRenameRequest(path, "Stand 2"))

        assertEquals("Stand 1", written.name)
        assertEquals(request.snapshot, stored.snapshot)
        assertEquals("Stand 2", renamed.name)
        DriverManager.getConnection("jdbc:sqlite:$path").use { connection ->
            connection.createStatement().executeQuery("SELECT COUNT(*) FROM schema_object").use { result -> result.next(); assertEquals(1, result.getInt(1)) }
            connection.createStatement().executeQuery("SELECT COUNT(*) FROM schema_column").use { result -> result.next(); assertEquals(1, result.getInt(1)) }
        }
    }
}
