# goose Desktop App

Electron + React desktop frontend for OpenAI's Codex app-server. See the repo root [AGENTS.md](../AGENTS.md) for architecture.

## Running

Requires Node.js 24+, pnpm 10+, and the `codex` binary on `PATH` (or set `GOOSE_CODEX_BIN`).

```bash
pnpm install
pnpm run start-gui
```

## Development

```bash
pnpm run typecheck
pnpm test                # vitest watch mode; test:run for one-shot
npx eslint src --ext .ts,.tsx
```

To regenerate the Codex protocol types after upgrading codex:

```bash
codex app-server generate-ts --out src/codex/protocol
```

## Packaging

```bash
pnpm run package         # unpacked app in out/
pnpm run make            # platform installers via Electron Forge
```

macOS signing/notarization is configured through the env vars referenced in `forge.config.ts`; leave them unset for unsigned local builds.

Linux packaging needs `dpkg` and `fakeroot` (`maker-deb`), and `flatpak`/`flatpak-builder` for `maker-flatpak`.

## i18n

UI strings use react-intl; see [I18N.md](I18N.md). `pnpm run i18n:compile` runs automatically before start/build.
