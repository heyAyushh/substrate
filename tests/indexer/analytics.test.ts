import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  LocalDurableIndexer,
  type LocalReceiptRecord,
} from "../../packages/indexer/src/index.js";

const STAKE_EVENT_MARKER = "trust-substrate.stake_event";

const receipt = (
  overrides: Partial<LocalReceiptRecord> & {
    receiptId: string;
    slot: number;
    taskId: string;
    actorId: string;
    kind: string;
  }
): LocalReceiptRecord => ({
  domain: "ops",
  payload: {},
  ...overrides,
});

const stakeReceipt = (
  receiptId: string,
  slot: number,
  identityId: string,
  amountLamports: string
): LocalReceiptRecord =>
  receipt({
    receiptId,
    slot,
    taskId: `stake-${identityId}`,
    actorId: identityId,
    kind: "stake_event",
    payload: {
      stakeEvents: [
        {
          type: STAKE_EVENT_MARKER,
          eventId: `${receiptId}-deposit`,
          kind: "deposited",
          identityId,
          amountLamports,
        },
      ],
    },
  });

test("getAgentProfile aggregates domains, kinds, models, tools", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: { model: "claude-opus-4-6", tool: "grep" },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t1",
      actorId: "agent-a",
      kind: "handoff",
      domain: "ops",
      payload: { toAgentId: "agent-b" },
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
      domain: "research",
      payload: { model: "claude-opus-4-6", tool: "grep" },
    }),
  ]);

  const profile = indexer.getAgentProfile("agent-a");
  strictEqual(profile.receiptCount, 3);
  deepStrictEqual(profile.handoffPartners, ["agent-b"]);
  strictEqual(profile.modelUsage["claude-opus-4-6"], 2);
  strictEqual(profile.toolUsage["grep"], 2);
  strictEqual(profile.domains.ops, 2);
  strictEqual(profile.domains.research, 1);
  strictEqual(profile.kinds.handoff, 1);
});

test("getAgentLeaderboard ranks by weighted score", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    stakeReceipt("stake-a", 0, "agent-a", "100"),
    stakeReceipt("stake-b", 0, "agent-b", "100"),
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t2",
      actorId: "agent-b",
      kind: "dispute",
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t3",
      actorId: "agent-b",
      kind: "completion",
    }),
  ]);

  const board = indexer.getAgentLeaderboard();
  strictEqual(board[0].agentId, "agent-a");
  strictEqual(board[0].score, 5);
  strictEqual(board[0].tier, "bonded");
  strictEqual(board[1].agentId, "agent-b");
  strictEqual(board[1].score, 1);
  strictEqual(board[1].tier, "bonded");
});

test("attestedOnly leaderboard filters unattested agents", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    stakeReceipt("stake-a", 0, "agent-a", "100"),
    stakeReceipt("stake-b", 0, "agent-b", "100"),
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t1",
      actorId: "agent-b",
      kind: "completion",
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t1",
      actorId: "attester",
      kind: "attestation",
      payload: { target: "agent-a", kind: "kyc" },
    }),
  ]);
  indexer.ingestAttesterRecords([
    {
      identityId: "attester",
      category: "review",
      selfDeclaredTier: 1,
      effectiveTier: 1,
    },
  ]);

  const board = indexer.getAgentLeaderboard({ attestedOnly: true });
  strictEqual(board.length, 1);
  strictEqual(board[0].agentId, "agent-a");
  strictEqual(board[0].attestations, 1);
  strictEqual(board[0].tier, "bonded");
});

test("tier0 leaderboard opt-in includes unbonded identities", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    stakeReceipt("stake-bonded", 0, "agent-bonded", "100"),
    receipt({
      receiptId: "bonded-completion",
      slot: 1,
      taskId: "t-bonded",
      actorId: "agent-bonded",
      kind: "completion",
    }),
    receipt({
      receiptId: "tier0-completion",
      slot: 2,
      taskId: "t-tier0",
      actorId: "agent-tier0",
      kind: "completion",
    }),
  ]);

  const defaultBoard = indexer.getAgentLeaderboard();
  strictEqual(defaultBoard.length, 1);
  strictEqual(defaultBoard[0].agentId, "agent-bonded");
  strictEqual(defaultBoard[0].tier, "bonded");

  const tier0Board = indexer.getAgentLeaderboard({ tier0: true });
  strictEqual(tier0Board.length, 2);
  strictEqual(tier0Board[0].agentId, "agent-bonded");
  strictEqual(tier0Board[0].tier, "bonded");
  strictEqual(tier0Board[1].agentId, "agent-tier0");
  strictEqual(tier0Board[1].tier, "tier0");
});

test("getAttestations returns attestations targeting an agent", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "attester-a",
      kind: "attestation",
      payload: {
        target: "agent-a",
        kind: "review",
        evidenceUri: "ipfs://review",
        evidenceHash: "hash-a",
      },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t2",
      actorId: "attester-b",
      kind: "attestation",
      payload: {
        target: "agent-b",
        kind: "review",
        evidenceHash: "hash-b",
      },
    }),
  ]);

  const attestations = indexer.getAttestations("agent-a");

  strictEqual(attestations.length, 1);
  strictEqual(attestations[0].targetId, "agent-a");
  strictEqual(attestations[0].attesterId, "attester-a");
  strictEqual(attestations[0].evidenceUri, "ipfs://review");
});

test("getAuthorityHistory returns ordered rotation markers", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: { note: "not a rotation" },
    }),
  ]);
  indexer.ingestAuthorityRotations([
    {
      eventId: "rotation-2",
      slot: 3,
      agentId: "agent-a",
      previousAuthority: "old-authority",
      newAuthority: "new-authority",
      mode: "normal",
    },
    {
      eventId: "rotation-1",
      slot: 2,
      agentId: "agent-a",
      previousAuthority: "older-authority",
      newAuthority: "old-authority",
      mode: "emergency",
    },
  ]);

  const history = indexer.getAuthorityHistory("agent-a");

  strictEqual(history.length, 2);
  strictEqual(history[0].eventId, "rotation-1");
  strictEqual(history[0].previousAuthority, "older-authority");
  strictEqual(history[0].newAuthority, "old-authority");
  strictEqual(history[0].mode, "emergency");
  strictEqual(history[1].eventId, "rotation-2");
  strictEqual(history[1].previousAuthority, "old-authority");
  strictEqual(history[1].newAuthority, "new-authority");
  strictEqual(history[1].mode, "normal");
});

test("getToolQualityStats computes per-tool success rate", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
      payload: { tool: "grep" },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t2",
      actorId: "agent-a",
      kind: "dispute",
      payload: { tool: "grep" },
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t3",
      actorId: "agent-a",
      kind: "completion",
      payload: { tool: "edit" },
    }),
  ]);

  const stats = indexer.getToolQualityStats("agent-a");
  const byTool = Object.fromEntries(stats.map((stat) => [stat.tool, stat]));
  strictEqual(byTool.grep.attempts, 2);
  strictEqual(byTool.grep.completions, 1);
  strictEqual(byTool.grep.disputes, 1);
  strictEqual(byTool.grep.successRate, 0.5);
  strictEqual(byTool.edit.successRate, 1);
});

test("getAgentTraceBundle projects file edit receipts", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "file_edit",
      payload: { path: "src/a.ts", afterHash: "aa" },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: { note: "unrelated" },
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t1",
      actorId: "agent-b",
      kind: "completion",
      payload: { path: "src/b.ts" },
    }),
  ]);

  const bundle = indexer.getAgentTraceBundle("t1");
  strictEqual(bundle.version, "0.1.0");
  strictEqual(bundle.taskId, "t1");
  deepStrictEqual(bundle.agentIds, ["agent-a", "agent-b"]);
  strictEqual(bundle.edits.length, 2);
  ok(
    bundle.edits.every(
      (edit) => typeof edit.path === "string" && edit.path.length > 0
    )
  );
});

test("tracks expired unrevealed commit receipts", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "commit-1",
      slot: 5,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: {
        commitMarker: true,
        commitHash: "hash-a",
        revealDeadlineSlot: 10,
      },
    }),
    receipt({
      receiptId: "commit-2",
      slot: 6,
      taskId: "t2",
      actorId: "agent-b",
      kind: "assignment",
      payload: {
        commitMarker: true,
        commitHash: "hash-b",
        revealDeadlineSlot: 10,
      },
    }),
    receipt({
      receiptId: "reveal-2",
      slot: 8,
      taskId: "t2",
      actorId: "agent-b",
      kind: "completion",
      payload: {
        revealMarker: true,
        commitReceiptId: "commit-2",
        commitHash: "hash-b",
      },
    }),
  ]);

  const expired = indexer.getExpiredCommitments(11);

  strictEqual(expired.length, 1);
  strictEqual(expired[0].commitReceiptId, "commit-1");
  strictEqual(expired[0].expired, true);
  strictEqual(expired[0].revealed, false);
});

test("tracks unanswered availability challenges", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "challenge-1",
      slot: 10,
      taskId: "t1",
      actorId: "agent-reviewer",
      kind: "challenge",
      payload: {
        challengeTarget: "receipt-target",
        deadlineSlot: 20,
      },
    }),
    receipt({
      receiptId: "challenge-2",
      slot: 11,
      taskId: "t1",
      actorId: "agent-reviewer",
      kind: "challenge",
      payload: {
        challengeTarget: "receipt-target-2",
        deadlineSlot: 20,
      },
    }),
    receipt({
      receiptId: "response-2",
      slot: 12,
      taskId: "t1",
      actorId: "agent-a",
      kind: "challenge_response",
      payload: {
        challengeReceiptId: "challenge-2",
        evidenceHash: "hash",
      },
    }),
  ]);

  const unanswered = indexer.getUnansweredChallenges(21);

  strictEqual(indexer.isChallengeUnansweredAfter("challenge-1", 21), true);
  strictEqual(indexer.isChallengeUnansweredAfter("challenge-2", 21), false);
  strictEqual(unanswered.length, 1);
  strictEqual(unanswered[0].challengeReceiptId, "challenge-1");
  strictEqual(unanswered[0].expired, true);
});

test("groups challenge rounds for the same target receipt", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "challenge-round-0",
      slot: 30,
      taskId: "task-rounds",
      actorId: "reviewer-a",
      kind: "challenge",
      payload: {
        challengeTarget: "receipt-target",
        deadlineSlot: 35,
        round: 0,
      },
    }),
    receipt({
      receiptId: "challenge-response-round-0",
      slot: 31,
      taskId: "task-rounds",
      actorId: "agent-a",
      kind: "challenge_response",
      payload: {
        challengeReceiptId: "challenge-round-0",
      },
    }),
    receipt({
      receiptId: "challenge-round-1",
      slot: 40,
      taskId: "task-rounds",
      actorId: "reviewer-b",
      kind: "challenge",
      payload: {
        challengeTarget: "receipt-target",
        deadlineSlot: 45,
        round: 1,
      },
    }),
  ]);

  const rounds = indexer.getChallengeRounds("receipt-target", 50);

  strictEqual(rounds.length, 2);
  deepStrictEqual(
    rounds.map((round) => round.round),
    [0, 1]
  );
  strictEqual(rounds[0].answered, true);
  strictEqual(rounds[0].responseReceiptId, "challenge-response-round-0");
  strictEqual(rounds[1].answered, false);
  strictEqual(rounds[1].expired, true);
});

test("projects stake state from receipt payload events", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "stake-init",
      slot: 1,
      taskId: "task-stake",
      actorId: "agent-builder",
      kind: "assignment",
      payload: {
        stakeEvents: [
          {
            type: STAKE_EVENT_MARKER,
            eventId: "event-init",
            kind: "initialized",
            identityId: "agent-builder",
            ownerId: "owner-wallet",
            slashAuthorityId: "arbiter-wallet",
          },
          {
            type: STAKE_EVENT_MARKER,
            eventId: "event-deposit",
            kind: "deposited",
            identityId: "agent-builder",
            amountLamports: "1000000",
          },
        ],
      },
    }),
    receipt({
      receiptId: "stake-unstake-request",
      slot: 2,
      taskId: "task-stake",
      actorId: "agent-builder",
      kind: "handoff",
      payload: {
        stakeEvents: [
          {
            type: STAKE_EVENT_MARKER,
            eventId: "event-unstake-request",
            kind: "unstake_requested",
            identityId: "agent-builder",
            amountLamports: "250000",
            unlocksAtSlot: 50,
          },
        ],
      },
    }),
    receipt({
      receiptId: "stake-unstake-finalize",
      slot: 51,
      taskId: "task-stake",
      actorId: "agent-builder",
      kind: "completion",
      payload: {
        stakeEvents: [
          {
            type: STAKE_EVENT_MARKER,
            eventId: "event-unstake-finalize",
            kind: "unstake_finalized",
            identityId: "agent-builder",
            amountLamports: "250000",
          },
        ],
      },
    }),
    receipt({
      receiptId: "stake-slash",
      slot: 52,
      taskId: "task-stake",
      actorId: "arbiter-agent",
      kind: "dispute_resolved",
      payload: {
        stakeEvents: [
          {
            type: STAKE_EVENT_MARKER,
            eventId: "event-slash",
            kind: "slashed",
            identityId: "agent-builder",
            amountLamports: "100000",
            disputeReceiptId: "stake-slash",
          },
        ],
      },
    }),
  ]);

  const state = indexer.getStakeState("agent-builder");

  strictEqual(state.identityId, "agent-builder");
  strictEqual(state.ownerId, "owner-wallet");
  strictEqual(state.slashAuthorityId, "arbiter-wallet");
  strictEqual(state.activeLamports, "650000");
  strictEqual(state.pendingUnstakeLamports, "0");
  strictEqual(state.slashedLamports, "100000");
  deepStrictEqual(state.slashReceiptIds, ["stake-slash"]);
});

test("projects slashing from dispute resolution payloads", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "stake-deposit",
      slot: 1,
      taskId: "task-stake",
      actorId: "agent-builder",
      kind: "assignment",
      payload: {
        stakeEvents: [
          {
            type: STAKE_EVENT_MARKER,
            eventId: "event-deposit",
            kind: "deposited",
            identityId: "agent-builder",
            amountLamports: "500000",
          },
        ],
      },
    }),
    receipt({
      receiptId: "resolution",
      slot: 2,
      taskId: "task-stake",
      actorId: "arbiter-agent",
      kind: "dispute_resolved",
      payload: {
        resolution: {
          outcome: "agent_lost",
          slashedAgentId: "agent-builder",
          slashAmountLamports: "125000",
        },
      },
    }),
  ]);

  const state = indexer.getStakeState("agent-builder");

  strictEqual(state.activeLamports, "375000");
  strictEqual(state.slashedLamports, "125000");
  deepStrictEqual(state.slashReceiptIds, ["resolution"]);
});
