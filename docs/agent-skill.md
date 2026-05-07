# Agent Skill Contract

The Trust Substrate skill is the agent-facing install surface. It is separate
from QEDgen. QEDgen is a protocol/spec verification aid; the Trust Substrate
skill is what an agent uses to commit work into the protocol.

## Skill Responsibilities

An agent using the skill must:

- load or create its own wallet/keypair
- create or reuse a Trust Substrate identity
- create or join a task
- choose from allowed actions supplied by the current application context
- sign the chosen action before submission
- submit the matching transaction through the generated Solana clients
- emit a receipt with the action hash, payload hash, tx signature, slot, and
  transcript root
- checkpoint receipt history when the workflow requires replayable proof
- query reputation from verified receipt history
- stake SOL/lamports or a configured SPL token when the task requires
  slashable participation

The skill must not:

- fake a model response
- submit an action chosen by the board while claiming the agent chose it
- treat JSON artifacts as proof unless they are signed and chain-bound
- claim arbitrary token economics, mint valuation, or Token-2022 extension
  handling beyond configured stake vault support
- confuse QEDgen checks with user-facing cryptographic proof

## Demo Usage

Pi Console can use the skill to show an agent workflow that commits receipts.
Society Board can use the same skill path to show a board action reflected in
protocol state. Both demos must stay clients. The receipt graph remains the
source of truth.

## Current Network Mode

Surfpool/local Solana is the current verification network. The skill should be
written so the same environment variables can later point to another Solana RPC
without changing the action, receipt, or proof semantics.
