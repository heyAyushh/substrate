export const EIP8004_REGISTRATION_TYPE =
  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
export const EIP8004_FEEDBACK_TYPE =
  "https://eips.ethereum.org/EIPS/eip-8004#feedback-v1";
export const TRUST_SUBSTRATE_EXPORT_VERSION = "0.1.0";

export type Eip8004SupportedTrust =
  | "reputation"
  | "crypto-economic"
  | "validation"
  | "receipts"
  | "checkpoints";

export interface Eip8004Service {
  readonly name: string;
  readonly endpoint: string;
  readonly version?: string;
  readonly skills?: readonly string[];
  readonly domains?: readonly string[];
}

export interface Eip8004Registration {
  readonly agentId: string | number;
  readonly agentRegistry: string;
}

export interface TrustSubstrateEip8004Config {
  readonly name: string;
  readonly description: string;
  readonly image?: string;
  readonly active?: boolean;
  readonly agentId: string | number;
  readonly agentRegistry: string;
  readonly identityAddress: string;
  readonly agentWallet?: string;
  readonly domain?: string;
  readonly a2aAgentCardUrl?: string;
  readonly mcpEndpoint?: string;
  readonly mcpWritesEnabled?: boolean;
  readonly acpDescriptorUrl?: string;
  readonly webUrl?: string;
  readonly societyUrl?: string;
  readonly piConsoleUrl?: string;
  readonly x402Support?: boolean;
  readonly supportedTrust?: readonly Eip8004SupportedTrust[];
  readonly reputationAddress?: string;
  readonly stakeAddress?: string;
  readonly checkpointAddress?: string;
  readonly validationEndpoint?: string;
}

export interface Eip8004RegistrationFile {
  readonly type: typeof EIP8004_REGISTRATION_TYPE;
  readonly name: string;
  readonly description: string;
  readonly image?: string;
  readonly services: readonly Eip8004Service[];
  readonly x402Support: boolean;
  readonly active: boolean;
  readonly registrations: readonly Eip8004Registration[];
  readonly supportedTrust: readonly Eip8004SupportedTrust[];
  readonly trustSubstrate: {
    readonly exportVersion: string;
    readonly note: "metadata-export-only";
    readonly identityAddress: string;
    readonly agentWallet?: string;
    readonly domain?: string;
    readonly reputationAddress?: string;
    readonly stakeAddress?: string;
    readonly checkpointAddress?: string;
    readonly mcpWritesEnabled: boolean;
  };
}

export interface TrustSubstrateEip8004FeedbackInput {
  readonly agentRegistry: string;
  readonly agentId: string | number;
  readonly clientAddress: string;
  readonly createdAt: string;
  readonly value: number;
  readonly valueDecimals?: number;
  readonly tag1?: string;
  readonly tag2?: string;
  readonly endpoint?: string;
  readonly receiptAddress?: string;
  readonly receiptHash?: string;
  readonly txSignature?: string;
  readonly taskId?: string;
  readonly contextId?: string;
}

export interface Eip8004FeedbackFile {
  readonly type: typeof EIP8004_FEEDBACK_TYPE;
  readonly agentRegistry: string;
  readonly agentId: string | number;
  readonly clientAddress: string;
  readonly createdAt: string;
  readonly value: number;
  readonly valueDecimals: number;
  readonly tag1?: string;
  readonly tag2?: string;
  readonly endpoint?: string;
  readonly a2a?: {
    readonly taskId?: string;
    readonly contextId?: string;
  };
  readonly trustSubstrate: {
    readonly receiptAddress?: string;
    readonly receiptHash?: string;
    readonly txSignature?: string;
  };
}

export interface TrustSubstrateEip8004ValidationInput {
  readonly agentRegistry: string;
  readonly agentId: string | number;
  readonly validatorAddress: string;
  readonly createdAt: string;
  readonly outcome: "accepted" | "rejected" | "inconclusive";
  readonly receiptAddress?: string;
  readonly verdictAddress?: string;
  readonly checkpointRoot?: string;
  readonly txSignature?: string;
}

export interface Eip8004ValidationFile {
  readonly type: "https://trustsubstrate.dev/eip8004/validation-v1";
  readonly agentRegistry: string;
  readonly agentId: string | number;
  readonly validatorAddress: string;
  readonly createdAt: string;
  readonly outcome: TrustSubstrateEip8004ValidationInput["outcome"];
  readonly trustSubstrate: {
    readonly receiptAddress?: string;
    readonly verdictAddress?: string;
    readonly checkpointRoot?: string;
    readonly txSignature?: string;
  };
}

export function buildEip8004RegistrationFile(
  config: TrustSubstrateEip8004Config,
): Eip8004RegistrationFile {
  return {
    type: EIP8004_REGISTRATION_TYPE,
    name: config.name,
    description: config.description,
    image: config.image,
    services: buildServices(config),
    x402Support: config.x402Support ?? false,
    active: config.active ?? true,
    registrations: [
      {
        agentId: config.agentId,
        agentRegistry: config.agentRegistry,
      },
    ],
    supportedTrust: config.supportedTrust ?? [
      "reputation",
      "crypto-economic",
      "validation",
      "receipts",
      "checkpoints",
    ],
    trustSubstrate: {
      exportVersion: TRUST_SUBSTRATE_EXPORT_VERSION,
      note: "metadata-export-only",
      identityAddress: config.identityAddress,
      agentWallet: config.agentWallet,
      domain: config.domain,
      reputationAddress: config.reputationAddress,
      stakeAddress: config.stakeAddress,
      checkpointAddress: config.checkpointAddress,
      mcpWritesEnabled: config.mcpWritesEnabled === true,
    },
  };
}

export function buildEip8004FeedbackFile(
  input: TrustSubstrateEip8004FeedbackInput,
): Eip8004FeedbackFile {
  return {
    type: EIP8004_FEEDBACK_TYPE,
    agentRegistry: input.agentRegistry,
    agentId: input.agentId,
    clientAddress: input.clientAddress,
    createdAt: input.createdAt,
    value: input.value,
    valueDecimals: input.valueDecimals ?? 0,
    tag1: input.tag1,
    tag2: input.tag2,
    endpoint: input.endpoint,
    a2a:
      input.taskId || input.contextId
        ? {
            taskId: input.taskId,
            contextId: input.contextId,
          }
        : undefined,
    trustSubstrate: {
      receiptAddress: input.receiptAddress,
      receiptHash: input.receiptHash,
      txSignature: input.txSignature,
    },
  };
}

export function buildEip8004ValidationFile(
  input: TrustSubstrateEip8004ValidationInput,
): Eip8004ValidationFile {
  return {
    type: "https://trustsubstrate.dev/eip8004/validation-v1",
    agentRegistry: input.agentRegistry,
    agentId: input.agentId,
    validatorAddress: input.validatorAddress,
    createdAt: input.createdAt,
    outcome: input.outcome,
    trustSubstrate: {
      receiptAddress: input.receiptAddress,
      verdictAddress: input.verdictAddress,
      checkpointRoot: input.checkpointRoot,
      txSignature: input.txSignature,
    },
  };
}

function buildServices(
  config: TrustSubstrateEip8004Config,
): readonly Eip8004Service[] {
  return [
    config.webUrl ? service("web", config.webUrl) : undefined,
    config.a2aAgentCardUrl
      ? service("A2A", config.a2aAgentCardUrl, "0.3.0")
      : undefined,
    config.mcpEndpoint
      ? service("MCP", config.mcpEndpoint, "2025-06-18")
      : undefined,
    config.acpDescriptorUrl
      ? service("ACP", config.acpDescriptorUrl, "0.2.3")
      : undefined,
    config.validationEndpoint
      ? service(
          "Validation",
          config.validationEndpoint,
          TRUST_SUBSTRATE_EXPORT_VERSION,
        )
      : undefined,
    config.societyUrl ? service("Society Demo", config.societyUrl) : undefined,
    config.piConsoleUrl
      ? service("Pi Console Demo", config.piConsoleUrl)
      : undefined,
    service(
      "Trust Substrate",
      `solana:${config.identityAddress}`,
      TRUST_SUBSTRATE_EXPORT_VERSION,
      ["identity", "receipts", "reputation", "stake", "checkpoints"],
      config.domain ? [config.domain] : undefined,
    ),
  ].filter((entry): entry is Eip8004Service => Boolean(entry));
}

function service(
  name: string,
  endpoint: string,
  version?: string,
  skills?: readonly string[],
  domains?: readonly string[],
): Eip8004Service {
  return { name, endpoint, version, skills, domains };
}
