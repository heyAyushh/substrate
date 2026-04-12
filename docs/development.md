# Development

## Local setup

1. Install the pinned toolchain.
2. Install dependencies from the repository root with `pnpm install`.
3. Run the local checks once before making changes:

```bash
pnpm test
```

## Toolchain

Validated on this machine:

- Node `v25.6.0`
- pnpm `10.33.0`
- npm `11.8.0`
- Rust `1.92.0`
- Cargo `1.92.0`
- Solana CLI `3.1.13`
- Anchor CLI `0.32.1`
- Surfpool `1.0.0`

Repository pins:

- `packageManager`: `pnpm@10.33.0`
- `@coral-xyz/anchor`: `0.32.1`
- `Anchor.toml`: `anchor_version = "0.32.1"`

## Developer workflow

- Make one focused change at a time.
- Start with a failing test for the behavior you want.
- Implement the smallest change that makes that test pass.
- Run the narrowest local test first, then the wider suite.
- Keep protocol changes documented in tests, not just in prose.
- Do not use devnet as the final verification gate. Surfpool is the final end-to-end environment.

## TDD workflow

1. Add or update the smallest test that describes the behavior.
2. Run that test and confirm it fails for the expected reason.
3. Implement the minimal code path.
4. Re-run the focused test.
5. Run the relevant package, Rust, Anchor, and Surfpool checks before moving on.

The local verification contract is defined in `docs/verification/mvp-local-verification.md`.

