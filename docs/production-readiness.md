# Production Readiness To-Do

Scope tags are defined in [Scope Tags](scope-tags.md).

This is the live checklist for boundaries that must be closed, or explicitly
accepted, before Trust Substrate is described as production-ready. Each item
stays open until its implementation, tests, and documentation are updated
together.

## Open Items

- [ ] [on-chain] Light Protocol ZK Compression is not integrated yet.
  - Current boundary: `proof_verifier` uses local checkpoint roots and Merkle
    inclusion proofs, with no compressed account integration.
  - Done when: the compressed account model is designed, the relevant
    instructions and clients use it, local protocol tests cover it, and
    `docs/architecture.md`, `docs/programs.md`, and `docs/testing.md` describe
    the production path.

- [ ] [sdk] The TypeScript SDK is deterministic helper logic, not a production
  RPC client.
  - Current boundary: `packages/sdk/src` derives local identities, receipts,
    proofs, reputation, stake, and challenge state without submitting
    transactions.
  - Done when: production RPC orchestration is implemented through the generated
    `@solana/kit` clients, package tests cover the RPC-facing flows, and
    consumer docs state which package owns each responsibility.

- [ ] [indexer] The indexer is local and durable, not a networked event
  pipeline.
  - Current boundary: `packages/indexer/src` rebuilds local execution graphs
    from supplied receipts and persists snapshots.
  - Done when: the ingestion design covers network event sources, backfill,
    reconnect behavior, durable checkpoints, replay rejection, and operator
    verification, with tests for each failure mode.

- [ ] [on-chain] Multi-hop handoff proofs are not fully modeled yet.
  - Current boundary: handoff chains can be reconstructed locally, while the
    on-chain programs validate scoped delegation records and delegated receipts
    one hop at a time.
  - Done when: the protocol has an explicit multi-hop proof model, receipt and
    delegation constraints enforce it, LiteSVM covers accepted and rejected
    chains, and downstream indexer views match the on-chain proof shape.

- [ ] [on-chain] Richer sequence ordering rules across tasks and domains need
  more tests before production use.
  - Current boundary: receipts enforce per-task monotonic sequences and task
    domain matching, while checkpoint append tests cover the current canonical
    ordering rule.
  - Done when: LiteSVM tests cover interleaved tasks, same-sequence receipts on
    different tasks, cross-domain rejection, checkpoint ordering, and replay
    behavior in one documented release gate.

- [ ] [on-chain] Slashing policy is authority-driven in v1. The program verifies
  receipt ownership, identity, kind, and replay markers, but it does not parse
  private dispute evidence or decide outcomes from payload text.
  - Current boundary: slashing is driven by a configured slash authority or an
    adjudicator verdict account. Programs verify account ownership, identity,
    receipt kind, trust mode, treasury, stale windows, and replay markers.
  - Done when: either this authority or adjudicator model is accepted as the
    production policy, or a structured evidence and verdict policy is added with
    tests that prove private payload text is not treated as program-readable
    truth.

## Verification Expectations

Use the narrowest relevant command first:

```bash
pnpm test:verification
```

For any item that changes protocol behavior, follow the local TDD flow and run
the relevant LiteSVM or Surfpool gate described in [Testing](testing.md).
