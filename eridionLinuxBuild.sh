#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Fehler: Dieses Skript muss unter Linux ausgeführt werden." >&2
  exit 1
fi

for command_name in java; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Fehler: $command_name wurde nicht gefunden." >&2
    exit 1
  fi
done

source "$ROOT_DIR/scripts/build-toolchain.sh"
eridion_resolve_toolchain

echo "[1/6] Abhängigkeiten werden geprüft …"
eridion_install_dependencies

echo "[2/6] Kotlin-Worker und reduzierte Linux-Java-Runtime werden gebaut …"
./gradlew --stop >/dev/null 2>&1 || true
./gradlew --no-daemon --no-configuration-cache -Dkotlin.incremental=false :worker:clean :worker:test :worker:shadowJar :worker:runtimeImage

echo "[3/6] TypeScript/Vue-Typprüfung läuft …"
eridion_desktop_node node_modules/vue-tsc/bin/vue-tsc.js --noEmit

echo "[4/6] Frontend-Tests laufen …"
eridion_desktop_node node_modules/vitest/vitest.mjs run

echo "[5/6] Produktionsdateien werden gebaut …"
rm -rf "$ROOT_DIR/apps/desktop/dist"
eridion_desktop_node node_modules/vite/bin/vite.js build

echo "[6/6] AppImage- und Debian-Pakete werden erzeugt …"
eridion_desktop_node node_modules/electron-builder/out/cli/cli.js --linux AppImage deb --publish never

shopt -s nullglob
appimages=(apps/desktop/dist/*.AppImage)
debian_packages=(apps/desktop/dist/*.deb)
if (( ${#appimages[@]} == 0 || ${#debian_packages[@]} == 0 )); then
  echo "Fehler: AppImage und/oder Debian-Paket wurden nicht erzeugt." >&2
  exit 1
fi

echo "Eridion-Linux-Pakete erfolgreich erzeugt:"
printf '  %s\n' "${appimages[@]}" "${debian_packages[@]}"
