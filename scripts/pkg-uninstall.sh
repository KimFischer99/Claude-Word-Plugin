#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

PURGE_DATA=0
if [ "${1:-}" = "--purge-data" ]; then
  PURGE_DATA=1
fi

SYSTEM_DIR="/Library/Application Support/AW"
USER_NAME="$(stat -f%Su /dev/console)"
USER_HOME="$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory | awk '{print $2}')"
USER_UID="$(id -u "$USER_NAME")"
USER_DIR="$USER_HOME/Library/Application Support/AW"
AGENT_LABEL="com.aw.word-watcher"
AGENT_PLIST="$USER_HOME/Library/LaunchAgents/${AGENT_LABEL}.plist"
SERVER_PID_FILE="$USER_DIR/pids/aw-server.pid"
WEF_MANIFEST="$USER_HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef/aw-manifest.xml"
OFFICE_ADDINS_MANIFEST="$USER_HOME/Library/Containers/com.microsoft.Word/Data/Documents/Office Add-ins/aw-manifest.xml"

run_as_user() {
  launchctl asuser "$USER_UID" sudo -u "$USER_NAME" "$@" >/dev/null 2>&1 || "$@" >/dev/null 2>&1 || true
}

launchctl bootout "gui/$USER_UID" "$AGENT_PLIST" >/dev/null 2>&1 || true
rm -f "$AGENT_PLIST"

if [ -f "$SERVER_PID_FILE" ]; then
  SERVER_PID="$(tr -d '[:space:]' < "$SERVER_PID_FILE" || true)"
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$SERVER_PID_FILE"
fi

run_as_user rm -f "$WEF_MANIFEST" "$OFFICE_ADDINS_MANIFEST"
security delete-certificate -c "A-W Localhost" /Library/Keychains/System.keychain >/dev/null 2>&1 || true
rm -rf "$SYSTEM_DIR"

if [ "$PURGE_DATA" -eq 1 ]; then
  rm -rf "$USER_DIR"
  echo "A\\W uninstalled and user data removed."
else
  echo "A\\W uninstalled. User data preserved at: $USER_DIR"
  echo "Run with --purge-data to remove saved accounts, logs, config, and certificates."
fi
