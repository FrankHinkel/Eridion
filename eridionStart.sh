#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
DEV_PORT=51894

LISTENER_STATUS="$(lsof -nP -iTCP:$DEV_PORT -sTCP:LISTEN 2>/dev/null || true)"
JAVA_STATUS="$(jps -l 2>/dev/null || true)"
ELECTRON_STATUS="$(lsof -c Electron 2>/dev/null || true)"
if [[ "$LISTENER_STATUS" == *LISTEN* \
  && ( "$ELECTRON_STATUS" == *Electron* || "$JAVA_STATUS" == *eridion-worker-all.jar* ) ]]; then
  echo "Eridion läuft bereits im vollständigen Electron-Dev-Modus."
  if [[ "$(uname -s)" == "Darwin" ]]; then
    osascript -e 'tell application "Electron" to activate' >/dev/null 2>&1 || true
  fi
  exit 0
fi

if command -v lsof >/dev/null 2>&1; then
  STALE_PIDS="$(lsof -tiTCP:$DEV_PORT -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$STALE_PIDS" ]]; then
    echo "Unvollständiger alter Dev-Prozess wird beendet …"
    kill $STALE_PIDS 2>/dev/null || true
  fi
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Fehler: Java 17 oder neuer wurde nicht gefunden." >&2
  exit 1
fi

# Start Vite directly with Node instead of going through a globally installed
# pnpm. This keeps startup independent from pnpm wrappers that may try to
# reinstall or purge node_modules before executing the dev script.
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  CODEX_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ -x "$CODEX_NODE" ]]; then
    NODE_BIN="$CODEX_NODE"
  fi
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Fehler: Node.js 22 oder neuer wurde nicht gefunden." >&2
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Fehler: Node.js 22 oder neuer wird benötigt (gefunden: $($NODE_BIN --version))." >&2
  exit 1
fi

VITE_ENTRY="$ROOT_DIR/apps/desktop/node_modules/vite/bin/vite.js"
if [[ ! -f "$VITE_ENTRY" ]]; then
  echo "Fehler: Die Projektabhängigkeiten fehlen. Bitte einmal 'corepack pnpm install --frozen-lockfile' ausführen." >&2
  exit 1
fi

if [[ ! -f worker/build/libs/eridion-worker-all.jar ]]; then
  echo "Eridion Worker wird gebaut …"
  ./gradlew :worker:shadowJar
else
  echo "Vorhandener Eridion Worker wird verwendet."
fi

echo "Eridion wird im Electron-Dev-Modus gestartet …"
echo "Dieses Terminal geöffnet lassen. Beenden mit Ctrl+C."
cd "$ROOT_DIR/apps/desktop"
exec "$NODE_BIN" "$VITE_ENTRY"
