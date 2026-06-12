#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/addin/manifest.xml"
WEF_DIRS=(
  "$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
  "$HOME/Library/Containers/com.microsoft.Word/Data/Documents/Office Add-ins"
)

for WEF_DIR in "${WEF_DIRS[@]}"; do
  mkdir -p "$WEF_DIR"
  cp "$MANIFEST" "$WEF_DIR/aw-manifest.xml"
  echo "Copied manifest to:"
  echo "$WEF_DIR/aw-manifest.xml"
done

echo "Restart Word, open a document, then choose Home > Add-ins > A\\W."
