package com.eridion.worker

import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.Loader
import org.junit.jupiter.api.Test
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PdfDocumentServiceTest {
    @Test
    fun `embeds and extracts an eridion document`() {
        val directory = Files.createTempDirectory("eridion-pdf-test")
        val input = directory.resolve("input.pdf")
        val output = directory.resolve("output.pdf")
        PDDocument().use { document ->
            document.addPage(PDPage())
            document.save(input.toFile())
        }
        val source = """{"formatVersion":1,"documentId":"test-id","nodes":[],"relationships":[]}"""

        val result = PdfDocumentService.embed(input.toString(), output.toString(), source, listOf(PdfTooltip(0, 10f, 20f, 30f, 12f, "ID: BIGINT")))
        val extracted = PdfDocumentService.extract(output.toString())

        assertTrue(Files.size(output) > Files.size(input))
        assertEquals("test-id", result["documentId"])
        assertEquals(source, extracted.documentJson)
        Loader.loadPDF(output.toFile()).use { document ->
            assertEquals(1, document.getPage(0).annotations.size)
            assertEquals("ID: BIGINT", document.getPage(0).annotations.first().contents)
        }
    }
}
