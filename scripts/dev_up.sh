#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-3477}"
BACKEND_PORT="${BACKEND_PORT:-8765}"

BACKEND_LOG="$ROOT_DIR/.dev_backend.log"
FRONTEND_LOG="$ROOT_DIR/.dev_frontend.log"

backend_pid=""
frontend_pid=""

port_in_use() {
  local port=$1
  ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .
}

print_port_owner() {
  local port=$1
  echo "Port $port is already in use:"
  ss -ltnp "( sport = :$port )" || true
}

kill_port_owner() {
  local port=$1
  local pids

  pids="$(fuser "${port}/tcp" 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

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
  local url=$1
  local retries=${2:-20}
  local delay=${3:-0.5}

  for ((i = 1; i <= retries; i++)); do
    if curl --noproxy '*' -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

cleanup() {
  local exit_code=$?

  if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi

  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

echo "Starting GraphiteUI dev environment..."
echo "Backend port: $BACKEND_PORT"
echo "Frontend port: $FRONTEND_PORT"
echo "Backend log: $BACKEND_LOG"
echo "Frontend log: $FRONTEND_LOG"

if port_in_use "$BACKEND_PORT"; then
  print_port_owner "$BACKEND_PORT"
  kill_port_owner "$BACKEND_PORT"
fi

if port_in_use "$FRONTEND_PORT"; then
  print_port_owner "$FRONTEND_PORT"
  kill_port_owner "$FRONTEND_PORT"
fi

if port_in_use "$BACKEND_PORT"; then
  print_port_owner "$BACKEND_PORT"
  echo "Failed to release backend port $BACKEND_PORT."
  exit 1
fi

if port_in_use "$FRONTEND_PORT"; then
  print_port_owner "$FRONTEND_PORT"
  echo "Failed to release frontend port $FRONTEND_PORT."
  exit 1
fi

cd "$ROOT_DIR/backend"
python3 -m uvicorn app.main:app --reload --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
backend_pid=$!

cd "$ROOT_DIR/frontend"
NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:$BACKEND_PORT" npm run dev -- --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
frontend_pid=$!

if ! wait_for_http "http://127.0.0.1:$BACKEND_PORT/health" 20 0.5; then
  echo "Backend failed to start. Check $BACKEND_LOG"
  exit 1
fi

if ! wait_for_http "http://127.0.0.1:$FRONTEND_PORT" 30 0.5; then
  echo "Frontend failed to start. Check $FRONTEND_LOG"
  exit 1
fi

echo
echo "GraphiteUI services started."
echo "Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo "Backend:  http://127.0.0.1:$BACKEND_PORT"
echo
echo "Press Ctrl+C to stop both services."
echo

wait "$backend_pid" "$frontend_pid"
