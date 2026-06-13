#!/usr/bin/env bash
set -euo pipefail

PKG_FILE="${1:-}"

if [ -z "$PKG_FILE" ] || [ ! -f "$PKG_FILE" ]; then
  echo "Usage: ./scripts/verify-package.sh /path/to/A-W-Installer.pkg" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if pkgutil --expand-full "$PKG_FILE" "$TMP_DIR/pkg" >/dev/null 2>&1; then
  PAYLOAD_ROOT="$TMP_DIR/pkg"
else
  pkgutil --expand "$PKG_FILE" "$TMP_DIR/pkg" >/dev/null
  PAYLOAD_ROOT=""
fi

PAYLOAD_LIST="$(pkgutil --payload-files "$PKG_FILE")"

require_payload() {
  local path="$1"
  if ! printf '%s\n' "$PAYLOAD_LIST" | grep -Fqx "$path"; then
    echo "FAIL: package payload missing $path" >&2
    exit 1
  fi
}

require_payload "Library/Application Support/AW/bin/aw-server/aw-server"
require_payload "Library/Application Support/AW/bin/aw-word-watcher"
require_payload "Library/Application Support/AW/static/index.html"
require_payload "Library/Application Support/AW/manifest.xml"
require_payload "Library/Application Support/AW/uninstall.sh"

if [ -n "$PAYLOAD_ROOT" ]; then
  MANIFEST="$(find "$PAYLOAD_ROOT" -path '*/Library/Application Support/AW/manifest.xml' -type f | head -n 1)"
  if [ -z "$MANIFEST" ]; then
    echo "FAIL: expanded manifest not found" >&2
    exit 1
  fi

  grep -F "https://localhost:5201" "$MANIFEST" >/dev/null

  LEGACY_KEY_PREFIX="aw-local"
  LEGACY_HOST="localhost"
  LEGACY_PORT="3000"
  LOCAL_HOME="${HOME:-}"
  GREP_ARGS=(
    -e "${LEGACY_KEY_PREFIX}-dev-key"
    -e "${LEGACY_KEY_PREFIX}-admin-key"
    -e "${LEGACY_HOST}:${LEGACY_PORT}"
  )
  if [ -n "$LOCAL_HOME" ]; then
    GREP_ARGS+=(-e "$LOCAL_HOME")
  fi

  if grep -R -I -n "${GREP_ARGS[@]}" "$PAYLOAD_ROOT" >/dev/null; then
    echo "FAIL: package contains a development key, local path, or legacy dev host" >&2
    exit 1
  fi
fi

echo "Package verification passed: $PKG_FILE"
