package com.eridion.worker

import java.net.URLClassLoader
import java.sql.Connection
import java.sql.Driver
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap

object DriverRegistry {
    private val builtIns = mapOf(
        "postgresql" to "org.postgresql.Driver",
        "mariadb" to "org.mariadb.jdbc.Driver",
        "mysql" to "org.mariadb.jdbc.Driver",
        "sqlite" to "org.sqlite.JDBC",
        "sqlserver" to "com.microsoft.sqlserver.jdbc.SQLServerDriver",
        "h2" to "org.h2.Driver"
    )
    private val loaded = ConcurrentHashMap<String, Pair<Driver, URLClassLoader?>>()

    fun supportedDrivers(): Map<String, String> = builtIns

    fun connect(request: ConnectionRequest): Connection {
        val key = listOf(request.driverId, request.driverClass, request.driverJar).joinToString("|")
        val driver = loaded.computeIfAbsent(key) { load(request) }.first
        require(driver.acceptsURL(request.url)) {
            "Der Treiber ${driver.javaClass.name} akzeptiert die JDBC-URL nicht."
        }
        val properties = Properties().apply {
            if (request.user.isNotBlank()) setProperty("user", request.user)
            if (request.password.isNotBlank()) setProperty("password", request.password)
            request.properties.forEach(::setProperty)
        }
        return driver.connect(request.url, properties)
            ?: error("Der JDBC-Treiber hat keine Verbindung für diese URL erzeugt.")
    }

    private fun load(request: ConnectionRequest): Pair<Driver, URLClassLoader?> {
        val className = request.driverClass?.takeIf { it.isNotBlank() }
            ?: builtIns[request.driverId]
            ?: error("Für '${request.driverId}' ist keine Treiberklasse konfiguriert.")
        val loader = request.driverJar?.takeIf { it.isNotBlank() }?.let {
            URLClassLoader(arrayOf(java.io.File(it).toURI().toURL()), Driver::class.java.classLoader)
        }
        val clazz = Class.forName(className, true, loader ?: DriverRegistry::class.java.classLoader)
        return (clazz.getDeclaredConstructor().newInstance() as Driver) to loader
    }
}
