#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -z "${GOOSE_CODEX_BIN:-}" && -x "$HOME/.local/share/icodex/codex" ]]; then
  export GOOSE_CODEX_BIN="$HOME/.local/share/icodex/codex"
fi

if [[ -z "${GOOSE_CODEX_BIN:-}" ]] && ! command -v codex >/dev/null; then
  echo "error: codex not found on PATH (install it or set GOOSE_CODEX_BIN)" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  pnpm install
fi

exec pnpm run start-gui
