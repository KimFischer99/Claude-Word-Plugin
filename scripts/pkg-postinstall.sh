#!/usr/bin/env bash
set -euo pipefail

SYSTEM_DIR="/Library/Application Support/AW"
USER_NAME="$(stat -f%Su /dev/console)"
USER_HOME="$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory | awk '{print $2}')"
USER_UID="$(id -u "$USER_NAME")"
USER_GID="$(id -g "$USER_NAME")"
USER_DIR="$USER_HOME/Library/Application Support/AW"
AGENT_LABEL="com.aw.word-watcher"
AGENT_PLIST="$USER_HOME/Library/LaunchAgents/${AGENT_LABEL}.plist"
WEF_DIR="$USER_HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
OFFICE_ADDINS_DIR="$USER_HOME/Library/Containers/com.microsoft.Word/Data/Documents/Office Add-ins"
CONFIG_FILE="$USER_DIR/config.json"
ENV_FILE="$USER_DIR/.env"
CERT_DIR="$USER_DIR/certs"
CERT_FILE="$CERT_DIR/localhost.crt"
CERT_KEY_FILE="$CERT_DIR/localhost.key"
DATA_DIR="$USER_DIR/data"
LOG_DIR="$USER_DIR/logs"

if [ "$USER_NAME" = "root" ] || [ -z "$USER_HOME" ]; then
  echo "A\\W install requires a logged-in macOS user." >&2
  exit 1
fi

read_config_value() {
  local key="$1"
  local value=""

  if [ -x /usr/bin/plutil ]; then
    value="$(/usr/bin/plutil -extract "$key" raw -o - "$CONFIG_FILE" 2>/dev/null || true)"
  fi

  if [ -z "$value" ]; then
    value="$(sed -nE "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\\1/p" "$CONFIG_FILE" | head -n 1)"
  fi

  printf '%s' "$value"
}

write_config() {
  local api_key="$1"
  local admin_key="$2"

  cat > "$CONFIG_FILE" <<EOF
{
  "baseUrl": "/aw-proxy",
  "apiKey": "$api_key",
  "adminKey": "$admin_key"
}
EOF
}

install -d -m 0755 "$USER_DIR" "$CERT_DIR" "$DATA_DIR" "$LOG_DIR" "$USER_HOME/Library/LaunchAgents" "$WEF_DIR" "$OFFICE_ADDINS_DIR"
chown -R "$USER_UID:$USER_GID" "$USER_DIR" "$USER_HOME/Library/LaunchAgents" "$WEF_DIR" "$OFFICE_ADDINS_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  API_KEY="$(openssl rand -hex 24)"
  ADMIN_KEY="$(openssl rand -hex 24)"
  write_config "$API_KEY" "$ADMIN_KEY"
else
  API_KEY="$(read_config_value apiKey)"
  ADMIN_KEY="$(read_config_value adminKey)"
  if [ -z "$API_KEY" ] || [ -z "$ADMIN_KEY" ]; then
    API_KEY="$(openssl rand -hex 24)"
    ADMIN_KEY="$(openssl rand -hex 24)"
    write_config "$API_KEY" "$ADMIN_KEY"
  fi
fi

cat > "$ENV_FILE" <<EOF
HOST=127.0.0.1
PORT=5201
DATA_FOLDER=$DATA_DIR
API_KEYS=$API_KEY
ADMIN_API_KEYS=$ADMIN_KEY
LOG_LEVEL=INFO
LOG_TO_FILE=true
LOG_FILE_PATH=$LOG_DIR/aw.log
DEFAULT_LANGUAGE=en
EOF

if [ ! -f "$CERT_FILE" ] || [ ! -f "$CERT_KEY_FILE" ]; then
  CERT_CONFIG="$(mktemp)"
  cat > "$CERT_CONFIG" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = A-W Localhost

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:TRUE
keyUsage = digitalSignature, keyEncipherment, keyCertSign
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
EOF
  openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
    -keyout "$CERT_KEY_FILE" \
    -out "$CERT_FILE" \
    -config "$CERT_CONFIG"
  rm -f "$CERT_CONFIG"
fi

chmod 0600 "$CERT_KEY_FILE" "$CONFIG_FILE" "$ENV_FILE"
chmod 0644 "$CERT_FILE"
chown -R "$USER_UID:$USER_GID" "$USER_DIR"

security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CERT_FILE" >/dev/null 2>&1 || true

cp "$SYSTEM_DIR/manifest.xml" "$WEF_DIR/aw-manifest.xml"
cp "$SYSTEM_DIR/manifest.xml" "$OFFICE_ADDINS_DIR/aw-manifest.xml"
chown "$USER_UID:$USER_GID" "$WEF_DIR/aw-manifest.xml" "$OFFICE_ADDINS_DIR/aw-manifest.xml"

cat > "$AGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SYSTEM_DIR/bin/aw-word-watcher</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AW_PREWARM_SECONDS</key>
    <string>300</string>
    <key>AW_WORD_GRACE_SECONDS</key>
    <string>300</string>
    <key>AW_WORD_POLL_SECONDS</key>
    <string>0.5</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchagent.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchagent.err.log</string>
</dict>
</plist>
EOF

chmod 0644 "$AGENT_PLIST"
chown "$USER_UID:$USER_GID" "$AGENT_PLIST"

launchctl bootout "gui/$USER_UID/$AGENT_LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$USER_UID" "$AGENT_PLIST" >/dev/null 2>&1 || true
launchctl enable "gui/$USER_UID/$AGENT_LABEL" >/dev/null 2>&1 || true
if ! launchctl bootstrap "gui/$USER_UID" "$AGENT_PLIST"; then
  sleep 1
  launchctl bootout "gui/$USER_UID/$AGENT_LABEL" >/dev/null 2>&1 || true
  launchctl bootout "gui/$USER_UID" "$AGENT_PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$USER_UID" "$AGENT_PLIST"
fi
launchctl kickstart -k "gui/$USER_UID/$AGENT_LABEL" >/dev/null 2>&1 || true

echo "A\\W Word add-in installed for $USER_NAME."
