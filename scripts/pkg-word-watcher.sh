#!/usr/bin/env bash
set -euo pipefail

SYSTEM_DIR="${AW_SYSTEM_DIR:-/Library/Application Support/AW}"
USER_DIR="${AW_USER_DIR:-$HOME/Library/Application Support/AW}"
LOG_DIR="$USER_DIR/logs"
PID_DIR="$USER_DIR/pids"
SERVER_DIR="$SYSTEM_DIR/bin/aw-server"
SERVER_BIN="$SERVER_DIR/aw-server"
STATIC_DIR="$SYSTEM_DIR/static"
CONFIG_FILE="$USER_DIR/config.json"
CERT_FILE="$USER_DIR/certs/localhost.crt"
CERT_KEY_FILE="$USER_DIR/certs/localhost.key"
SERVER_PORT="${AW_SERVER_PORT:-5201}"
WORD_GRACE_SECONDS="${AW_WORD_GRACE_SECONDS:-10}"
SERVER_PID_FILE="$PID_DIR/aw-server.pid"
WATCHER_LOG="$LOG_DIR/watcher.log"
SERVER_LOG="$LOG_DIR/server.log"

mkdir -p "$LOG_DIR" "$PID_DIR"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$WATCHER_LOG"
}

word_is_running() {
  pgrep -x "Microsoft Word" >/dev/null 2>&1 || pgrep -f "/Microsoft Word.app/" >/dev/null 2>&1
}

pid_is_alive() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

server_pid() {
  [ -f "$SERVER_PID_FILE" ] && tr -d '[:space:]' < "$SERVER_PID_FILE" || true
}

SERVER_FAILURES=0
SERVER_LAST_START=0
SERVER_BACKOFF_MAX=300

start_server() {
  local pid
  pid="$(server_pid)"
  if pid_is_alive "$pid"; then
    SERVER_FAILURES=0
    SERVER_LAST_START=0
    return 0
  fi

  local now backoff
  now="$(date +%s)"

  if [ "$SERVER_FAILURES" -gt 0 ]; then
    backoff=$((1 << (SERVER_FAILURES - 1)))
    [ "$backoff" -gt "$SERVER_BACKOFF_MAX" ] && backoff="$SERVER_BACKOFF_MAX"
    if [ $((now - SERVER_LAST_START)) -lt "$backoff" ]; then
      return 0
    fi
  fi

  if [ ! -x "$SERVER_BIN" ]; then
    log "server binary missing: $SERVER_BIN"
    SERVER_FAILURES=$((SERVER_FAILURES + 1))
    SERVER_LAST_START="$now"
    return 1
  fi

  if [ ! -f "$CONFIG_FILE" ] || [ ! -f "$CERT_FILE" ] || [ ! -f "$CERT_KEY_FILE" ]; then
    log "runtime config or certificate missing"
    SERVER_FAILURES=$((SERVER_FAILURES + 1))
    SERVER_LAST_START="$now"
    return 1
  fi

  log "starting aw-server on ${SERVER_PORT} (attempt $((SERVER_FAILURES + 1)))"
  (
    cd "$USER_DIR"
    nohup "$SERVER_BIN" \
      --host 127.0.0.1 \
      --port "$SERVER_PORT" \
      --static-dir "$STATIC_DIR" \
      --config "$CONFIG_FILE" \
      --cert "$CERT_FILE" \
      --cert-key "$CERT_KEY_FILE" \
      >> "$SERVER_LOG" 2>&1 &
    echo "$!" > "$SERVER_PID_FILE"
  )

  SERVER_FAILURES=$((SERVER_FAILURES + 1))
  SERVER_LAST_START="$now"
}

stop_server() {
  local pid
  pid="$(server_pid)"
  if ! pid_is_alive "$pid"; then
    rm -f "$SERVER_PID_FILE"
    SERVER_FAILURES=0
    SERVER_LAST_START=0
    return 0
  fi

  log "stopping aw-server pid ${pid}"
  kill "$pid" >/dev/null 2>&1 || true
  for _ in {1..40}; do
    if ! pid_is_alive "$pid"; then
      rm -f "$SERVER_PID_FILE"
      SERVER_FAILURES=0
      SERVER_LAST_START=0
      return 0
    fi
    sleep 0.25
  done

  log "aw-server pid ${pid} did not exit; sending KILL"
  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$SERVER_PID_FILE"
  SERVER_FAILURES=0
  SERVER_LAST_START=0
}

trap stop_server EXIT INT TERM

log "watcher started"
missing_since=""

while true; do
  if word_is_running; then
    missing_since=""
    start_server || true
  else
    if [ -z "$missing_since" ]; then
      missing_since="$(date +%s)"
    fi

    now="$(date +%s)"
    if [ $((now - missing_since)) -ge "$WORD_GRACE_SECONDS" ]; then
      stop_server
    fi
  fi

  sleep 2
done
