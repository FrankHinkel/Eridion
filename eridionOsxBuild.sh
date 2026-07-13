#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Fehler: Dieses Skript muss unter macOS ausgeführt werden." >&2
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

echo "[2/6] Kotlin-Worker und reduzierte macOS-Java-Runtime werden gebaut …"
./gradlew --stop >/dev/null 2>&1 || true
./gradlew --no-daemon --no-configuration-cache -Dkotlin.incremental=false :worker:clean :worker:test :worker:shadowJar :worker:runtimeImage

echo "[3/6] TypeScript/Vue-Typprüfung läuft …"
eridion_desktop_node node_modules/vue-tsc/bin/vue-tsc.js --noEmit

echo "[4/6] Frontend-Tests laufen …"
eridion_desktop_node node_modules/vitest/vitest.mjs run

echo "[5/6] Produktionsdateien werden gebaut …"
rm -rf "$ROOT_DIR/apps/desktop/dist"
eridion_desktop_node node_modules/vite/bin/vite.js build

echo "[6/6] macOS-DMG wird erzeugt …"
eridion_desktop_node node_modules/electron-builder/out/cli/cli.js --mac dmg --publish never

shopt -s nullglob
artifacts=(apps/desktop/dist/*.dmg)
if (( ${#artifacts[@]} == 0 )); then
  echo "Fehler: Es wurde keine DMG-Datei erzeugt." >&2
  exit 1
fi

echo "Eridion-DMG erfolgreich erzeugt:"
printf '  %s\n' "${artifacts[@]}"
