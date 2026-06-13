#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(/usr/bin/python3 -c 'import json; print(json.load(open("package.json"))["version"])' < /dev/null)"
BUILD_DIR="$ROOT_DIR/build"
PKG_ROOT="$BUILD_DIR/pkg-root"
PKG_SCRIPTS="$BUILD_DIR/pkg-scripts"
SYSTEM_DIR="$PKG_ROOT/Library/Application Support/AW"
OUTPUT_PKG="$ROOT_DIR/A-W-Installer-${VERSION}.pkg"
PROXY_DIR="$ROOT_DIR/local-proxy"
VENV_DIR="$PROXY_DIR/.venv"

cd "$ROOT_DIR"

"$ROOT_DIR/scripts/check-sanitized.sh"
npm run typecheck
npm run build

if [ ! -x "$VENV_DIR/bin/python" ]; then
  "$ROOT_DIR/scripts/setup-proxy.sh"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install pyinstaller

rm -rf "$BUILD_DIR"
mkdir -p "$SYSTEM_DIR/bin" "$SYSTEM_DIR/static" "$PKG_SCRIPTS"

(
  cd "$PROXY_DIR"
  "$VENV_DIR/bin/pyinstaller" \
    --noconfirm \
    --clean \
    --distpath "$BUILD_DIR/pyinstaller-dist" \
    --workpath "$BUILD_DIR/pyinstaller-work" \
    aw_server.spec
)

cp -R "$BUILD_DIR/pyinstaller-dist/aw-server" "$SYSTEM_DIR/bin/aw-server"
cp "$ROOT_DIR/scripts/pkg-word-watcher.sh" "$SYSTEM_DIR/bin/aw-word-watcher"
cp "$ROOT_DIR/scripts/pkg-uninstall.sh" "$SYSTEM_DIR/uninstall.sh"
chmod 0755 "$SYSTEM_DIR/bin/aw-word-watcher" "$SYSTEM_DIR/uninstall.sh"

cp -R "$ROOT_DIR/addin/dist/." "$SYSTEM_DIR/static/"
sed "s/__PORT__/5201/g" "$ROOT_DIR/addin/manifest.xml.template" > "$SYSTEM_DIR/manifest.xml"

cp "$ROOT_DIR/scripts/pkg-postinstall.sh" "$PKG_SCRIPTS/postinstall"
chmod 0755 "$PKG_SCRIPTS/postinstall"

rm -f "$OUTPUT_PKG"
pkgbuild \
  --root "$PKG_ROOT" \
  --scripts "$PKG_SCRIPTS" \
  --identifier com.aw.word-addin \
  --version "$VERSION" \
  --install-location / \
  "$OUTPUT_PKG"

"$ROOT_DIR/scripts/verify-package.sh" "$OUTPUT_PKG"
echo "Built installer: $OUTPUT_PKG"
