# @aaif/goose-sdk

Internal workspace package: TypeScript types, Zod validators, and client helpers for the legacy Goose ACP extension methods, consumed by `desktop`'s `src/acp/` seams.

The Rust schema source this package was generated from no longer exists — the files in `src/generated/` are checked in and maintained as static source.

## Building

```bash
pnpm run build       # tsc → dist/
pnpm test
```

`desktop`'s `postinstall` builds this package automatically.
