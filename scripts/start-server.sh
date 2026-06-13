#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROXY_DIR="$ROOT_DIR/local-proxy"
VENV_DIR="$PROXY_DIR/.venv"
ENV_FILE="$PROXY_DIR/.env"
DIST_INDEX="$ROOT_DIR/addin/dist/index.html"
CERT_FILE="${AW_SERVER_CERT:-$HOME/.office-addin-dev-certs/localhost.crt}"
CERT_KEY_FILE="${AW_SERVER_CERT_KEY:-$HOME/.office-addin-dev-certs/localhost.key}"

if [ ! -x "$VENV_DIR/bin/python" ] || [ ! -f "$ENV_FILE" ]; then
  "$ROOT_DIR/scripts/setup-proxy.sh"
fi

if [ ! -f "$DIST_INDEX" ]; then
  echo "Building add-in static assets..."
  (cd "$ROOT_DIR" && npm run build)
fi

echo "Starting A\\W local server at https://localhost:5201"
echo "Static files: $ROOT_DIR/addin/dist"
echo "Runtime config: $PROXY_DIR/runtime.json"

cd "$PROXY_DIR"

if [ -f "$CERT_FILE" ] && [ -f "$CERT_KEY_FILE" ]; then
  exec "$VENV_DIR/bin/python" aw_server.py \
    --host 127.0.0.1 \
    --port 5201 \
    --static-dir "$ROOT_DIR/addin/dist" \
    --config "$PROXY_DIR/runtime.json" \
    --cert "$CERT_FILE" \
    --cert-key "$CERT_KEY_FILE"
fi

echo "Warning: Office dev certificate not found; starting without HTTPS."
exec "$VENV_DIR/bin/python" aw_server.py \
  --host 127.0.0.1 \
  --port 5201 \
  --static-dir "$ROOT_DIR/addin/dist" \
  --config "$PROXY_DIR/runtime.json"
