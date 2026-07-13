package com.eridion.worker

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.apache.pdfbox.Loader
import org.apache.pdfbox.cos.COSArray
import org.apache.pdfbox.cos.COSName
import org.apache.pdfbox.cos.COSInteger
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary
import org.apache.pdfbox.pdmodel.common.PDMetadata
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile
import org.apache.pdfbox.pdmodel.common.filespecification.PDFileSpecification
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink
import org.apache.pdfbox.pdmodel.common.PDRectangle
import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.util.GregorianCalendar

object PdfDocumentService {
    const val PAYLOAD_NAME = "eridion-document.json"
    private val json = Json { ignoreUnknownKeys = true }

    fun embed(inputPath: String, outputPath: String, documentJson: String, tooltips: List<PdfTooltip> = emptyList()): Map<String, String> {
        val root = json.parseToJsonElement(documentJson).jsonObject
        val formatVersion = root["formatVersion"]?.jsonPrimitive?.content ?: "1"
        val documentId = root["documentId"]?.jsonPrimitive?.content ?: error("documentId fehlt")
        val bytes = documentJson.toByteArray(Charsets.UTF_8)
        val hash = sha256(bytes)
        Loader.loadPDF(File(inputPath)).use { document ->
            addTooltips(document, tooltips)
            val payloadFile = PDEmbeddedFile(document, ByteArrayInputStream(bytes)).apply {
                subtype = "application/vnd.eridion.erd+json"
                size = bytes.size
                creationDate = GregorianCalendar()
                modDate = GregorianCalendar()
            }
            val fileSpec = PDComplexFileSpecification().apply {
                file = PAYLOAD_NAME
                fileUnicode = PAYLOAD_NAME
                fileDescription = "Editable Eridion ERD source document"
                embeddedFileUnicode = payloadFile
                embeddedFile = payloadFile
                cosObject.setName("AFRelationship", "Source")
            }
            val tree = PDEmbeddedFilesNameTreeNode().apply {
                names = mapOf(PAYLOAD_NAME to fileSpec)
            }
            val names = document.documentCatalog.names ?: PDDocumentNameDictionary(document.documentCatalog)
            names.embeddedFiles = tree
            document.documentCatalog.names = names
            document.documentCatalog.cosObject.setItem(
                COSName.getPDFName("AF"),
                COSArray().apply { add(fileSpec.cosObject) }
            )
            val metadata = PDMetadata(document)
            metadata.importXMPMetadata(xmp(formatVersion, documentId, hash).toByteArray(Charsets.UTF_8))
            document.documentCatalog.metadata = metadata
            document.documentInformation.apply {
                producer = "Eridion"
                creator = "Eridion"
                setCustomMetadataValue("Eridion", "formatVersion=$formatVersion;documentId=$documentId;payloadSha256=$hash")
            }
            document.save(outputPath)
        }
        return mapOf("documentId" to documentId, "payloadSha256" to hash)
    }

    fun annotate(inputPath: String, outputPath: String, tooltips: List<PdfTooltip>) {
        Loader.loadPDF(File(inputPath)).use { document ->
            addTooltips(document, tooltips)
            document.save(outputPath)
        }
    }

    private fun addTooltips(document: PDDocument, tooltips: List<PdfTooltip>) {
        val pxToPoint = 72f / 96f
        tooltips.filter { it.text.isNotBlank() && it.pageIndex in 0 until document.numberOfPages }.forEach { tooltip ->
            val page = document.getPage(tooltip.pageIndex)
            val rectangle = PDRectangle(
                tooltip.x * pxToPoint,
                page.mediaBox.height - (tooltip.y + tooltip.height) * pxToPoint,
                tooltip.width * pxToPoint,
                tooltip.height * pxToPoint
            )
            page.annotations.add(PDAnnotationLink().apply {
                contents = tooltip.text
                this.rectangle = rectangle
                cosObject.setItem(COSName.BORDER, COSArray().apply { add(COSInteger.ZERO); add(COSInteger.ZERO); add(COSInteger.ZERO) })
            })
        }
    }

    fun extract(path: String): PdfPayload {
        Loader.loadPDF(File(path)).use { document ->
            val spec = findPayload(document) ?: error("Diese PDF enthält kein bearbeitbares Eridion-Dokument.")
            val embedded = spec.embeddedFileUnicode ?: spec.embeddedFile
                ?: error("Der Eridion-Anhang ist beschädigt.")
            val bytes = embedded.createInputStream().use { it.readBytes() }
            val documentJson = bytes.toString(Charsets.UTF_8)
            val actualHash = sha256(bytes)
            val expectedHash = document.documentInformation
                .getCustomMetadataValue("Eridion")
                ?.let { Regex("payloadSha256=([a-f0-9]{64})").find(it)?.groupValues?.get(1) }
            require(expectedHash == null || expectedHash == actualHash) {
                "Die eingebetteten Eridion-Daten stimmen nicht mit ihrer Prüfsumme überein."
            }
            val root = json.parseToJsonElement(documentJson).jsonObject
            return PdfPayload(
                formatVersion = root["formatVersion"]?.jsonPrimitive?.content?.toInt() ?: 1,
                documentId = root["documentId"]?.jsonPrimitive?.content ?: error("documentId fehlt"),
                payloadSha256 = actualHash,
                documentJson = documentJson
            )
        }
    }

    private fun findPayload(document: PDDocument): PDComplexFileSpecification? {
        val tree = document.documentCatalog.names?.embeddedFiles ?: return null
        tree.names?.get(PAYLOAD_NAME)?.let { return it as? PDComplexFileSpecification }
        return tree.kids.orEmpty().asSequence()
            .flatMap { it.names.orEmpty().asSequence() }
            .firstOrNull { it.key == PAYLOAD_NAME }
            ?.value as? PDComplexFileSpecification
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun xmp(formatVersion: String, documentId: String, hash: String): String = """
        <?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
        <x:xmpmeta xmlns:x="adobe:ns:meta/">
          <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
            <rdf:Description rdf:about="" xmlns:eridion="https://eridion.app/ns/erd/1.0/"
              eridion:application="Eridion"
              eridion:formatVersion="$formatVersion"
              eridion:documentId="$documentId"
              eridion:payloadName="$PAYLOAD_NAME"
              eridion:payloadSha256="$hash"
              eridion:modifiedAt="${Instant.now()}" />
          </rdf:RDF>
        </x:xmpmeta>
        <?xpacket end="w"?>
    """.trimIndent()
}
