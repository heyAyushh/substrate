import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  address,
  createKeyPairSignerFromBytes,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import {
  TrustSubstrateOnchainClient,
  createIdentity as createIdentityRecord,
  createKitTransactionDispatcher,
  createReceipt as createReceiptRecord,
  createTask as createTaskRecord,
  type IdentityRecord,
  type OnchainOperationResult,
  type OnchainReputationEvidenceAccount,
  type OnchainTransactionDispatcher,
  type ReceiptKind,
  type ReceiptRecord,
  type TaskRecord,
} from "@trust-substrate/sdk";
import { z } from "zod";
import {
  DEFAULT_RPC_SUBSCRIPTIONS_URL,
  DEFAULT_RPC_URL,
  JSON_RESPONSE_FORMAT,
  MARKDOWN_RESPONSE_FORMAT,
  MCP_ENABLE_WRITES_ENV,
  SUBSTRATE_COMMITMENT_ENV,
  SUBSTRATE_KEYPAIR_ENV,
  SUBSTRATE_RPC_SUBSCRIPTIONS_URL_ENV,
  SUBSTRATE_RPC_URL_ENV,
  SUBSTRATE_WS_URL_ENV,
} from "./constants.js";

type Env = Readonly<Record<string, string | undefined>>;
type ToolPayload = Record<string, unknown>;
type WriteMode = "preview" | "submit";
type Commitment = "processed" | "confirmed" | "finalized";
type ProtocolWriteGroup =
  | "identity"
  | "task"
  | "receipt"
  | "stake"
  | "reputation"
  | "attester"
  | "delegation"
  | "checkpoint"
  | "dispute";

type ProtocolWriteParams = Readonly<Record<string, unknown>> & {
  readonly action: string;
  readonly mode: WriteMode;
  readonly confirm: boolean;
};

interface WriteExecutionContext {
  readonly client: TrustSubstrateOnchainClient;
  readonly signer: KeyPairSigner;
  readonly config: McpWriteConfig;
  readonly mode: WriteMode;
}

interface McpWriteConfig {
  readonly enabled: boolean;
  readonly rpcUrl: string;
  readonly rpcSubscriptionsUrl: string;
  readonly keypairPath: string;
  readonly commitment: Commitment;
}

interface ProtocolWriteResult {
  readonly group: ProtocolWriteGroup;
  readonly action: string;
  readonly mode: WriteMode;
  readonly submitted: boolean;
  readonly submitRefused?: boolean;
  readonly signer: string;
  readonly rpcUrl: string;
  readonly commitment: Commitment;
  readonly preview?: unknown;
  readonly result?: unknown;
  readonly destructive: boolean;
  readonly idempotent: boolean;
}

const SOLANA_KEYPAIR_LENGTH = 64;
const DEFAULT_KEYPAIR_SUBPATH = ".config/solana/id.json";
const ZERO_ADDRESS = "11111111111111111111111111111111";
const RESPONSE_FORMAT_SCHEMA = z
  .enum([MARKDOWN_RESPONSE_FORMAT, JSON_RESPONSE_FORMAT])
  .default(JSON_RESPONSE_FORMAT);
const WRITE_MODE_SCHEMA = z.enum(["preview", "submit"]).default("preview");
const ADDRESS_SCHEMA = z.string().min(1);
const BIGINT_INPUT_SCHEMA = z.union([z.string().min(1), z.number().int()]);
const RECEIPT_KIND_SCHEMA = z.enum([
  "assignment",
  "handoff",
  "completion",
  "dispute",
  "dispute_resolved",
  "challenge",
  "challenge_response",
  "attestation",
]);

const IdentityRecordSchema = z
  .object({
    identityId: z.string().min(1),
    authority: z.string().min(1),
    label: z.string().min(1),
    policyRoot: z.string().min(1),
    historyRoot: z.string().min(1),
  })
  .strict();

const TaskRecordSchema = z
  .object({
    taskId: z.string().min(1),
    identityId: z.string().min(1),
    title: z.string().min(1),
    domain: z.string().min(1),
    description: z.string().optional(),
    subtasks: z.array(z.string()).default([]),
  })
  .strict();

const ReceiptRecordSchema = z
  .object({
    receiptId: z.string().min(1),
    hash: z.string().min(1),
    actorId: z.string().min(1),
    kind: RECEIPT_KIND_SCHEMA,
    taskId: z.string().min(1),
    payload: z.record(z.unknown()).default({}),
    sequence: z.number().int().min(0),
    previousReceiptId: z.string().optional(),
    domain: z.string().min(1),
    auditorId: z.string().optional(),
    targetReceiptId: z.string().optional(),
    round: z.number().int().min(0).optional(),
  })
  .strict();

const EvidenceAccountSchema = z
  .object({
    address: ADDRESS_SCHEMA,
    writable: z.boolean().optional(),
  })
  .strict();

const WriteBaseSchema = z.object({
  mode: WRITE_MODE_SCHEMA,
  confirm: z.boolean().default(false),
  response_format: RESPONSE_FORMAT_SCHEMA,
});

const IdentityWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "create_identity",
    "ensure_identity",
    "deposit_identity_bond",
    "ensure_identity_bond",
  ]),
  identity: ADDRESS_SCHEMA.optional(),
  identity_label: z.string().min(1).optional(),
  identity_record: IdentityRecordSchema.optional(),
}).strict();

const TaskWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "create_task",
    "ensure_task",
    "create_society_world",
    "update_society_world",
    "sync_task_status",
  ]),
  identity: ADDRESS_SCHEMA.optional(),
  identity_id: z.string().min(1).optional(),
  task: ADDRESS_SCHEMA.optional(),
  task_title: z.string().min(1).optional(),
  task_description: z.string().optional(),
  domain: z.string().min(1).optional(),
  subtasks: z.array(z.string()).optional(),
  task_record: TaskRecordSchema.optional(),
  receipt: ADDRESS_SCHEMA.optional(),
  current_tick: z.number().int().min(0).optional(),
  last_sequence: BIGINT_INPUT_SCHEMA.optional(),
  last_receipt: ADDRESS_SCHEMA.optional(),
  status: z.number().int().min(0).optional(),
  state_hex: z.string().optional(),
}).strict();

const ReceiptWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "emit_receipt",
    "emit_delegated_receipt",
    "emit_audit_receipt",
    "emit_challenge_response",
    "finalize_unanswered_challenge",
  ]),
  identity: ADDRESS_SCHEMA.optional(),
  delegation: ADDRESS_SCHEMA.optional(),
  task: ADDRESS_SCHEMA.optional(),
  domain_catalog: ADDRESS_SCHEMA.optional(),
  receipt_record: ReceiptRecordSchema.optional(),
  actor_id: z.string().min(1).optional(),
  receipt_kind: RECEIPT_KIND_SCHEMA.optional(),
  task_id: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  sequence: z.number().int().min(0).optional(),
  previous_receipt_id: z.string().optional(),
  auditor_identity: ADDRESS_SCHEMA.optional(),
  identity_bond: ADDRESS_SCHEMA.optional(),
  target_identity: ADDRESS_SCHEMA.optional(),
  target_receipt: ADDRESS_SCHEMA.optional(),
  round: z.number().int().min(0).optional(),
  deadline_slot: BIGINT_INPUT_SCHEMA.optional(),
  challenge: ADDRESS_SCHEMA.optional(),
}).strict();

const StakeWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "initialize_stake",
    "ensure_stake",
    "stake",
    "request_unstake",
    "finalize_unstake",
    "initialize_token_treasury_vault",
    "initialize_token_stake",
    "stake_token",
    "request_unstake_token",
    "finalize_unstake_token",
    "slash_with_authority",
    "slash_with_verdict",
    "slash_token_with_authority",
    "slash_token_with_verdict",
  ]),
  identity: ADDRESS_SCHEMA.optional(),
  stake_account: ADDRESS_SCHEMA.optional(),
  token_stake: ADDRESS_SCHEMA.optional(),
  scope: ADDRESS_SCHEMA.optional(),
  mint: ADDRESS_SCHEMA.optional(),
  slash_authority: ADDRESS_SCHEMA.optional(),
  trust_mode: z.number().int().min(0).optional(),
  amount: BIGINT_INPUT_SCHEMA.optional(),
  owner_token_account: ADDRESS_SCHEMA.optional(),
  token_program: ADDRESS_SCHEMA.optional(),
  vault: ADDRESS_SCHEMA.optional(),
  treasury_vault: ADDRESS_SCHEMA.optional(),
  treasury_token_vault: ADDRESS_SCHEMA.optional(),
  dispute_receipt: ADDRESS_SCHEMA.optional(),
  verdict: ADDRESS_SCHEMA.optional(),
  slash_marker: ADDRESS_SCHEMA.optional(),
}).strict();

const ReputationWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "initialize_domain_catalog",
    "ensure_domain_catalog",
    "register_domain",
    "ensure_domain_registered",
    "initialize_cpi_authority",
    "ensure_cpi_authority",
    "create_reputation_domain",
    "ensure_reputation_domain",
    "apply_reputation_receipt",
  ]),
  identity: ADDRESS_SCHEMA.optional(),
  domain_catalog: ADDRESS_SCHEMA.optional(),
  task_or_domain: z.string().min(1).optional(),
  task_record: TaskRecordSchema.optional(),
  completion_weight: BIGINT_INPUT_SCHEMA.optional(),
  dispute_weight: BIGINT_INPUT_SCHEMA.optional(),
  dispute_resolved_weight: BIGINT_INPUT_SCHEMA.optional(),
  receipt: ADDRESS_SCHEMA.optional(),
  reputation: ADDRESS_SCHEMA.optional(),
  evidence_accounts: z.array(EvidenceAccountSchema).optional(),
}).strict();

const AttesterWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "initialize_attester_registry",
    "ensure_attester_registry",
    "register_attester",
    "ensure_attester",
  ]),
  identity: ADDRESS_SCHEMA.optional(),
  category: z.string().min(1).optional(),
  self_declared_tier: z.number().int().min(0).optional(),
}).strict();

const DelegationWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum(["create_delegation", "ensure_delegation"]),
  identity: ADDRESS_SCHEMA,
  delegate: ADDRESS_SCHEMA,
  allowed_actions: z.number().int().min(0),
  expires_at_slot: BIGINT_INPUT_SCHEMA.optional(),
}).strict();

const CheckpointWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "initialize_history_updater",
    "ensure_history_updater",
    "initialize_history_checkpoint",
    "ensure_history_checkpoint",
    "append_receipt_to_checkpoint",
  ]),
  identity: ADDRESS_SCHEMA.optional(),
  epoch: BIGINT_INPUT_SCHEMA.optional(),
  checkpoint: ADDRESS_SCHEMA.optional(),
  latest_checkpoint: ADDRESS_SCHEMA.optional(),
  receipt: ADDRESS_SCHEMA.optional(),
}).strict();

const DisputeWriteInputSchema = WriteBaseSchema.extend({
  action: z.enum([
    "register_adjudicator",
    "ensure_adjudicator",
    "record_verdict",
    "ensure_verdict",
  ]),
  adjudicator: ADDRESS_SCHEMA.optional(),
  dispute_receipt: ADDRESS_SCHEMA.optional(),
  outcome: z.number().int().min(0).optional(),
  slash_amount: BIGINT_INPUT_SCHEMA.optional(),
  class: z.number().int().min(0).optional(),
  stale_after_slot: BIGINT_INPUT_SCHEMA.optional(),
}).strict();

const WriteStatusInputSchema = z
  .object({
    response_format: RESPONSE_FORMAT_SCHEMA,
  })
  .strict();

export function registerMcpWriteTools(server: McpServer, env: Env): void {
  registerWriteStatusTool(server, env);
  if (!loadMcpWriteConfig(env).enabled) {
    return;
  }

  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_identity_write",
    title: "Trust Substrate Identity Write",
    description:
      "Preview or submit identity_registry writes through the configured Solana keypair. Defaults to preview and requires confirm=true for submit.",
    group: "identity",
    schema: IdentityWriteInputSchema,
    destructive: false,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_task_write",
    title: "Trust Substrate Task Write",
    description:
      "Preview or submit task_registry and society-world writes through the configured Solana keypair.",
    group: "task",
    schema: TaskWriteInputSchema,
    destructive: true,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_receipt_write",
    title: "Trust Substrate Receipt Write",
    description:
      "Preview or submit receipt_emitter writes for direct, delegated, audit, challenge, and unanswered-challenge receipts.",
    group: "receipt",
    schema: ReceiptWriteInputSchema,
    destructive: false,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_stake_write",
    title: "Trust Substrate Stake Write",
    description:
      "Preview or submit SOL/SPL stake, unstake, and slash operations. Slash and finalize actions are destructive.",
    group: "stake",
    schema: StakeWriteInputSchema,
    destructive: true,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_reputation_write",
    title: "Trust Substrate Reputation Write",
    description:
      "Preview or submit reputation domain, CPI authority, and apply-reputation-receipt writes.",
    group: "reputation",
    schema: ReputationWriteInputSchema,
    destructive: false,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_attester_write",
    title: "Trust Substrate Attester Write",
    description:
      "Preview or submit attester registry and attester record writes.",
    group: "attester",
    schema: AttesterWriteInputSchema,
    destructive: false,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_delegation_write",
    title: "Trust Substrate Delegation Write",
    description: "Preview or submit delegation creation and ensure operations.",
    group: "delegation",
    schema: DelegationWriteInputSchema,
    destructive: false,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_checkpoint_write",
    title: "Trust Substrate Checkpoint Write",
    description:
      "Preview or submit history updater, checkpoint, and append-receipt checkpoint writes.",
    group: "checkpoint",
    schema: CheckpointWriteInputSchema,
    destructive: false,
  });
  registerProtocolWriteTool(server, env, {
    name: "trust_substrate_dispute_write",
    title: "Trust Substrate Dispute Write",
    description:
      "Preview or submit adjudicator and verdict writes through the dispute_resolver program.",
    group: "dispute",
    schema: DisputeWriteInputSchema,
    destructive: false,
  });
}

export function loadMcpWriteConfig(env: Env = process.env): McpWriteConfig {
  return {
    enabled: isTruthy(env[MCP_ENABLE_WRITES_ENV]),
    rpcUrl: env[SUBSTRATE_RPC_URL_ENV] ?? DEFAULT_RPC_URL,
    rpcSubscriptionsUrl:
      env[SUBSTRATE_RPC_SUBSCRIPTIONS_URL_ENV] ??
      env[SUBSTRATE_WS_URL_ENV] ??
      DEFAULT_RPC_SUBSCRIPTIONS_URL,
    keypairPath:
      env[SUBSTRATE_KEYPAIR_ENV] ?? resolve(homedir(), DEFAULT_KEYPAIR_SUBPATH),
    commitment: parseCommitment(env[SUBSTRATE_COMMITMENT_ENV]),
  };
}

export async function getMcpWriteStatus(
  env: Env = process.env,
): Promise<ToolPayload> {
  const config = loadMcpWriteConfig(env);
  const signer = config.enabled
    ? await loadSigner(config.keypairPath).then(
        (keypair) => ({ address: keypair.address }),
        (error) => ({ error: errorMessage(error) }),
      )
    : undefined;
  const ready = config.enabled && signer !== undefined && !("error" in signer);
  return {
    enabled: config.enabled,
    ready,
    rpcUrl: config.rpcUrl,
    rpcSubscriptionsUrl: config.rpcSubscriptionsUrl,
    commitment: config.commitment,
    keypairPath: config.keypairPath,
    signerAddress: signer && "address" in signer ? signer.address : undefined,
    error: signer && "error" in signer ? signer.error : undefined,
    writeTools: config.enabled ? WRITE_TOOL_NAMES : [],
    supportedOperations: SUPPORTED_OPERATIONS,
    safety: {
      defaultMode: "preview",
      submitRequiresConfirm: true,
      localSnapshotWrites: false,
      createsOrOverwritesKeypairs: false,
    },
  };
}

export async function runMcpProtocolWriteTool(
  group: ProtocolWriteGroup,
  params: ProtocolWriteParams,
  env: Env = process.env,
): Promise<ProtocolWriteResult> {
  const config = loadMcpWriteConfig(env);
  if (!config.enabled) {
    throw new Error(
      `${MCP_ENABLE_WRITES_ENV}=1 is required before protocol write tools can submit or preview chain writes`,
    );
  }
  const signer = await loadSigner(config.keypairPath);
  const requestedSubmit = params.mode === "submit";
  const mode: WriteMode =
    requestedSubmit && params.confirm ? "submit" : "preview";
  const client = createClientForMode(mode, config);
  const context: WriteExecutionContext = {
    client,
    signer,
    config,
    mode,
  };
  const actionMeta = actionMetadata(group, params.action);
  const output =
    mode === "submit"
      ? await submitOperation(group, params, context)
      : await previewOperation(group, params, context);

  return {
    group,
    action: params.action,
    mode,
    submitted: mode === "submit",
    submitRefused: requestedSubmit && !params.confirm ? true : undefined,
    signer: signer.address,
    rpcUrl: config.rpcUrl,
    commitment: config.commitment,
    preview: mode === "preview" ? output : undefined,
    result: mode === "submit" ? output : undefined,
    destructive: actionMeta.destructive,
    idempotent: actionMeta.idempotent,
  };
}

function registerWriteStatusTool(server: McpServer, env: Env): void {
  server.registerTool(
    "trust_substrate_write_status",
    {
      title: "Trust Substrate Write Status",
      description:
        "Report whether chain write tools are enabled and configured. This does not submit transactions.",
      inputSchema: WriteStatusInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: z.infer<typeof WriteStatusInputSchema>) =>
      runAsyncTool(async () => {
        const payload = await getMcpWriteStatus(env);
        return {
          payload,
          text: formatWritePayload(payload, params.response_format),
        };
      }),
  );
}

function registerProtocolWriteTool(
  server: McpServer,
  env: Env,
  input: {
    readonly name: string;
    readonly title: string;
    readonly description: string;
    readonly group: ProtocolWriteGroup;
    readonly schema: z.ZodObject<z.ZodRawShape>;
    readonly destructive: boolean;
  },
): void {
  server.registerTool(
    input.name,
    {
      title: input.title,
      description: input.description,
      inputSchema: input.schema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: input.destructive,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) =>
      runAsyncTool(async () => {
        const parsed = input.schema.parse(params) as {
          readonly action: string;
          readonly mode: WriteMode;
          readonly confirm: boolean;
          readonly response_format: string;
        };
        const payload = await runMcpProtocolWriteTool(input.group, parsed, env);
        return {
          payload: toJsonSafe(payload) as ToolPayload,
          text: formatWritePayload(payload, parsed.response_format),
        };
      }),
  );
}

async function previewOperation(
  group: ProtocolWriteGroup,
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (group) {
    case "identity":
      return previewIdentity(params, context);
    case "task":
      return previewTask(params, context);
    case "receipt":
      return previewReceipt(params, context);
    case "stake":
      return previewStake(params, context);
    case "reputation":
      return previewReputation(params, context);
    case "attester":
      return previewAttester(params, context);
    case "delegation":
      return previewDelegation(params, context);
    case "checkpoint":
      return previewCheckpoint(params, context);
    case "dispute":
      return previewDispute(params, context);
  }
}

async function submitOperation(
  group: ProtocolWriteGroup,
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (group) {
    case "identity":
      return submitIdentity(params, context);
    case "task":
      return submitTask(params, context);
    case "receipt":
      return submitReceipt(params, context);
    case "stake":
      return submitStake(params, context);
    case "reputation":
      return submitReputation(params, context);
    case "attester":
      return submitAttester(params, context);
    case "delegation":
      return submitDelegation(params, context);
    case "checkpoint":
      return submitCheckpoint(params, context);
    case "dispute":
      return submitDispute(params, context);
  }
}

async function previewIdentity(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  if (
    params.action === "create_identity" ||
    params.action === "ensure_identity"
  ) {
    return context.client.bindIdentity({
      authority: context.signer,
      identity: identityRecord(params, context.signer),
    });
  }
  return context.client.bindIdentityBond({
    identity: addressParam(params, "identity"),
  });
}

async function submitIdentity(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "create_identity":
      return context.client.createIdentity({
        authority: context.signer,
        identity: identityRecord(params, context.signer),
      });
    case "ensure_identity":
      return context.client.ensureIdentity({
        authority: context.signer,
        identity: identityRecord(params, context.signer),
      });
    case "deposit_identity_bond":
      return context.client.depositIdentityBond({
        authority: context.signer,
        identity: addressParam(params, "identity"),
      });
    case "ensure_identity_bond":
      return context.client.ensureIdentityBond({
        authority: context.signer,
        identity: addressParam(params, "identity"),
      });
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewTask(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "create_task":
    case "ensure_task":
      return context.client.bindTask({
        identity: addressParam(params, "identity"),
        task: taskRecord(params),
      });
    case "create_society_world":
    case "update_society_world":
      return context.client.bindSocietyWorld({
        task: addressParam(params, "task"),
      });
    case "sync_task_status":
      return {
        identity: addressParam(params, "identity"),
        task: addressParam(params, "task"),
        receipt: addressParam(params, "receipt"),
      };
    default:
      throw unsupportedAction(params.action);
  }
}

async function submitTask(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "create_task":
      return context.client.createTask({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        task: taskRecord(params),
      });
    case "ensure_task":
      return context.client.ensureTask({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        task: taskRecord(params),
      });
    case "create_society_world":
      return context.client.createSocietyWorld(
        societyWorldInput(params, context),
      );
    case "update_society_world":
      return context.client.updateSocietyWorld(
        societyWorldInput(params, context),
      );
    case "sync_task_status":
      return context.client.syncTaskStatus({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        task: addressParam(params, "task"),
        receipt: addressParam(params, "receipt"),
      });
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewReceipt(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "emit_receipt":
    case "emit_delegated_receipt":
      return context.client.bindReceipt({
        identity: addressParam(params, "identity"),
        task: addressParam(params, "task"),
        receipt: await receiptRecordForTask(params, context),
      });
    case "emit_audit_receipt":
      return context.client.bindAuditReceipt({
        auditorIdentity: addressParam(params, "auditor_identity"),
        targetReceipt: addressParam(params, "target_receipt"),
        kind: receiptRecord(params).kind,
        round: numberParam(params, "round"),
      });
    case "emit_challenge_response":
      return context.client.bindChallengeResponse({
        challenge: addressParam(params, "challenge"),
      });
    case "finalize_unanswered_challenge":
      return {
        challenge: addressParam(params, "challenge"),
        targetReceipt: addressParam(params, "target_receipt"),
        targetIdentity: addressParam(params, "target_identity"),
      };
    default:
      throw unsupportedAction(params.action);
  }
}

async function submitReceipt(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "emit_receipt":
      return context.client.emitReceipt({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        task: addressParam(params, "task"),
        domainCatalog: addressParam(params, "domain_catalog"),
        receipt: await receiptRecordForTask(params, context),
      });
    case "emit_delegated_receipt":
      return context.client.emitDelegatedReceipt({
        delegate: context.signer,
        identity: addressParam(params, "identity"),
        delegation: addressParam(params, "delegation"),
        task: addressParam(params, "task"),
        domainCatalog: addressParam(params, "domain_catalog"),
        receipt: await receiptRecordForTask(params, context),
      });
    case "emit_audit_receipt":
      return context.client.emitAuditReceipt({
        authority: context.signer,
        auditorIdentity: addressParam(params, "auditor_identity"),
        identityBond: addressParam(params, "identity_bond"),
        targetIdentity: addressParam(params, "target_identity"),
        targetReceipt: addressParam(params, "target_receipt"),
        domainCatalog: addressParam(params, "domain_catalog"),
        receipt: receiptRecord(params),
        round: numberParam(params, "round"),
        deadlineSlot: optionalBigInt(params, "deadline_slot"),
      });
    case "emit_challenge_response":
      return context.client.emitChallengeResponse({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        targetIdentity: addressParam(params, "target_identity"),
        challenge: addressParam(params, "challenge"),
        receipt: receiptRecord(params),
      });
    case "finalize_unanswered_challenge":
      return context.client.finalizeUnansweredChallenge({
        authority: context.signer,
        targetIdentity: addressParam(params, "target_identity"),
        challenge: addressParam(params, "challenge"),
        targetReceipt: addressParam(params, "target_receipt"),
        auditorIdentity: addressParam(params, "auditor_identity"),
        round: numberParam(params, "round"),
      });
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewStake(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "initialize_stake":
    case "ensure_stake":
    case "stake":
      return context.client.bindStake({
        identity: addressParam(params, "identity"),
      });
    case "initialize_token_treasury_vault":
      return context.client.bindTreasuryTokenVault({
        mint: addressParam(params, "mint"),
      });
    case "initialize_token_stake":
    case "stake_token":
      return context.client.bindTokenStake({
        identity: addressParam(params, "identity"),
        scope: addressParam(params, "scope"),
        mint: addressParam(params, "mint"),
      });
    default:
      return {
        action: params.action,
        identity: optionalAddress(params, "identity"),
        stake: optionalAddress(params, "stake_account"),
        tokenStake: optionalAddress(params, "token_stake"),
        amount: optionalBigInt(params, "amount"),
      };
  }
}

async function submitStake(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "initialize_stake":
      return context.client.initializeStake({
        owner: context.signer,
        identity: addressParam(params, "identity"),
        slashAuthority: addressParam(params, "slash_authority"),
        trustMode: numberParam(params, "trust_mode"),
      });
    case "ensure_stake":
      return context.client.ensureStake({
        owner: context.signer,
        identity: addressParam(params, "identity"),
        slashAuthority: addressParam(params, "slash_authority"),
        trustMode: numberParam(params, "trust_mode"),
      });
    case "stake":
      return context.client.stake({
        owner: context.signer,
        identity: addressParam(params, "identity"),
        amount: bigintParam(params, "amount"),
      });
    case "request_unstake":
      return context.client.requestUnstake({
        owner: context.signer,
        stake: addressParam(params, "stake_account"),
        amount: bigintParam(params, "amount"),
      });
    case "finalize_unstake":
      return context.client.finalizeUnstake({
        owner: context.signer,
        identity: addressParam(params, "identity"),
        stake: addressParam(params, "stake_account"),
      });
    case "initialize_token_treasury_vault":
      return context.client.initializeTokenTreasuryVault({
        payer: context.signer,
        mint: addressParam(params, "mint"),
        tokenProgram: optionalAddress(params, "token_program"),
      });
    case "initialize_token_stake":
      return context.client.initializeTokenStake({
        owner: context.signer,
        identity: addressParam(params, "identity"),
        scope: addressParam(params, "scope"),
        mint: addressParam(params, "mint"),
        slashAuthority: addressParam(params, "slash_authority"),
        trustMode: numberParam(params, "trust_mode"),
        tokenProgram: optionalAddress(params, "token_program"),
      });
    case "stake_token":
      return context.client.stakeToken({
        owner: context.signer,
        identity: addressParam(params, "identity"),
        scope: addressParam(params, "scope"),
        mint: addressParam(params, "mint"),
        ownerTokenAccount: addressParam(params, "owner_token_account"),
        amount: bigintParam(params, "amount"),
        tokenProgram: optionalAddress(params, "token_program"),
      });
    case "request_unstake_token":
      return context.client.requestUnstakeToken({
        owner: context.signer,
        tokenStake: addressParam(params, "token_stake"),
        amount: bigintParam(params, "amount"),
      });
    case "finalize_unstake_token":
      return context.client.finalizeUnstakeToken({
        owner: context.signer,
        tokenStake: addressParam(params, "token_stake"),
        identity: addressParam(params, "identity"),
        mint: addressParam(params, "mint"),
        ownerTokenAccount: addressParam(params, "owner_token_account"),
        vault: optionalAddress(params, "vault"),
        tokenProgram: optionalAddress(params, "token_program"),
      });
    case "slash_with_authority":
      return context.client.slashWithAuthority({
        slashAuthority: context.signer,
        identity: addressParam(params, "identity"),
        stake: addressParam(params, "stake_account"),
        disputeReceipt: addressParam(params, "dispute_receipt"),
        amount: bigintParam(params, "amount"),
        slashMarker: optionalAddress(params, "slash_marker"),
        treasuryVault: optionalAddress(params, "treasury_vault"),
      });
    case "slash_with_verdict":
      return context.client.slashWithVerdict({
        adjudicator: context.signer,
        identity: addressParam(params, "identity"),
        stake: addressParam(params, "stake_account"),
        disputeReceipt: addressParam(params, "dispute_receipt"),
        verdict: optionalAddress(params, "verdict"),
        slashMarker: optionalAddress(params, "slash_marker"),
        treasuryVault: optionalAddress(params, "treasury_vault"),
      });
    case "slash_token_with_authority":
      return context.client.slashTokenWithAuthority({
        slashAuthority: context.signer,
        identity: addressParam(params, "identity"),
        tokenStake: addressParam(params, "token_stake"),
        disputeReceipt: addressParam(params, "dispute_receipt"),
        mint: addressParam(params, "mint"),
        amount: bigintParam(params, "amount"),
        vault: optionalAddress(params, "vault"),
        slashMarker: optionalAddress(params, "slash_marker"),
        treasuryTokenVault: optionalAddress(params, "treasury_token_vault"),
        tokenProgram: optionalAddress(params, "token_program"),
      });
    case "slash_token_with_verdict":
      return context.client.slashTokenWithVerdict({
        adjudicator: context.signer,
        identity: addressParam(params, "identity"),
        tokenStake: addressParam(params, "token_stake"),
        disputeReceipt: addressParam(params, "dispute_receipt"),
        mint: addressParam(params, "mint"),
        vault: optionalAddress(params, "vault"),
        verdict: optionalAddress(params, "verdict"),
        slashMarker: optionalAddress(params, "slash_marker"),
        treasuryTokenVault: optionalAddress(params, "treasury_token_vault"),
        tokenProgram: optionalAddress(params, "token_program"),
      });
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewReputation(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "initialize_domain_catalog":
    case "ensure_domain_catalog":
    case "register_domain":
    case "ensure_domain_registered":
      return { domainCatalog: await context.client.getDomainCatalogAddress() };
    case "initialize_cpi_authority":
    case "ensure_cpi_authority":
      return { cpiAuthority: await context.client.bindCpiAuthority() };
    case "create_reputation_domain":
    case "ensure_reputation_domain":
      return context.client.bindReputation({
        identity: addressParam(params, "identity"),
        taskOrDomain: taskOrDomain(params),
      });
    case "apply_reputation_receipt":
      return {
        identity: addressParam(params, "identity"),
        receipt: addressParam(params, "receipt"),
        reputation: addressParam(params, "reputation"),
        evidenceAccounts: evidenceAccounts(params),
      };
    default:
      throw unsupportedAction(params.action);
  }
}

async function submitReputation(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "initialize_domain_catalog":
      return context.client.initializeDomainCatalog({
        curator: context.signer,
      });
    case "ensure_domain_catalog":
      return context.client.ensureDomainCatalog({ curator: context.signer });
    case "register_domain":
      return context.client.registerDomain({
        curator: context.signer,
        domainCatalog: addressParam(params, "domain_catalog"),
        taskOrDomain: taskOrDomain(params),
      });
    case "ensure_domain_registered":
      return context.client.ensureDomainRegistered({
        curator: context.signer,
        domainCatalog: addressParam(params, "domain_catalog"),
        taskOrDomain: taskOrDomain(params),
      });
    case "initialize_cpi_authority":
      return context.client.initializeCpiAuthority({ payer: context.signer });
    case "ensure_cpi_authority":
      return context.client.ensureCpiAuthority({ payer: context.signer });
    case "create_reputation_domain":
      return context.client.createReputationDomain({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        domainCatalog: addressParam(params, "domain_catalog"),
        taskOrDomain: taskOrDomain(params),
        completionWeight: optionalBigInt(params, "completion_weight"),
        disputeWeight: optionalBigInt(params, "dispute_weight"),
        disputeResolvedWeight: optionalBigInt(
          params,
          "dispute_resolved_weight",
        ),
      });
    case "ensure_reputation_domain":
      return context.client.ensureReputationDomain({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        domainCatalog: addressParam(params, "domain_catalog"),
        taskOrDomain: taskOrDomain(params),
        completionWeight: optionalBigInt(params, "completion_weight"),
        disputeWeight: optionalBigInt(params, "dispute_weight"),
        disputeResolvedWeight: optionalBigInt(
          params,
          "dispute_resolved_weight",
        ),
      });
    case "apply_reputation_receipt":
      return context.client.applyReputationReceipt({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        receipt: addressParam(params, "receipt"),
        reputation: addressParam(params, "reputation"),
        evidenceAccounts: evidenceAccounts(params),
      });
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewAttester(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  if (
    params.action === "initialize_attester_registry" ||
    params.action === "ensure_attester_registry"
  ) {
    return { registry: "attester_registry_config" };
  }
  return context.client.bindAttester({
    identity: addressParam(params, "identity"),
  });
}

async function submitAttester(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "initialize_attester_registry":
      return context.client.initializeAttesterRegistry({
        curator: context.signer,
      });
    case "ensure_attester_registry":
      return context.client.ensureAttesterRegistry({ curator: context.signer });
    case "register_attester":
      return context.client.registerAttester(attesterInput(params, context));
    case "ensure_attester":
      return context.client.ensureAttester(attesterInput(params, context));
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewDelegation(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  return context.client.bindDelegation({
    identity: addressParam(params, "identity"),
    delegate: addressParam(params, "delegate"),
  });
}

async function submitDelegation(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  const input = {
    authority: context.signer,
    identity: addressParam(params, "identity"),
    delegate: addressParam(params, "delegate"),
    allowedActions: numberParam(params, "allowed_actions"),
    expiresAtSlot: optionalBigInt(params, "expires_at_slot"),
  };
  switch (params.action) {
    case "create_delegation":
      return context.client.createDelegation(input);
    case "ensure_delegation":
      return context.client.ensureDelegation(input);
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewCheckpoint(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "initialize_history_updater":
    case "ensure_history_updater":
      return { historyUpdater: await context.client.bindHistoryUpdater() };
    case "initialize_history_checkpoint":
    case "ensure_history_checkpoint":
      return context.client.bindHistoryCheckpoint({
        identity: addressParam(params, "identity"),
        epoch: bigintParam(params, "epoch"),
      });
    case "append_receipt_to_checkpoint":
      return {
        identity: addressParam(params, "identity"),
        checkpoint: addressParam(params, "checkpoint"),
        latestCheckpoint: addressParam(params, "latest_checkpoint"),
        receipt: addressParam(params, "receipt"),
      };
    default:
      throw unsupportedAction(params.action);
  }
}

async function submitCheckpoint(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "initialize_history_updater":
      return context.client.initializeHistoryUpdater({ payer: context.signer });
    case "ensure_history_updater":
      return context.client.ensureHistoryUpdater({ payer: context.signer });
    case "initialize_history_checkpoint":
      return context.client.initializeHistoryCheckpoint({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        epoch: bigintParam(params, "epoch"),
      });
    case "ensure_history_checkpoint":
      return context.client.ensureHistoryCheckpoint({
        authority: context.signer,
        identity: addressParam(params, "identity"),
        epoch: bigintParam(params, "epoch"),
      });
    case "append_receipt_to_checkpoint":
      return context.client.appendReceiptToCheckpoint({
        feePayer: context.signer,
        identity: addressParam(params, "identity"),
        checkpoint: addressParam(params, "checkpoint"),
        latestCheckpoint: addressParam(params, "latest_checkpoint"),
        receipt: addressParam(params, "receipt"),
      });
    default:
      throw unsupportedAction(params.action);
  }
}

async function previewDispute(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  if (
    params.action === "register_adjudicator" ||
    params.action === "ensure_adjudicator"
  ) {
    return context.client.bindAdjudicator();
  }
  return context.client.bindVerdict({
    disputeReceipt: addressParam(params, "dispute_receipt"),
  });
}

async function submitDispute(
  params: { readonly action: string },
  context: WriteExecutionContext,
): Promise<unknown> {
  switch (params.action) {
    case "register_adjudicator":
      return context.client.registerAdjudicator({
        governance: context.signer,
        adjudicator: optionalAddress(params, "adjudicator"),
      });
    case "ensure_adjudicator":
      return context.client.ensureAdjudicator({
        governance: context.signer,
        adjudicator: optionalAddress(params, "adjudicator"),
      });
    case "record_verdict":
      return context.client.recordVerdict(verdictInput(params, context));
    case "ensure_verdict":
      return context.client.ensureVerdict(verdictInput(params, context));
    default:
      throw unsupportedAction(params.action);
  }
}

function createClientForMode(
  mode: WriteMode,
  config: McpWriteConfig,
): TrustSubstrateOnchainClient {
  if (mode === "submit") {
    return new TrustSubstrateOnchainClient(
      createKitTransactionDispatcher({
        rpcUrl: config.rpcUrl,
        rpcSubscriptionsUrl: config.rpcSubscriptionsUrl,
        commitment: config.commitment,
      }),
    );
  }
  const dispatcher: OnchainTransactionDispatcher = {
    async send(): Promise<OnchainOperationResult> {
      throw new Error("Preview mode never signs or submits transactions");
    },
  };
  return new TrustSubstrateOnchainClient(dispatcher);
}

function identityRecord(
  params: Record<string, unknown>,
  signer: KeyPairSigner,
): IdentityRecord {
  const raw = params.identity_record;
  if (raw && typeof raw === "object") return raw as IdentityRecord;
  return createIdentityRecord({
    authority: signer.address,
    label: stringParam(params, "identity_label"),
  });
}

function taskRecord(params: Record<string, unknown>): TaskRecord {
  const raw = params.task_record;
  if (raw && typeof raw === "object") return raw as TaskRecord;
  return createTaskRecord({
    identityId: stringParam(params, "identity_id"),
    title: stringParam(params, "task_title"),
    description: optionalString(params, "task_description"),
    domain: optionalString(params, "domain"),
    subtasks: optionalStringArray(params, "subtasks"),
  });
}

function receiptRecord(params: Record<string, unknown>): ReceiptRecord {
  const raw = params.receipt_record;
  if (raw && typeof raw === "object") return raw as ReceiptRecord;
  return createReceiptRecord({
    actorId: stringParam(params, "actor_id"),
    kind: stringParam(params, "receipt_kind") as ReceiptKind,
    taskId: stringParam(params, "task_id"),
    payload: optionalRecord(params, "payload"),
    sequence: numberParam(params, "sequence"),
    previousReceiptId: optionalString(params, "previous_receipt_id"),
  });
}

async function receiptRecordForTask(
  params: Record<string, unknown>,
  context: WriteExecutionContext,
): Promise<ReceiptRecord> {
  const raw = params.receipt_record;
  if (raw && typeof raw === "object") return raw as ReceiptRecord;
  if (params.sequence !== undefined) return receiptRecord(params);
  if (context.mode !== "submit") {
    throw new Error(
      "sequence is required in preview mode; omit it only when submitting so the MCP server can read the current task chain head",
    );
  }

  const task = await context.client.fetchTask({
    task: addressParam(params, "task"),
  });
  const nextSequence = task.lastSequence + 1n;
  if (nextSequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Receipt sequence ${nextSequence.toString()} is too large`);
  }
  return createReceiptRecord({
    actorId: stringParam(params, "actor_id"),
    kind: stringParam(params, "receipt_kind") as ReceiptKind,
    taskId: stringParam(params, "task_id"),
    payload: optionalRecord(params, "payload"),
    sequence: Number(nextSequence),
    previousReceiptId:
      task.lastReceipt === ZERO_ADDRESS ? undefined : task.lastReceipt,
  });
}

function societyWorldInput(
  params: Record<string, unknown>,
  context: WriteExecutionContext,
) {
  return {
    authority: context.signer,
    identity: addressParam(params, "identity"),
    task: addressParam(params, "task"),
    currentTick: numberParam(params, "current_tick"),
    lastSequence: bigintParam(params, "last_sequence"),
    lastReceipt: addressParam(params, "last_receipt"),
    status: numberParam(params, "status"),
    state: bytesFromHex(optionalString(params, "state_hex") ?? ""),
  };
}

function taskOrDomain(params: Record<string, unknown>): TaskRecord | string {
  const raw = params.task_record;
  if (raw && typeof raw === "object") return raw as TaskRecord;
  return stringParam(params, "task_or_domain");
}

function evidenceAccounts(
  params: Record<string, unknown>,
): readonly OnchainReputationEvidenceAccount[] | undefined {
  const accounts = params.evidence_accounts;
  if (!Array.isArray(accounts)) return undefined;
  return accounts.map((account) => {
    if (!account || typeof account !== "object") {
      throw new Error("evidence_accounts entries must be objects");
    }
    const entry = account as {
      readonly address?: unknown;
      readonly writable?: unknown;
    };
    if (typeof entry.address !== "string") {
      throw new Error("evidence_accounts entries require an address string");
    }
    return {
      address: address(entry.address),
      writable:
        typeof entry.writable === "boolean" ? entry.writable : undefined,
    };
  });
}

function attesterInput(
  params: Record<string, unknown>,
  context: WriteExecutionContext,
) {
  return {
    authority: context.signer,
    identity: addressParam(params, "identity"),
    category: stringParam(params, "category"),
    selfDeclaredTier: numberParam(params, "self_declared_tier"),
  };
}

function verdictInput(
  params: Record<string, unknown>,
  context: WriteExecutionContext,
) {
  return {
    adjudicator: context.signer,
    disputeReceipt: addressParam(params, "dispute_receipt"),
    outcome: numberParam(params, "outcome"),
    slashAmount: bigintParam(params, "slash_amount"),
    class: numberParam(params, "class"),
    staleAfterSlot: bigintParam(params, "stale_after_slot"),
  };
}

async function loadSigner(path: string): Promise<KeyPairSigner> {
  const contents = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(contents);
  if (!Array.isArray(parsed) || parsed.length !== SOLANA_KEYPAIR_LENGTH) {
    throw new Error(
      `Keypair at ${path} must be a JSON array of ${SOLANA_KEYPAIR_LENGTH} bytes`,
    );
  }
  return createKeyPairSignerFromBytes(Uint8Array.from(parsed));
}

function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalString(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}

function optionalStringArray(
  params: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value;
}

function optionalRecord(
  params: Record<string, unknown>,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function numberParam(params: Record<string, unknown>, key: string): number {
  const value = params[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer`);
  }
  return value;
}

function bigintParam(params: Record<string, unknown>, key: string): bigint {
  const value = params[key];
  if (typeof value === "number" && Number.isInteger(value))
    return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error(`${key} must be an integer or integer string`);
}

function optionalBigInt(
  params: Record<string, unknown>,
  key: string,
): bigint | undefined {
  return params[key] === undefined ? undefined : bigintParam(params, key);
}

function addressParam(params: Record<string, unknown>, key: string): Address {
  return address(stringParam(params, key));
}

function optionalAddress(
  params: Record<string, unknown>,
  key: string,
): Address | undefined {
  const value = optionalString(params, key);
  return value ? address(value) : undefined;
}

function bytesFromHex(value: string): Uint8Array {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length === 0) return new Uint8Array();
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error("state_hex must be an even-length hex string");
  }
  return Uint8Array.from(
    clean.match(/../g)?.map((byte) => parseInt(byte, 16)) ?? [],
  );
}

function parseCommitment(value: string | undefined): Commitment {
  if (value === "processed" || value === "confirmed" || value === "finalized") {
    return value;
  }
  return "confirmed";
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function unsupportedAction(action: string): Error {
  return new Error(`Unsupported protocol write action: ${action}`);
}

function actionMetadata(
  group: ProtocolWriteGroup,
  action: string,
): { readonly destructive: boolean; readonly idempotent: boolean } {
  const destructive =
    group === "stake" &&
    (action.includes("slash") ||
      action.includes("unstake") ||
      action.includes("finalize"));
  const idempotent =
    action.startsWith("ensure_") ||
    action.startsWith("initialize_") ||
    action === "sync_task_status";
  return { destructive, idempotent };
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]),
    );
  }
  return value;
}

function formatWritePayload(payload: unknown, responseFormat: string): string {
  const safePayload = toJsonSafe(payload);
  if (responseFormat === JSON_RESPONSE_FORMAT) {
    return JSON.stringify(safePayload, null, 2);
  }
  if (
    safePayload &&
    typeof safePayload === "object" &&
    "action" in safePayload &&
    "mode" in safePayload
  ) {
    const result = safePayload as ProtocolWriteResult;
    return [
      `Trust Substrate ${result.group} ${result.action}`,
      `Mode: ${result.mode}`,
      `Submitted: ${String(result.submitted)}`,
      result.submitRefused
        ? "Submit refused: confirm=true was not supplied."
        : undefined,
      `Signer: ${result.signer}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(safePayload, null, 2);
}

async function runAsyncTool(
  action: () => Promise<{
    readonly payload: ToolPayload;
    readonly text: string;
  }>,
) {
  try {
    const result = await action();
    return {
      content: [{ type: "text" as const, text: result.text }],
      structuredContent: result.payload,
    };
  } catch (error) {
    const message = errorMessage(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      structuredContent: { error: message },
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const WRITE_TOOL_NAMES = [
  "trust_substrate_identity_write",
  "trust_substrate_task_write",
  "trust_substrate_receipt_write",
  "trust_substrate_stake_write",
  "trust_substrate_reputation_write",
  "trust_substrate_attester_write",
  "trust_substrate_delegation_write",
  "trust_substrate_checkpoint_write",
  "trust_substrate_dispute_write",
] as const;

const SUPPORTED_OPERATIONS: Readonly<
  Record<ProtocolWriteGroup, readonly string[]>
> = {
  identity: IdentityWriteInputSchema.shape.action.options,
  task: TaskWriteInputSchema.shape.action.options,
  receipt: ReceiptWriteInputSchema.shape.action.options,
  stake: StakeWriteInputSchema.shape.action.options,
  reputation: ReputationWriteInputSchema.shape.action.options,
  attester: AttesterWriteInputSchema.shape.action.options,
  delegation: DelegationWriteInputSchema.shape.action.options,
  checkpoint: CheckpointWriteInputSchema.shape.action.options,
  dispute: DisputeWriteInputSchema.shape.action.options,
};
