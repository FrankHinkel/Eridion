package com.eridion.worker

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SchemaIntrospectorTest {
    @Test
    fun `introspects sqlite even though its read only flag cannot change after connect`() {
        val connection = ConnectionRequest(url = "jdbc:sqlite::memory:", driverId = "sqlite")

        val connectionInfo = SchemaIntrospector.test(connection)
        val snapshot = SchemaIntrospector.inspect(IntrospectionRequest(connection = connection))

        assertEquals("SQLite", connectionInfo["product"])
        assertEquals("SQLite", snapshot.databaseProduct)
        assertTrue(snapshot.tables.isEmpty())
    }
}
