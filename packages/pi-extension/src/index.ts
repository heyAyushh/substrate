export { createTrustSubstrateExtension } from "./extension.js";
export type {
  PiExtensionHost,
  TrustSubstrateExtensionOptions,
  TurnCommitHandler,
  TurnCommitInput,
} from "./extension.js";
export { TurnBuffer } from "./turn-buffer.js";
export type { BufferedToolCall } from "./turn-buffer.js";
export {
  PI_SUPPORTED_TOOL_NAMES,
  isSupportedPiToolName,
  toPiToolCall,
} from "./pi-events.js";
export {
  DEFAULT_BLOB_DIR,
  DEFAULT_DOMAIN,
  DEFAULT_IDENTITY_LABEL,
  DEFAULT_INDEX_DB_PATH,
  DEFAULT_RPC_SUBSCRIPTIONS_URL,
  DEFAULT_RPC_URL,
  DEFAULT_RUN_DASHBOARD_URL,
  DEFAULT_SURFPOOL_STUDIO_URL,
  DEFAULT_TASK_TITLE,
  loadExtensionConfig,
} from "./config.js";
export type { ExtensionConfig, LoadConfigInput } from "./config.js";
export { loadKeyPairSignerFromFile } from "./keypair.js";
export {
  buildBridgeCommitInput,
  createSubstrateSessionCommitter,
} from "./session-commit.js";
export type {
  SessionCommitterInput,
  SubstrateBindings,
} from "./session-commit.js";
export { bootstrapSubstrateSession } from "./session-bootstrap.js";
export type { BootstrapInput, BootstrapResult } from "./session-bootstrap.js";
export { createSubstrateExtension } from "./substrate-extension.js";
export type {
  SubstrateExtensionHandle,
  SubstrateExtensionOptions,
} from "./substrate-extension.js";
export { evaluateDelegationGate, gateToolCall } from "./delegation-gate.js";
export type {
  DelegationGateDecision,
  DelegationGateInput,
  ToolCallGateInput,
} from "./delegation-gate.js";
export {
  buildSubstrateCommandDefinitions,
  registerSubstrateCommands,
} from "./slash-commands.js";
export type {
  SlashCommandDeps,
  SubstrateCommandContext,
  SubstrateCommandDefinition,
  SubstrateCommandHandler,
  SubstrateCommandHost,
  SubstrateCommandResult,
} from "./slash-commands.js";

import { createTrustSubstrateExtension } from "./extension.js";

export default createTrustSubstrateExtension;
