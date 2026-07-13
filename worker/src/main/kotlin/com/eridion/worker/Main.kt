package com.eridion.worker

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonPrimitive

private val json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
}

fun main() {
    System.`in`.bufferedReader().useLines { lines ->
        lines.forEach { line ->
            if (line.isBlank()) return@forEach
            val response = runCatching {
                val request = json.decodeFromString<RpcRequest>(line)
                RpcResponse(request.id, result = dispatch(request))
            }.getOrElse { error ->
                val id = runCatching { json.decodeFromString<RpcRequest>(line).id }.getOrDefault("unknown")
                RpcResponse(
                    id = id,
                    error = RpcError(
                        code = error.javaClass.simpleName,
                        message = error.message ?: "Unbekannter Fehler",
                        details = error.stackTraceToString()
                    )
                )
            }
            println(json.encodeToString(response))
            System.out.flush()
        }
    }
}

private fun dispatch(request: RpcRequest) = when (request.method) {
    "ping" -> json.encodeToJsonElement(mapOf("status" to "ok", "version" to "0.1.0"))
    "drivers.list" -> json.encodeToJsonElement(DriverRegistry.supportedDrivers())
    "connection.test" -> {
        val value = json.decodeFromJsonElement<ConnectionRequest>(request.params.required("connection"))
        json.encodeToJsonElement(SchemaIntrospector.test(value))
    }
    "schema.list" -> {
        val value = json.decodeFromJsonElement<ConnectionRequest>(request.params.required("connection"))
        val sql = request.params["sql"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
        json.encodeToJsonElement(SchemaIntrospector.listSchemas(value, sql, 30))
    }
    "schema.inspect" -> {
        val value = json.decodeFromJsonElement<IntrospectionRequest>(request.params)
        json.encodeToJsonElement(SchemaIntrospector.inspect(value))
    }
    "snapshot.hash" -> json.encodeToJsonElement(mapOf("contentHash" to SnapshotService.hash(json.decodeFromJsonElement(request.params.required("snapshot")))))
    "snapshot.write" -> json.encodeToJsonElement(SnapshotService.write(json.decodeFromJsonElement(request.params)))
    "snapshot.meta" -> json.encodeToJsonElement(SnapshotService.metadata(request.params.requiredString("path")))
    "snapshot.read" -> json.encodeToJsonElement(SnapshotService.read(request.params.requiredString("path")))
    "snapshot.rename" -> json.encodeToJsonElement(SnapshotService.rename(json.decodeFromJsonElement(request.params)))
    "pdf.embed" -> {
        val input = request.params.requiredString("inputPath")
        val output = request.params.requiredString("outputPath")
        val documentJson = request.params.requiredString("documentJson")
        val tooltips = request.params["tooltips"]?.let { json.decodeFromJsonElement<List<PdfTooltip>>(it) }.orEmpty()
        json.encodeToJsonElement(PdfDocumentService.embed(input, output, documentJson, tooltips))
    }
    "pdf.annotate" -> {
        val input = request.params.requiredString("inputPath")
        val output = request.params.requiredString("outputPath")
        val tooltips = request.params["tooltips"]?.let { json.decodeFromJsonElement<List<PdfTooltip>>(it) }.orEmpty()
        PdfDocumentService.annotate(input, output, tooltips)
        json.encodeToJsonElement(mapOf("annotations" to tooltips.size))
    }
    "pdf.extract" -> {
        val path = request.params.requiredString("path")
        json.encodeToJsonElement(PdfDocumentService.extract(path))
    }
    else -> error("Unbekannte Worker-Methode: ${request.method}")
}

private fun JsonObject.required(name: String) = this[name] ?: error("Parameter '$name' fehlt")
private fun JsonObject.requiredString(name: String) = required(name).jsonPrimitive.content
