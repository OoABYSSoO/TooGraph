#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-3477}"
BACKEND_PORT="${BACKEND_PORT:-8765}"

BACKEND_LOG="$ROOT_DIR/.dev_backend.log"
FRONTEND_LOG="$ROOT_DIR/.dev_frontend.log"

backend_pid=""
frontend_pid=""
cleanup_done=0

port_in_use() {
  ss -ltn "( sport = :$1 )" | tail -n +2 | grep -q .
}

print_port_owner() {
  echo "Port $1 is already in use:"
  ss -ltnp "( sport = :$1 )" || true
}

kill_port_owner() {
  local port=$1
  local pids
  pids="$(fuser "${port}/tcp" 2>/dev/null || true)"
  [[ -z "$pids" ]] && return 0

  echo "Releasing port $port used by PID(s): $pids"
  kill $pids 2>/dev/null || true
  sleep 1

  if port_in_use "$port"; then
    echo "Port $port is still busy after graceful stop, forcing termination."
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

wait_for_http() {
  local url=$1 retries=${2:-20} delay=${3:-0.5}
  for ((i = 1; i <= retries; i++)); do
    curl --noproxy '*' -fsS "$url" >/dev/null 2>&1 && return 0
    sleep "$delay"
  done
  return 1
}

stop_process_tree() {
  local pid=$1
  [[ -z "$pid" ]] && return 0
  kill -0 "$pid" 2>/dev/null || return 0

  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true

  local waited=0
  while kill -0 "$pid" 2>/dev/null && ((waited < 5)); do
    sleep 1
    ((waited++))
  done
  if kill -0 "$pid" 2>/dev/null; then
    pkill -9 -P "$pid" 2>/dev/null || true
    kill -9 "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  # Disable errexit — we must run to completion regardless of individual command failures
  set +e

  [[ "$cleanup_done" -eq 1 ]] && return
  cleanup_done=1

  echo
  echo "Stopping GraphiteUI services..."

  stop_process_tree "$frontend_pid"
  stop_process_tree "$backend_pid"

  wait 2>/dev/null
  echo "Services stopped."
}

drop_to_shell() {
  set +e
  trap - EXIT INT TERM
  cd "$ROOT_DIR"
  exec "$SHELL"
}

trap 'cleanup; drop_to_shell' INT TERM
trap cleanup EXIT

echo "Starting GraphiteUI dev environment..."
echo "  Backend port : $BACKEND_PORT"
echo "  Frontend port: $FRONTEND_PORT"
echo "  Backend log  : $BACKEND_LOG"
echo "  Frontend log : $FRONTEND_LOG"
echo

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if port_in_use "$port"; then
    print_port_owner "$port"
    kill_port_owner "$port"
    if port_in_use "$port"; then
      print_port_owner "$port"
      echo "Failed to release port $port."
      exit 1
    fi
  fi
done

cd "$ROOT_DIR/backend"
python3 -m uvicorn app.main:app --reload --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
backend_pid=$!

cd "$ROOT_DIR/frontend"
INTERNAL_API_BASE_URL="http://127.0.0.1:$BACKEND_PORT" \
  npm run dev -- --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
frontend_pid=$!

if ! wait_for_http "http://127.0.0.1:$BACKEND_PORT/health" 20 0.5; then
  echo "Backend failed to start. Check $BACKEND_LOG"
  tail -20 "$BACKEND_LOG" 2>/dev/null || true
  exit 1
fi

if ! wait_for_http "http://127.0.0.1:$FRONTEND_PORT" 30 0.5; then
  echo "Frontend failed to start. Check $FRONTEND_LOG"
  tail -20 "$FRONTEND_LOG" 2>/dev/null || true
  exit 1
fi

echo
echo "GraphiteUI services started."
echo "  Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo "  Backend:  http://127.0.0.1:$BACKEND_PORT"
echo
echo "Press Ctrl+C to stop both services."
echo

# Disable errexit before the wait loop — signal interrupts cause wait to
# return non-zero, and we need the INT trap to handle shutdown, not set -e.
set +e
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  wait -n 2>/dev/null || true
done

# If we get here, one of the processes died on its own
if ! kill -0 "$backend_pid" 2>/dev/null; then
  echo "Backend process exited unexpectedly. Check $BACKEND_LOG"
  tail -20 "$BACKEND_LOG" 2>/dev/null
fi
if ! kill -0 "$frontend_pid" 2>/dev/null; then
  echo "Frontend process exited unexpectedly. Check $FRONTEND_LOG"
  tail -20 "$FRONTEND_LOG" 2>/dev/null
fi

cleanup
drop_to_shell
