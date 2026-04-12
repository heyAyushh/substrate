# Trust Substrate MVP Local Verification

This checklist defines the local verification contract for the Trust Substrate MVP.
It is intentionally self-contained: no network calls, no external installs, and no reliance on workspace code outside the verification layer.

## Run Command

```bash
node --test --experimental-strip-types tests/verification/mvp_local_verification.test.ts
```

## Local Verification Rules

- Keep every check local and deterministic.
- Use only Node and TypeScript built-ins inside the verification tests.
- Treat the verification layer as the first source of truth for security acceptance criteria.
- Do not add direct reputation score writes; reputation must stay derived from verified history.

## MVP Security Acceptance Criteria

Each item below must be covered by an executable local test.

- Signer checks
  - Reject unsigned actions.
  - Reject actions signed by the wrong authority.
  - Allow only the authority or an explicitly delegated signer.

- PDA validation expectations
  - Reject accounts derived from the wrong seeds.
  - Reject mismatched bumps.
  - Reject any account layout that does not match the canonical identity, task, receipt, or delegation PDA pattern.

- Replay protection
  - Reject duplicate receipts.
  - Reject reused nonces or sequence numbers.
  - Reject repeated submission of the same meaningful step.

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

- The executable test file passes locally.
- The checklist covers every security acceptance criterion listed above.
- The verification layer remains self-contained and uses no external dependencies.
- The repository can defer program implementation while keeping the acceptance contract explicit.
