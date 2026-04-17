import { Agent, type AgentMessage, type ThinkingLevel } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import {
  AppStorage,
  CustomProvidersStore,
  IndexedDBStorageBackend,
  ProviderKeysStore,
  SessionsStore,
  SettingsStore,
  createExtractDocumentTool,
  createJavaScriptReplTool,
  defaultConvertToLlm,
  setAppStorage,
} from "@mariozechner/pi-web-ui";

import {
  createLocalRuntimeStreamFn,
  loadLocalRuntimeConfig,
  pickDefaultModel,
  resolveApiKey,
  syncLocalRuntimeProviderKeys,
  type LocalRuntimeConfig,
} from "@/lib/local-runtime";

const STORAGE_NAME = "trust-substrate-pi-console";
const STORAGE_VERSION = 1;
const PI_CONSOLE_SESSION_ID = "trust-substrate-pi-console";

const settingsStore = new SettingsStore();
const providerKeysStore = new ProviderKeysStore();
const sessionsStore = new SessionsStore();
const customProvidersStore = new CustomProvidersStore();
const storageBackend = new IndexedDBStorageBackend({
  dbName: STORAGE_NAME,
  version: STORAGE_VERSION,
  stores: [
    settingsStore.getConfig(),
    SessionsStore.getMetadataConfig(),
    providerKeysStore.getConfig(),
    customProvidersStore.getConfig(),
    sessionsStore.getConfig(),
  ],
});

settingsStore.setBackend(storageBackend);
providerKeysStore.setBackend(storageBackend);
sessionsStore.setBackend(storageBackend);
customProvidersStore.setBackend(storageBackend);

let storageReady = false;

export interface PiModelPreference {
  provider: string;
  modelId: string;
}

export interface CreatePiConsoleAgentInput {
  systemPrompt: string;
  messages?: AgentMessage[];
  preferredModel?: PiModelPreference | null;
  thinkingLevel?: ThinkingLevel;
}

export interface PiConsoleAgentHandle {
  agent: Agent;
  runtime: LocalRuntimeConfig;
}

export async function createPiConsoleAgent(
  input: CreatePiConsoleAgentInput,
): Promise<PiConsoleAgentHandle> {
  ensurePiStorage();

  const runtime = await loadLocalRuntimeConfig();
  await syncLocalRuntimeProviderKeys(runtime);

  const model =
    resolvePreferredModel(runtime, input.preferredModel) ?? pickDefaultModel(runtime);

  const agent = new Agent({
    sessionId: PI_CONSOLE_SESSION_ID,
    initialState: {
      systemPrompt: input.systemPrompt,
      model,
      thinkingLevel: input.thinkingLevel ?? "off",
      messages: input.messages ?? [],
      tools: createPiConsoleTools(),
    },
    convertToLlm: defaultConvertToLlm,
    getApiKey: async (provider) => {
      return await resolveApiKey(runtime, provider);
    },
    streamFn: createLocalRuntimeStreamFn(runtime),
  });

  return {
    agent,
    runtime,
  };
}

function ensurePiStorage() {
  if (storageReady) {
    return;
  }

  setAppStorage(
    new AppStorage(
      settingsStore,
      providerKeysStore,
      sessionsStore,
      customProvidersStore,
      storageBackend,
    ),
  );
  storageReady = true;
}

function resolvePreferredModel(
  runtime: LocalRuntimeConfig,
  preferredModel: PiModelPreference | null | undefined,
) {
  if (!preferredModel) {
    return null;
  }

  return (
    getModel(preferredModel.provider as never, preferredModel.modelId as never) ??
    pickDefaultModel(runtime)
  );
}

function createPiConsoleTools() {
  return [createJavaScriptReplTool(), createExtractDocumentTool()];
}
