#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORKING_DIR="$(pwd)"
WEB_PORT="${GOOSE_WEB_PORT:-5173}"
SERVER_PORT="${GOOSE_SERVER_PORT:-3284}"

cd "$REPO_ROOT"
source bin/activate-hermit
SERVER_SECRET="${GOOSE_SERVER__SECRET_KEY:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}"

just release-binary

GOOSE_SERVER__SECRET_KEY="$SERVER_SECRET" \
  "$REPO_ROOT/target/release/goose" serve \
  --platform desktop \
  --host 127.0.0.1 \
  --port "$SERVER_PORT" \
  --allowed-origin "http://127.0.0.1:$WEB_PORT" \
  --allowed-origin "http://localhost:$WEB_PORT" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in {1..100}; do
  if curl --silent --fail "http://127.0.0.1:$SERVER_PORT/status" >/dev/null; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID"
    exit 1
  fi
  sleep 0.1
done

if ! curl --silent --fail "http://127.0.0.1:$SERVER_PORT/status" >/dev/null; then
  echo "goose serve did not become ready on port $SERVER_PORT" >&2
  exit 1
fi

echo "Goose Web: http://127.0.0.1:$WEB_PORT"

cd "$REPO_ROOT/ui/desktop"
VITE_GOOSE_ACP_URL="ws://127.0.0.1:$SERVER_PORT/acp" \
VITE_GOOSE_SECRET_KEY="$SERVER_SECRET" \
VITE_GOOSE_WORKING_DIR="$WORKING_DIR" \
pnpm install

VITE_GOOSE_ACP_URL="ws://127.0.0.1:$SERVER_PORT/acp" \
VITE_GOOSE_SECRET_KEY="$SERVER_SECRET" \
VITE_GOOSE_WORKING_DIR="$WORKING_DIR" \
GOOSE_WEB_PORT="$WEB_PORT" \
pnpm run start-web
