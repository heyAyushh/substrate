# Trust Substrate MVP Local Verification

This checklist defines the local verification contract for the Trust Substrate MVP.
It is intentionally local: no network calls or external installs. Some verification tests read workspace metadata and source files to confirm the protocol layout and shared error taxonomy stay consistent.

## Run Command

```bash
pnpm test:verification
```

Equivalent direct command:

```bash
node --test --experimental-strip-types tests/verification/*.test.ts
```

## Verification Order

Run the local gates in this order:

1. Local package unit tests
2. Rust program and model tests
3. Verification contract tests
4. Anchor build and test
5. Surfpool-backed end-to-end verification

## Local Verification Rules

- Keep every check local and deterministic.
- Use only Node and TypeScript built-ins inside the verification tests.
- Treat the verification layer as the first source of truth for security acceptance criteria.
- Do not add direct reputation score writes; reputation must stay derived from verified history.
- Do not require devnet as a verification gate.

## MVP Security Acceptance Criteria

Each item below must be covered by an executable local test before it is treated as shipped behavior.

- Signer checks
  - Reject unsigned actions.
  - Reject actions signed by the wrong authority.
  - Allow only the authority or an explicitly delegated signer.

- PDA validation expectations
  - Reject accounts derived from the wrong seeds.
  - Reject mismatched bumps.
  - Reject account layouts that do not match the canonical identity, task, receipt, delegation, checkpoint, reputation, stake, or slash-marker PDA pattern.

- Replay protection
  - Reject duplicate receipts.
  - Reject reused receipt identifiers.
  - Reject repeated submission of the same meaningful step.
  - Reject repeated slashing with the same dispute-resolution receipt.

- Stale proofs
  - Reject proofs anchored to an outdated checkpoint root.
  - Reject proofs that do not match the current epoch boundary.
  - Reject proofs whose leaf or domain does not match the claimed history.

- Unauthorized delegation
  - Reject delegation outside the granted scope.
  - Reject expired delegation.
  - Reject revoked delegation.
  - Reject handoff attempts that cannot be traced to a valid authority chain.

- Reputation handling
  - Reject any path that writes a reputation score directly.
  - Accept only derived reputation outputs computed from verified execution history.

## MVP Local Pass Criteria

- `pnpm test:verification` passes locally.
- The verification order is package tests, Rust tests, verification tests, Anchor build/test, then Surfpool E2E.
- The checklist covers every security acceptance criterion listed above.
- The verification layer remains local-only and uses no external dependencies.
- Program behavior stays tied to executable tests and the acceptance contract above.
