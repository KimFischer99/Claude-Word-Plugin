#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.aw-runtime"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
WATCHER_PID_FILE="$PID_DIR/watcher.pid"
AGENT_LABEL="com.aw.word-watcher"
AGENT_PLIST="$HOME/Library/LaunchAgents/${AGENT_LABEL}.plist"

ADDIN_PORT=3000
PROXY_PORT=5201
WORD_GRACE_SECONDS="${AW_WORD_GRACE_SECONDS:-10}"

mkdir -p "$LOG_DIR" "$PID_DIR"

usage() {
  cat <<USAGE
Usage: ./scripts/dev-control.sh <command>

Commands:
  start         Arm a background Word watcher; ports open only while Word runs
  stop          Stop watcher and processes started by this script
  restart       Stop watcher/ports, then arm a background Word watcher
  status        Show port and managed PID status
  word-watch    Keep ports closed until Word runs; stop after Word fully quits
  word-session  Arm background watcher and open Microsoft Word
  agent-install Install and load a macOS LaunchAgent watcher
  agent-uninstall
                Unload and remove the macOS LaunchAgent watcher
  agent-status  Show macOS LaunchAgent watcher status
  force-start   Force both ports online without waiting for Word
  force-restart Stop then force both ports online

Environment:
  AW_WORD_GRACE_SECONDS=10  Seconds to wait after Word disappears before stopping
  AW_WORD_RUNNING=1         Test override: behave as if Word is running
USAGE
}

pid_file_for() {
  local name="$1"
  printf "%s/%s.pid" "$PID_DIR" "$name"
}

log_file_for() {
  local name="$1"
  printf "%s/%s.log" "$LOG_DIR" "$name"
}

port_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

is_pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

managed_pid() {
  local name="$1"
  local file
  file="$(pid_file_for "$name")"
  [ -f "$file" ] && tr -d '[:space:]' < "$file" || true
}

watcher_pid() {
  [ -f "$WATCHER_PID_FILE" ] && tr -d '[:space:]' < "$WATCHER_PID_FILE" || true
}

wait_for_port() {
  local name="$1"
  local port="$2"
  local log_file
  log_file="$(log_file_for "$name")"

  for _ in {1..80}; do
    if [ -n "$(port_pid "$port")" ]; then
      return 0
    fi
    sleep 0.25
  done

  echo "Failed to start ${name} on port ${port}. Last log lines:"
  tail -n 30 "$log_file" 2>/dev/null || true
  return 1
}

stop_listener() {
  local name="$1"
  local port="$2"
  local pid="$3"

  echo "Stopping ${name} PID ${pid}..."
  kill "$pid" 2>/dev/null || true

  for _ in {1..40}; do
    if [ -z "$(port_pid "$port")" ]; then
      echo "${name}: stopped"
      return 0
    fi
    sleep 0.25
  done

  local listener
  listener="$(port_pid "$port")"
  if [ -n "$listener" ]; then
    echo "${name}: PID ${listener} did not stop after TERM; sending KILL"
    kill -9 "$listener" 2>/dev/null || true
  fi

  for _ in {1..20}; do
    if [ -z "$(port_pid "$port")" ]; then
      echo "${name}: stopped"
      return 0
    fi
    sleep 0.25
  done

  listener="$(port_pid "$port")"
  echo "${name}: port ${port} is still listening on PID ${listener}"
  return 1
}

start_service() {
  local name="$1"
  local port="$2"
  shift 2

  local existing_pid
  existing_pid="$(port_pid "$port")"
  if [ -n "$existing_pid" ]; then
    local existing_managed
    existing_managed="$(managed_pid "$name")"
    if [ -n "$existing_managed" ] && [ "$existing_managed" = "$existing_pid" ]; then
      echo "${name}: port ${port} already listening on PID ${existing_pid} (managed)"
      return 0
    fi

    rm -f "$(pid_file_for "$name")"
    echo "${name}: port ${port} already listening on PID ${existing_pid}; not managed by this script"
    return 1
  fi

  local pid_file log_file
  pid_file="$(pid_file_for "$name")"
  log_file="$(log_file_for "$name")"

  echo "Starting ${name} on port ${port}..."
  (
    cd "$ROOT_DIR"
    nohup "$@" > "$log_file" 2>&1 &
  )

  wait_for_port "$name" "$port"
  port_pid "$port" > "$pid_file"
  echo "${name}: ready on port ${port} (PID $(managed_pid "$name"))"
}

stop_service() {
  local name="$1"
  local port="$2"
  local force="${3:-0}"
  local pid_file pid
  pid_file="$(pid_file_for "$name")"
  pid="$(managed_pid "$name")"

  if [ -z "$pid" ]; then
    local listener
    listener="$(port_pid "$port")"
    if [ -n "$listener" ]; then
      if [ "$force" = "1" ]; then
        stop_listener "$name" "$port" "$listener" || true
      else
        echo "${name}: port ${port} is listening on PID ${listener}, but it was not started by dev-control."
      fi
    else
      echo "${name}: not running"
    fi
    return 0
  fi

  local current_listener
  current_listener="$(port_pid "$port")"
  if [ -z "$current_listener" ]; then
    echo "${name}: not listening on ${port}"
    rm -f "$pid_file"
    return 0
  fi

  if [ "$current_listener" != "$pid" ]; then
    if [ "$force" = "1" ]; then
      echo "${name}: port ${port} is listening on PID ${current_listener}, not managed PID ${pid}; reclaiming it"
      stop_listener "$name" "$port" "$current_listener" || true
    else
      echo "${name}: port ${port} is listening on PID ${current_listener}, not managed PID ${pid}; leaving it untouched"
    fi
    rm -f "$pid_file"
    return 0
  fi

  stop_listener "$name" "$port" "$pid" || true
  rm -f "$pid_file"
}

start_all() {
  if ! start_service "proxy" "$PROXY_PORT" "$ROOT_DIR/scripts/start-proxy.sh"; then
    return 1
  fi

  if ! start_service "addin" "$ADDIN_PORT" "$ROOT_DIR/scripts/start-addin.sh"; then
    stop_service "proxy" "$PROXY_PORT" 1
    return 1
  fi

  echo "A\\W dev ports are ready:"
  echo "  add-in: https://localhost:${ADDIN_PORT}/"
  echo "  proxy:  http://127.0.0.1:${PROXY_PORT}"
}

stop_all() {
  local force="${1:-0}"
  stop_service "addin" "$ADDIN_PORT" "$force"
  stop_service "proxy" "$PROXY_PORT" "$force"
}

services_are_listening() {
  [ -n "$(port_pid "$ADDIN_PORT")" ] || [ -n "$(port_pid "$PROXY_PORT")" ]
}

status_service() {
  local name="$1"
  local port="$2"
  local listener managed
  listener="$(port_pid "$port")"
  managed="$(managed_pid "$name")"

  if [ -n "$listener" ]; then
    if [ -n "$managed" ] && [ "$listener" = "$managed" ]; then
      echo "${name}: listening on ${port}, managed PID ${listener}"
    else
      echo "${name}: listening on ${port}, PID ${listener}"
    fi
  else
    echo "${name}: not listening on ${port}"
  fi
}

status_all() {
  agent_status

  local watcher=""
  if agent_is_loaded; then
    echo "watcher: managed by LaunchAgent"
  else
    watcher="$(watcher_pid)"
  fi

  if [ -n "$watcher" ] && is_pid_alive "$watcher"; then
    echo "watcher: running, PID ${watcher}"
  elif [ -n "$watcher" ]; then
    echo "watcher: not running"
    rm -f "$WATCHER_PID_FILE"
  elif ! agent_is_loaded; then
    echo "watcher: not running"
    rm -f "$WATCHER_PID_FILE"
  fi

  if agent_is_loaded && command -v launchctl >/dev/null 2>&1; then
    launchctl print "$(agent_target)" 2>/dev/null | awk '
      /^[[:space:]]*state = / && !state_seen {
        print "agent state: " $3
        state_seen = 1
      }
      /^[[:space:]]*pid = / && !pid_seen {
        print "agent pid: " $3
        pid_seen = 1
      }
    '
  fi

  if word_is_running; then
    echo "word detected by current shell: running"
  else
    echo "word detected by current shell: not running"
  fi

  status_service "addin" "$ADDIN_PORT"
  status_service "proxy" "$PROXY_PORT"
}

agent_domain() {
  printf "gui/%s" "$(id -u)"
}

agent_target() {
  printf "%s/%s" "$(agent_domain)" "$AGENT_LABEL"
}

agent_is_loaded() {
  command -v launchctl >/dev/null 2>&1 && launchctl print "$(agent_target)" >/dev/null 2>&1
}

write_agent_plist() {
  local agent_path
  agent_path="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"

  mkdir -p "$(dirname "$AGENT_PLIST")"
  cat > "$AGENT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${ROOT_DIR}/scripts/dev-control.sh</string>
    <string>word-watch</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${agent_path}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/launch-agent.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/launch-agent.err.log</string>
</dict>
</plist>
PLIST
}

install_agent() {
  if ! command -v launchctl >/dev/null 2>&1; then
    echo "launchctl not found; falling back to background watcher."
    start_watcher
    return 0
  fi

  write_agent_plist

  if agent_is_loaded; then
    launchctl bootout "$(agent_domain)" "$AGENT_PLIST" >/dev/null 2>&1 || true
  fi

  launchctl bootstrap "$(agent_domain)" "$AGENT_PLIST"
  launchctl enable "$(agent_target)" >/dev/null 2>&1 || true
  launchctl kickstart -k "$(agent_target)" >/dev/null 2>&1 || true

  echo "agent: installed and loaded (${AGENT_LABEL})"
  echo "agent plist: ${AGENT_PLIST}"
  echo "agent log: ${LOG_DIR}/launch-agent.log"
}

unload_agent() {
  if command -v launchctl >/dev/null 2>&1 && agent_is_loaded; then
    launchctl bootout "$(agent_domain)" "$AGENT_PLIST" >/dev/null 2>&1 || true
    echo "agent: unloaded (${AGENT_LABEL})"
  else
    echo "agent: not loaded"
  fi
}

uninstall_agent() {
  unload_agent
  rm -f "$AGENT_PLIST"
  echo "agent: uninstalled (${AGENT_LABEL})"
}

agent_status() {
  if [ -f "$AGENT_PLIST" ]; then
    echo "agent plist: installed at ${AGENT_PLIST}"
  else
    echo "agent plist: not installed"
  fi

  if agent_is_loaded; then
    echo "agent: loaded (${AGENT_LABEL})"
  else
    echo "agent: not loaded"
  fi
}

word_is_running() {
  if [ "${AW_WORD_RUNNING:-}" = "1" ]; then
    return 0
  fi

  if command -v osascript >/dev/null 2>&1; then
    local result
    result="$(osascript -e 'application id "com.microsoft.Word" is running' 2>/dev/null || true)"
    if [ "$result" = "true" ]; then
      return 0
    fi

    result="$(osascript -e 'application "Microsoft Word" is running' 2>/dev/null || true)"
    if [ "$result" = "true" ]; then
      return 0
    fi
  fi

  pgrep -x "Microsoft Word" >/dev/null 2>&1 && return 0
  pgrep -f "Microsoft Word.app" >/dev/null 2>&1 && return 0

  ps -axo comm= 2>/dev/null | grep -Fxq "Microsoft Word"
}

word_watch() {
  if ! word_is_running; then
    stop_all 1
  fi

  echo "Watching Microsoft Word."
  echo "Ports stay closed until Word runs, then stop after Word quits for ${WORD_GRACE_SECONDS}s."
  echo "Press Ctrl+C to stop watcher and services."

  trap 'stop_all 1; exit 130' INT TERM

  while true; do
    if word_is_running; then
      if ! services_are_listening; then
        start_all
      fi
    elif services_are_listening; then
      sleep "$WORD_GRACE_SECONDS"
      if ! word_is_running; then
        stop_all 1
      fi
    fi

    sleep 2
  done
}

start_watcher() {
  local existing
  existing="$(watcher_pid)"

  if is_pid_alive "$existing"; then
    echo "watcher: already running, PID ${existing}"
    return 0
  fi

  rm -f "$WATCHER_PID_FILE"
  echo "Starting background Word watcher..."
  (
    cd "$ROOT_DIR"
    nohup "$ROOT_DIR/scripts/dev-control.sh" word-watch > "$(log_file_for watcher)" 2>&1 &
    echo "$!" > "$WATCHER_PID_FILE"
  )

  sleep 0.5
  existing="$(watcher_pid)"
  if is_pid_alive "$existing"; then
    echo "watcher: running, PID ${existing}"
    echo "watcher log: $(log_file_for watcher)"
    return 0
  fi

  echo "watcher: failed to start. Last log lines:"
  tail -n 30 "$(log_file_for watcher)" 2>/dev/null || true
  return 1
}

stop_watcher() {
  local pid
  pid="$(watcher_pid)"

  if ! is_pid_alive "$pid"; then
    echo "watcher: not running"
    rm -f "$WATCHER_PID_FILE"
    return 0
  fi

  echo "Stopping watcher PID ${pid}..."
  kill "$pid" 2>/dev/null || true

  for _ in {1..40}; do
    if ! is_pid_alive "$pid"; then
      rm -f "$WATCHER_PID_FILE"
      echo "watcher: stopped"
      return 0
    fi
    sleep 0.25
  done

  echo "watcher: PID ${pid} did not stop after TERM; sending KILL"
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$WATCHER_PID_FILE"
}

word_session() {
  start_watcher

  if command -v open >/dev/null 2>&1; then
    open -a "Microsoft Word" >/dev/null 2>&1 || true
  fi
}

command="${1:-status}"

case "$command" in
  start|ensure)
    start_watcher
    ;;
  stop)
    unload_agent
    stop_watcher
    stop_all 1
    ;;
  restart)
    unload_agent
    stop_watcher
    stop_all 1
    start_watcher
    ;;
  status)
    status_all
    ;;
  word-watch|watch)
    word_watch
    ;;
  word-session)
    word_session
    ;;
  agent-install)
    install_agent
    ;;
  agent-uninstall)
    uninstall_agent
    ;;
  agent-status)
    agent_status
    ;;
  force-start)
    start_all
    ;;
  force-restart)
    stop_all 1
    start_all
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
