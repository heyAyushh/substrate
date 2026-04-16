# Hardening Plan Scoreboard

This scoreboard tracks W0-W2 and W5 of the hardening plan as an executable audit lane.
Run it with:

```bash
pnpm test:audit
```

Status legend:

- `complete` means the repo contains the expected on-chain or test evidence.
- `missing` means the plan item still has a concrete gap.

## W0-W2 and W5 Scoreboard

| Wave | Item | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| W0 | W0.1 validate receipt chain on-chain | complete | `programs/task_registry/src/state/task_record.rs`, `programs/receipt_emitter/src/instructions/emit_receipt.rs`, `programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs`, `crates/trust_substrate_litesvm_tests/tests/receipt_chain.rs` | |
| W0 | W0.2 canonical domain registry | complete | `programs/reputation_accumulator/src/state/domain_catalog.rs`, `programs/reputation_accumulator/src/instructions/register_domain.rs`, `programs/reputation_accumulator/src/instructions/deprecate_domain.rs`, `programs/reputation_accumulator/src/instructions/create_reputation_domain.rs`, `programs/receipt_emitter/src/instructions/emit_receipt.rs`, `tests/reputation_domains.ts` | |
| W0 | W0.3 repurpose `policy_root` and `history_root` | complete | `programs/identity_registry/src/state/agent_identity.rs`, `programs/identity_registry/src/instructions/update_policy_root.rs`, `programs/identity_registry/src/instructions/update_history_root.rs`, `programs/proof_verifier/src/instructions/initialize_checkpoint.rs`, `programs/proof_verifier/src/instructions/append_receipt_to_checkpoint.rs`, `programs/proof_verifier/src/instructions/rotate_checkpoint.rs` | |
| W0 | W0.4 emit events on every state change | complete | `programs/agent_stake/src/lib.rs`, `programs/proof_verifier/src/events.rs`, `programs/task_registry/src/events.rs`, `programs/delegation_engine/src/events.rs`, `tests/trust_substrate.ts`, `tests/agent_stake_events.ts`, `tests/proof_verifier_events.ts` | |
| W0 | W0.5 replace `init_if_needed` with explicit guards | complete | `programs/agent_stake/src/instructions/slash_with_authority.rs`, `programs/agent_stake/src/instructions/slash_already_applied.rs`, `programs/reputation_accumulator/src/instructions/apply_reputation_receipt.rs`, `programs/task_registry/src/instructions/sync_task_status.rs` | |
| W1 | W1.1 split self-emit vs audit-emit | complete | `programs/receipt_emitter/src/instructions/emit_receipt.rs`, `programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs`, `programs/receipt_emitter/src/instructions/emit_audit_receipt.rs`, `programs/receipt_emitter/src/state/receipt_record.rs`, `programs/receipt_emitter/src/events.rs`, `crates/trust_substrate_litesvm_tests/tests/audit_receipts.rs`, `tests/audit_receipts.ts` | |
| W1 | W1.2 response window + timeout primitive | complete | `programs/receipt_emitter/src/instructions/emit_audit_receipt.rs`, `programs/receipt_emitter/src/instructions/emit_challenge_response.rs`, `programs/receipt_emitter/src/instructions/finalize_unanswered_challenge.rs`, `programs/receipt_emitter/src/state/receipt_record.rs`, `crates/trust_substrate_litesvm_tests/tests/audit_receipts.rs` | |
| W2 | W2.1 incremental checkpoint from actual receipts | complete | `programs/proof_verifier/src/instructions/initialize_checkpoint.rs`, `programs/proof_verifier/src/instructions/append_receipt_to_checkpoint.rs`, `programs/proof_verifier/src/instructions/rotate_checkpoint.rs`, `programs/proof_verifier/src/instructions/verify_receipt_inclusion.rs`, `crates/trust_substrate_litesvm_tests/tests/proof_verifier.rs`, `crates/trust_substrate_litesvm_tests/tests/protocol_flow.rs`, `tests/proof_verifier_events.ts`, `tests/trust_substrate.ts` | |
| W2 | W2.2 restrict caller-supplied root instead of removing it | complete | `programs/proof_verifier/src/instructions/initialize_checkpoint_importer.rs`, `programs/proof_verifier/src/instructions/checkpoint_import.rs`, `programs/proof_verifier/src/instructions/append_receipt_to_checkpoint.rs`, `crates/trust_substrate_litesvm_tests/tests/proof_verifier.rs` | |
| W5 | W5.1 on-chain rotation instruction with emergency path | complete | `programs/identity_registry/src/instructions/rotate_authority.rs`, `programs/identity_registry/src/instructions/finalize_authority_rotation.rs`, `programs/identity_registry/src/instructions/initialize_guardian_set.rs`, `programs/identity_registry/src/instructions/emergency_rotate_authority.rs`, `programs/identity_registry/src/state/guardian_set.rs`, `crates/trust_substrate_litesvm_tests/tests/identity_rotation.rs`, `tests/identity_rotation.ts` | |
| W5 | W5.2 SDK and indexer hooks | complete | `packages/sdk/src/client.ts`, `packages/sdk/src/rotation.ts`, `packages/indexer/src/local-durable-indexer.ts`, `tests/indexer/analytics.test.ts`, `tests/sdk/trust_substrate_sdk.test.ts`, `docs/plans/hardening-plan.md` | |

## Summary

- Completed: 11
- Missing: 0

The audit lane is intentionally narrow so W0-W2 and W5 can be checked
mechanically before the later waves are expanded.
