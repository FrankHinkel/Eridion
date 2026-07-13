$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDirectory

if ($env:OS -ne "Windows_NT") {
    throw "Dieses Skript muss unter Windows ausgeführt werden."
}

function Assert-CommandExists([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name wurde nicht gefunden."
    }
}

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Befehl fehlgeschlagen: $Executable $($Arguments -join ' ')"
    }
}

Assert-CommandExists "java"
$ExpectedPnpmVersion = "10.33.0"
$UseLocalDependencies = $false
$PnpmExecutable = $null
$PnpmPrefix = @()
$RequiredLocalTools = @(
    "apps\desktop\node_modules\vite\bin\vite.js",
    "apps\desktop\node_modules\vue-tsc\bin\vue-tsc.js",
    "apps\desktop\node_modules\vitest\vitest.mjs",
    "apps\desktop\node_modules\electron-builder\out\cli\cli.js"
)

function Test-LocalDependencies {
    return @($RequiredLocalTools | Where-Object { -not (Test-Path $_) }).Count -eq 0
}

function Use-LocalDependencies([string]$Reason) {
    $script:PnpmExecutable = $null
    $script:PnpmPrefix = @()
    $script:UseLocalDependencies = $true
    Write-Warning $Reason
    Write-Host "Vorhandene Projektabhängigkeiten werden direkt verwendet."
}

$NodeCommand = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
    throw "Node.js 22 oder neuer wurde nicht gefunden."
}
$NodeExecutable = $NodeCommand.Source
$NodeMajor = [int](& $NodeExecutable -p 'process.versions.node.split(".")[0]')
if ($NodeMajor -lt 22) {
    throw "Node.js 22 oder neuer wird benötigt."
}

$CorepackCommand = Get-Command "corepack" -ErrorAction SilentlyContinue
if ($CorepackCommand) {
    $PnpmExecutable = $CorepackCommand.Source
    $PnpmPrefix = @("pnpm")
}
else {
    $PnpmCommand = Get-Command "pnpm" -ErrorAction SilentlyContinue
    if ($PnpmCommand) {
        $PnpmExecutable = $PnpmCommand.Source
    }
}

if ($PnpmExecutable) {
    $VersionOutput = (& $PnpmExecutable @PnpmPrefix "--version" 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $VersionOutput -ne $ExpectedPnpmVersion) {
        if (Test-LocalDependencies) {
            $DisplayedVersion = if ($VersionOutput) { $VersionOutput } else { "nicht ausführbar" }
            Use-LocalDependencies "pnpm $ExpectedPnpmVersion ist nicht verfügbar (gefunden: $DisplayedVersion); pnpm wird umgangen."
        }
        else {
            throw "pnpm $ExpectedPnpmVersion wird benötigt (gefunden: $VersionOutput). Bitte Corepack aktivieren."
        }
    }
}
else {
    if (-not (Test-LocalDependencies)) {
        throw "Weder Corepack/pnpm $ExpectedPnpmVersion noch vollständige lokale Abhängigkeiten wurden gefunden."
    }
    Use-LocalDependencies "Kein geeignetes pnpm gefunden; pnpm wird umgangen."
}

function Invoke-Pnpm([string[]]$Arguments) {
    Invoke-Checked $PnpmExecutable (@($PnpmPrefix) + $Arguments)
}

function Invoke-DesktopNode([string]$Entry, [string[]]$Arguments = @()) {
    Push-Location "apps\desktop"
    try {
        Invoke-Checked $NodeExecutable (@($Entry) + $Arguments)
    }
    finally {
        Pop-Location
    }
}

Write-Host "[1/6] Abhängigkeiten werden geprüft …"
if ($UseLocalDependencies) {
    Write-Host "Vorhandene Projektabhängigkeiten werden verwendet."
}
else {
    $PreviousCi = $env:CI
    $env:CI = "true"
    try {
        Invoke-Pnpm @("install", "--frozen-lockfile")
    }
    finally {
        $env:CI = $PreviousCi
    }
}

Write-Host "[2/6] Kotlin-Worker und reduzierte Windows-Java-Runtime werden gebaut …"
Invoke-Checked ".\gradlew.bat" @("--stop")
Invoke-Checked ".\gradlew.bat" @("--no-daemon", "--no-configuration-cache", "-Dkotlin.incremental=false", ":worker:clean", ":worker:test", ":worker:shadowJar", ":worker:runtimeImage")

Write-Host "[3/6] TypeScript/Vue-Typprüfung läuft …"
Invoke-DesktopNode "node_modules\vue-tsc\bin\vue-tsc.js" @("--noEmit")

Write-Host "[4/6] Frontend-Tests laufen …"
Invoke-DesktopNode "node_modules\vitest\vitest.mjs" @("run")

Write-Host "[5/6] Produktionsdateien werden gebaut …"
if (Test-Path "apps\desktop\dist") {
    Remove-Item "apps\desktop\dist" -Recurse -Force
}
Invoke-DesktopNode "node_modules\vite\bin\vite.js" @("build")

Write-Host "[6/6] Windows-NSIS-Installer wird erzeugt …"
Invoke-DesktopNode "node_modules\electron-builder\out\cli\cli.js" @("--win", "nsis", "--publish", "never")

$Artifacts = @(Get-ChildItem -Path "apps\desktop\dist" -Filter "*.exe" -File -ErrorAction SilentlyContinue)
if ($Artifacts.Count -eq 0) {
    throw "Es wurde kein Windows-Installer erzeugt."
}

Write-Host "Eridion-Windows-Installer erfolgreich erzeugt:"
$Artifacts | ForEach-Object { Write-Host "  $($_.FullName)" }
