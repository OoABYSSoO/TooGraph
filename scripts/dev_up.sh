#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-3477}"
BACKEND_PORT="${BACKEND_PORT:-8765}"

BACKEND_LOG="$ROOT_DIR/.dev_backend.log"
FRONTEND_LOG="$ROOT_DIR/.dev_frontend.log"

backend_pid=""
frontend_pid=""

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

cd "$ROOT_DIR/backend"
python3 -m uvicorn app.main:app --reload --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
backend_pid=$!

cd "$ROOT_DIR/frontend"
NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:$BACKEND_PORT" npm run dev -- --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
frontend_pid=$!

sleep 2

echo
echo "GraphiteUI services started."
echo "Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo "Backend:  http://127.0.0.1:$BACKEND_PORT"
echo
echo "Press Ctrl+C to stop both services."
echo

wait "$backend_pid" "$frontend_pid"
