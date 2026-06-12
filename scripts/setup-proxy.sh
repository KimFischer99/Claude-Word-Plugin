#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROXY_DIR="$ROOT_DIR/local-proxy"
VENV_DIR="$PROXY_DIR/.venv"
ENV_FILE="$PROXY_DIR/.env"
RUNTIME_FILE="$PROXY_DIR/runtime.json"
DATA_DIR="$PROXY_DIR/data"

mkdir -p "$DATA_DIR"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install -r "$PROXY_DIR/requirements.txt"

cat > "$ENV_FILE" <<EOF
HOST=127.0.0.1
PORT=5201
DATA_FOLDER=$DATA_DIR
API_KEYS=aw-local-dev-key
ADMIN_API_KEYS=aw-local-admin-key
LOG_LEVEL=INFO
LOG_TO_FILE=true
LOG_FILE_PATH=$PROXY_DIR/logs/aw.log
DEFAULT_LANGUAGE=en
EOF

cat > "$RUNTIME_FILE" <<EOF
{
  "baseUrl": "http://127.0.0.1:5201",
  "apiKey": "aw-local-dev-key",
  "adminKey": "aw-local-admin-key"
}
EOF

echo "Local proxy is ready."
echo "Config: $ENV_FILE"
echo "Runtime keys: $RUNTIME_FILE"
