#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROXY_DIR="$ROOT_DIR/local-proxy"
VENV_DIR="$PROXY_DIR/.venv"
ENV_FILE="$PROXY_DIR/.env"

if [ ! -x "$VENV_DIR/bin/python" ] || [ ! -f "$ENV_FILE" ]; then
  "$ROOT_DIR/scripts/setup-proxy.sh"
fi

echo "Starting local Claude proxy at http://127.0.0.1:5201"
echo "Admin key: aw-local-admin-key"
echo "API key: aw-local-dev-key"
echo "Open the A\\W sidebar settings to configure accounts."

cd "$PROXY_DIR"
exec "$VENV_DIR/bin/python" -m uvicorn aw_proxy:app --host 127.0.0.1 --port 5201
