#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -z "${GOOSE_CODEX_BIN:-}" ]] && ! command -v codex >/dev/null; then
  echo "error: codex not found on PATH (install it or set GOOSE_CODEX_BIN)" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  pnpm install
fi

# Serves the renderer and the codex bridge on one port (default 5173).
# Override with GOOSE_WEB_PORT / GOOSE_WEB_HOST. Set GOOSE_WEB_TOKEN to
# require a token; unset, the loopback host serves without one.
exec pnpm run start-web
