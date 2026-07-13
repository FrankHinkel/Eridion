plugins {
    kotlin("jvm") version "2.1.21"
    kotlin("plugin.serialization") version "2.1.21"
    id("com.gradleup.shadow") version "8.3.6"
    application
}

group = "com.eridion"
version = "0.1.0"

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("org.apache.pdfbox:pdfbox:3.0.5")
    implementation("org.apache.pdfbox:xmpbox:3.0.5")
    implementation("org.postgresql:postgresql:42.7.7")
    implementation("org.mariadb.jdbc:mariadb-java-client:3.5.4")
    implementation("org.xerial:sqlite-jdbc:3.50.2.0")
    implementation("com.microsoft.sqlserver:mssql-jdbc:12.10.1.jre11")
    implementation("com.h2database:h2:2.3.232")

    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.3")
}

application {
    mainClass.set("com.eridion.worker.MainKt")
}

kotlin {
    jvmToolchain(17)
}

tasks.test {
    useJUnitPlatform()
}

tasks.shadowJar {
    archiveBaseName.set("eridion-worker")
    archiveClassifier.set("all")
    archiveVersion.set("")
    mergeServiceFiles()
    manifest { attributes["Main-Class"] = application.mainClass.get() }
}

val runtimeImage by tasks.registering(Exec::class) {
    val outputDirectory = layout.buildDirectory.dir("runtime")
    outputs.dir(outputDirectory)
    doFirst { outputDirectory.get().asFile.deleteRecursively() }
    commandLine(
        "${System.getProperty("java.home")}/bin/jlink",
        "--add-modules", "java.base,java.desktop,java.logging,java.management,java.naming,java.security.jgss,java.sql,java.xml,jdk.crypto.ec,jdk.unsupported",
        "--strip-debug",
        "--no-header-files",
        "--no-man-pages",
        "--compress=2",
        "--output", outputDirectory.get().asFile.absolutePath
    )
}
