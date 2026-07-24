# iCodex

iCodex is an Electron desktop frontend for OpenAI's [Codex](https://github.com/openai/codex) app-server. Codex owns everything backend-shaped — inference, tool execution, MCP, conversation storage, config — while iCodex provides the desktop UI.

## How it works

The Electron main process spawns `codex app-server` (from `PATH` or `GOOSE_CODEX_BIN`) and bridges its stdio JSONL JSON-RPC to the renderer over IPC. The renderer speaks the app-server v2 protocol directly.

```
src/main.ts        # Electron main; spawns codex app-server
src/codex/         # codex bridge, protocol types, chat engine
src/acp/           # legacy seams, codex-backed or stubbed
src/components/    # UI
```

See [AGENTS.md](AGENTS.md) for the full architecture and contribution rules.

## Development

Requires Node.js 24+, pnpm 10+, and the `codex` binary on `PATH`.

```bash
./start-desktop.sh    # Electron desktop app
./start-web.sh        # browser app on http://127.0.0.1:5173
```

Both install deps on first run. The web host serves the renderer and the codex
bridge on one port; set `GOOSE_WEB_TOKEN` to require a token, or leave it unset
for token-free loopback access.

```bash
pnpm install
pnpm run start-gui    # desktop app
pnpm run start-web    # browser app
pnpm run build:web    # build the static web bundle (dist-web)
pnpm run serve-web    # serve the built bundle + codex bridge
pnpm run typecheck
pnpm test
```

## Packaging

```bash
pnpm run package         # unpacked app in out/
pnpm run make            # platform installers via Electron Forge
```

macOS signing and notarization use the environment variables referenced in
`config/electron/forge.config.ts`; leave them unset for unsigned local builds.

Linux packaging needs `dpkg` and `fakeroot` for `maker-deb`, and `flatpak` plus
`flatpak-builder` for `maker-flatpak`.

## i18n

UI strings use react-intl; see [docs/I18N.md](docs/I18N.md).
`pnpm run i18n:compile` runs automatically before start and build commands.

## License

[Apache-2.0](LICENSE)
