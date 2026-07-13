#!/usr/bin/env bash

ERIDION_PNPM_VERSION="10.33.0"
ERIDION_LOCAL_DEPENDENCIES=false
ERIDION_PNPM=()

eridion_has_local_dependencies() {
  [[ -f "$ROOT_DIR/apps/desktop/node_modules/vite/bin/vite.js" \
    && -f "$ROOT_DIR/apps/desktop/node_modules/vue-tsc/bin/vue-tsc.js" \
    && -f "$ROOT_DIR/apps/desktop/node_modules/vitest/vitest.mjs" \
    && -f "$ROOT_DIR/apps/desktop/node_modules/electron-builder/out/cli/cli.js" ]]
}

eridion_use_local_dependencies() {
  ERIDION_PNPM=()
  ERIDION_LOCAL_DEPENDENCIES=true
  echo "Hinweis: pnpm wird umgangen; vorhandene Projektabhängigkeiten werden direkt verwendet."
}

eridion_resolve_toolchain() {
  NODE_BIN="$(command -v node 2>/dev/null || true)"
  if [[ -z "$NODE_BIN" ]]; then
    local codex_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
    [[ -x "$codex_node" ]] && NODE_BIN="$codex_node"
  fi
  if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
    echo "Fehler: Node.js 22 oder neuer wurde nicht gefunden." >&2
    return 1
  fi
  local node_major
  node_major="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
  if (( node_major < 22 )); then
    echo "Fehler: Node.js 22 oder neuer wird benötigt (gefunden: $($NODE_BIN --version))." >&2
    return 1
  fi

  if command -v corepack >/dev/null 2>&1; then
    ERIDION_PNPM=(corepack pnpm)
  else
    local pnpm_path
    pnpm_path="$(command -v pnpm 2>/dev/null || true)"
    if [[ -n "$pnpm_path" && "$pnpm_path" != *codex-runtimes*/bin/fallback/pnpm ]]; then
      ERIDION_PNPM=("$pnpm_path")
    fi
  fi

  if (( ${#ERIDION_PNPM[@]} )); then
    local actual_version
    actual_version="$("${ERIDION_PNPM[@]}" --version 2>/dev/null || true)"
    if [[ "$actual_version" != "$ERIDION_PNPM_VERSION" ]]; then
      if eridion_has_local_dependencies; then
        echo "Warnung: pnpm $ERIDION_PNPM_VERSION ist nicht verfügbar (gefunden: ${actual_version:-nicht ausführbar})." >&2
        eridion_use_local_dependencies
      else
        echo "Fehler: pnpm $ERIDION_PNPM_VERSION wird benötigt (gefunden: ${actual_version:-unbekannt})." >&2
        echo "Bitte Corepack aktivieren; package.json fixiert die richtige Version." >&2
        return 1
      fi
    fi
  elif eridion_has_local_dependencies; then
    eridion_use_local_dependencies
  else
    echo "Fehler: Weder Corepack/pnpm $ERIDION_PNPM_VERSION noch vollständige lokale Abhängigkeiten wurden gefunden." >&2
    return 1
  fi
}

eridion_install_dependencies() {
  if [[ "$ERIDION_LOCAL_DEPENDENCIES" == true ]]; then
    echo "Vorhandene Projektabhängigkeiten werden verwendet; keine automatische Neuinstallation."
  else
    CI=true "${ERIDION_PNPM[@]}" install --frozen-lockfile
  fi
}

eridion_desktop_node() {
  local entry="$1"
  shift
  (cd "$ROOT_DIR/apps/desktop" && "$NODE_BIN" "$entry" "$@")
}
