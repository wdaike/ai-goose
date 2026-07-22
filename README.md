# goose

goose is an Electron desktop frontend for OpenAI's [Codex](https://github.com/openai/codex) app-server. Codex owns everything backend-shaped — inference, tool execution, MCP, conversation storage, config — while goose provides the desktop UI.

## How it works

The Electron main process spawns `codex app-server` (from `PATH` or `GOOSE_CODEX_BIN`) and bridges its stdio JSONL JSON-RPC to the renderer over IPC. The renderer speaks the app-server v2 protocol directly.

```
desktop/               # Electron app (the whole product)
├── src/main.ts        # Electron main; spawns codex app-server
├── src/codex/         # codex bridge, protocol types, chat engine
├── src/acp/           # legacy seams, codex-backed or stubbed
└── src/components/    # UI
sdk/                   # @aaif/goose-sdk — types for the legacy acp seams
```

See [AGENTS.md](AGENTS.md) for the full architecture and contribution rules.

## Development

Requires Node.js 24+, pnpm 10+, and the `codex` binary on `PATH`.

```bash
./start.sh            # install deps if needed, then run the app
```

```bash
cd desktop
pnpm install
pnpm run start-gui    # run the app
pnpm run typecheck
pnpm test
```

## License

[Apache-2.0](LICENSE)
