import {
  createAssistantMessageEventStream,
  getModel,
  streamSimple,
  type Api,
  type AssistantMessage,
  type Context,
  type Model as PiModel,
  type SimpleStreamOptions,
  type StopReason,
} from "@mariozechner/pi-ai";
import {
  applyProxyIfNeeded,
  getAppStorage,
} from "@mariozechner/pi-web-ui";
import type { StreamFn } from "@mariozechner/pi-agent-core";

const LOCAL_RUNTIME_ROUTE = "/__local/runtime";
const LOCAL_CHAT_ROUTE = "/__local/chat";
const LOCAL_CHAT_STREAM_ROUTE = "/__local/chat/stream";
const LOCAL_RUNTIME_SENTINEL_KEY = "__local-runtime__";
const DEFAULT_CODEX_MODEL_ID = "gpt-5.4";
const DEFAULT_CLAUDE_MODEL_ID = "claude-sonnet-4-6";
const DEFAULT_OPENAI_MODEL_ID = "gpt-5.4-mini";
const LOCAL_RUNTIME_ACTIVITY_EVENT = "pi-console:local-runtime-activity";

export type LocalProviderId = "openai-codex" | "anthropic";

interface RuntimeCapability {
  available: boolean;
  label: string;
  defaultModelId: string;
}

export interface LocalRuntimeConfig {
  codex: RuntimeCapability;
  claude: RuntimeCapability;
  defaultProvider: LocalProviderId | null;
}

interface LocalChatResponse {
  provider: LocalProviderId;
  text: string;
}

interface LocalChatStreamEvent {
  type: "assistant_text" | "activity_start" | "activity_end" | "done" | "error";
  provider?: LocalProviderId;
  id?: string;
  label?: string;
  detail?: string;
  output?: string;
  isError?: boolean;
  text?: string;
  message?: string;
}

export interface LocalChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LocalRuntimeOption {
  provider: LocalProviderId;
  label: string;
  defaultModelId: string;
}

export interface LocalRuntimeActivity {
  provider: LocalProviderId;
  phase: "start" | "end";
  id: string;
  label: string;
  detail?: string;
  output?: string;
  isError?: boolean;
}

export async function loadLocalRuntimeConfig(): Promise<LocalRuntimeConfig> {
  try {
    const response = await fetch(LOCAL_RUNTIME_ROUTE, {
      cache: "no-store",
    });

    if (!response.ok) {
      return createFallbackRuntimeConfig();
    }

    return (await response.json()) as LocalRuntimeConfig;
  } catch {
    return createFallbackRuntimeConfig();
  }
}

export function getDefaultRuntimeLabel(
  runtime: LocalRuntimeConfig,
): string | null {
  if (runtime.defaultProvider === "openai-codex" && runtime.codex.available) {
    return runtime.codex.label;
  }

  if (runtime.defaultProvider === "anthropic" && runtime.claude.available) {
    return runtime.claude.label;
  }

  return null;
}

export function listAvailableRuntimeOptions(
  runtime: LocalRuntimeConfig,
): LocalRuntimeOption[] {
  const options: LocalRuntimeOption[] = [];

  if (runtime.codex.available) {
    options.push({
      provider: "openai-codex",
      label: runtime.codex.label,
      defaultModelId: runtime.codex.defaultModelId,
    });
  }

  if (runtime.claude.available) {
    options.push({
      provider: "anthropic",
      label: runtime.claude.label,
      defaultModelId: runtime.claude.defaultModelId,
    });
  }

  return options;
}

export function getDefaultModelIdForProvider(
  runtime: LocalRuntimeConfig,
  provider: LocalProviderId | null,
): string | null {
  if (provider === "openai-codex" && runtime.codex.available) {
    return runtime.codex.defaultModelId;
  }

  if (provider === "anthropic" && runtime.claude.available) {
    return runtime.claude.defaultModelId;
  }

  return null;
}

export async function syncLocalRuntimeProviderKeys(
  runtime: LocalRuntimeConfig,
): Promise<void> {
  const storage = getAppStorage().providerKeys;

  await syncProviderKey(
    storage,
    "openai-codex",
    runtime.codex.available,
  );
  await syncProviderKey(storage, "anthropic", runtime.claude.available);
}

export function pickDefaultModel(runtime: LocalRuntimeConfig) {
  if (runtime.defaultProvider === "openai-codex" && runtime.codex.available) {
    return (
      getModel("openai-codex", runtime.codex.defaultModelId as never) ??
      getModel("openai-codex", DEFAULT_CODEX_MODEL_ID) ??
      getModel("openai", DEFAULT_OPENAI_MODEL_ID)!
    );
  }

  if (runtime.defaultProvider === "anthropic" && runtime.claude.available) {
    return (
      getModel("anthropic", runtime.claude.defaultModelId as never) ??
      getModel("anthropic", DEFAULT_CLAUDE_MODEL_ID) ??
      getModel("openai", DEFAULT_OPENAI_MODEL_ID)!
    );
  }

  return getModel("openai", DEFAULT_OPENAI_MODEL_ID)!;
}

export function createLocalRuntimeStreamFn(
  runtime: LocalRuntimeConfig,
): StreamFn {
  return async (model, context, options) => {
    if (shouldUseLocalCodex(runtime, model.provider)) {
      return streamFromLocalRuntime("openai-codex", model, context, options);
    }

    if (shouldUseLocalClaude(runtime, model.provider)) {
      return streamFromLocalRuntime("anthropic", model, context, options);
    }

    return streamRemoteModel(model, context, options);
  };
}

export async function resolveApiKey(
  runtime: LocalRuntimeConfig,
  provider: string,
): Promise<string | undefined> {
  if (shouldUseLocalCodex(runtime, provider) || shouldUseLocalClaude(runtime, provider)) {
    return LOCAL_RUNTIME_SENTINEL_KEY;
  }

  const key = await getAppStorage().providerKeys.get(provider);
  return key ?? undefined;
}

export async function requestLocalRuntimeChat(input: {
  provider: LocalProviderId;
  modelId: string;
  systemPrompt: string;
  messages: LocalChatRequestMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch(LOCAL_CHAT_ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: input.provider,
      modelId: input.modelId,
      systemPrompt: input.systemPrompt,
      messages: input.messages,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = (await response.json()) as LocalChatResponse;
  return payload.text ?? "";
}

export function subscribeToLocalRuntimeActivity(
  listener: (activity: LocalRuntimeActivity) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<LocalRuntimeActivity>).detail);
  };

  window.addEventListener(
    LOCAL_RUNTIME_ACTIVITY_EVENT,
    handleEvent as EventListener,
  );

  return () => {
    window.removeEventListener(
      LOCAL_RUNTIME_ACTIVITY_EVENT,
      handleEvent as EventListener,
    );
  };
}

function createFallbackRuntimeConfig(): LocalRuntimeConfig {
  return {
    codex: {
      available: false,
      label: "Local Codex",
      defaultModelId: DEFAULT_CODEX_MODEL_ID,
    },
    claude: {
      available: false,
      label: "Local Claude",
      defaultModelId: DEFAULT_CLAUDE_MODEL_ID,
    },
    defaultProvider: null,
  };
}

async function syncProviderKey(
  store: ReturnType<typeof getAppStorage>["providerKeys"],
  provider: LocalProviderId,
  isAvailable: boolean,
) {
  const currentValue = await store.get(provider);

  if (isAvailable) {
    if (!currentValue) {
      await store.set(provider, LOCAL_RUNTIME_SENTINEL_KEY);
    }
    return;
  }

  if (currentValue === LOCAL_RUNTIME_SENTINEL_KEY) {
    await store.delete(provider);
  }
}

function shouldUseLocalCodex(runtime: LocalRuntimeConfig, provider: string) {
  return provider === "openai-codex" && runtime.codex.available;
}

function shouldUseLocalClaude(runtime: LocalRuntimeConfig, provider: string) {
  return provider === "anthropic" && runtime.claude.available;
}

async function streamFromLocalRuntime(
  provider: LocalProviderId,
  model: PiModel<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) {
  const stream = createAssistantMessageEventStream();
  const partial = createAssistantMessage(model, "");
  partial.content = [];
  stream.push({ type: "start", partial: cloneAssistantMessage(partial) });

  void (async () => {
    try {
      const response = await fetch(LOCAL_CHAT_STREAM_ROUTE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          modelId: model.id,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error("Local runtime did not return a stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const textPartial = cloneAssistantMessage(partial);
      textPartial.content = [{ type: "text", text: "" }];
      let accumulatedText = "";
      let hasTextStarted = false;
      let buffer = "";

      const pushTextDelta = (delta: string) => {
        if (delta.length === 0) {
          return;
        }

        if (!hasTextStarted) {
          stream.push({
            type: "text_start",
            contentIndex: 0,
            partial: cloneAssistantMessage(textPartial),
          });
          hasTextStarted = true;
        }

        accumulatedText += delta;
        (textPartial.content[0] as { type: "text"; text: string }).text =
          accumulatedText;
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta,
          partial: cloneAssistantMessage(textPartial),
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        buffer = await flushLocalRuntimeEvents(buffer, async (event) => {
          await handleLocalRuntimeStreamEvent(event, pushTextDelta);
        });
      }

      if (buffer.trim().length > 0) {
        await flushLocalRuntimeEvents(buffer, async (event) => {
          await handleLocalRuntimeStreamEvent(event, pushTextDelta);
        });
      }

      const message = createAssistantMessage(model, accumulatedText);
      if (hasTextStarted) {
        stream.push({
          type: "text_end",
          contentIndex: 0,
          content: accumulatedText,
          partial: cloneAssistantMessage(textPartial),
        });
      }

      stream.push({
        type: "done",
        reason: "stop",
        message,
      });
      stream.end(message);
    } catch (error) {
      const failedMessage = createAssistantMessage(model, "");
      failedMessage.stopReason = options?.signal?.aborted ? "aborted" : "error";
      failedMessage.errorMessage =
        error instanceof Error ? error.message : "Local runtime failed";
      stream.push({
        type: "error",
        reason: failedMessage.stopReason,
        error: failedMessage,
      });
      stream.end(failedMessage);
    }
  })();

  return stream;
}

async function handleLocalRuntimeStreamEvent(
  event: LocalChatStreamEvent,
  pushTextDelta: (delta: string) => void,
) {
  if (event.type === "assistant_text" && typeof event.text === "string") {
    pushTextDelta(event.text);
    return;
  }

  if (
    (event.type === "activity_start" || event.type === "activity_end") &&
    event.provider &&
    event.id &&
    event.label
  ) {
    emitLocalRuntimeActivity({
      provider: event.provider,
      phase: event.type === "activity_start" ? "start" : "end",
      id: event.id,
      label: event.label,
      detail: event.detail,
      output: event.output,
      isError: event.isError,
    });
    return;
  }

  if (event.type === "error") {
    throw new Error(event.message ?? "Local runtime failed");
  }
}

async function flushLocalRuntimeEvents(
  buffer: string,
  onEvent: (event: LocalChatStreamEvent) => Promise<void>,
): Promise<string> {
  let remainder = buffer;
  let newlineIndex = remainder.indexOf("\n");

  while (newlineIndex >= 0) {
    const line = remainder.slice(0, newlineIndex).trim();
    remainder = remainder.slice(newlineIndex + 1);
    if (line.length > 0) {
      await onEvent(JSON.parse(line) as LocalChatStreamEvent);
    }
    newlineIndex = remainder.indexOf("\n");
  }

  return remainder;
}

async function streamRemoteModel(
  model: PiModel<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) {
  const proxyEnabled = await getAppStorage().settings.get("proxy.enabled");
  const proxyUrl = await getAppStorage().settings.get("proxy.url");
  const apiKey = options?.apiKey;
  const nextModel =
    apiKey && proxyEnabled
      ? applyProxyIfNeeded(model, apiKey, (proxyUrl as string | undefined) || undefined)
      : model;

  return streamSimple(nextModel, context, options);
}

function createAssistantMessage(
  model: PiModel<Api>,
  text: string,
  stopReason: StopReason = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content: text ? [{ type: "text", text }] : [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createEmptyUsage(),
    stopReason,
    timestamp: Date.now(),
  };
}

function createEmptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function cloneAssistantMessage<T>(message: T): T {
  return structuredClone(message);
}

function emitLocalRuntimeActivity(activity: LocalRuntimeActivity) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<LocalRuntimeActivity>(LOCAL_RUNTIME_ACTIVITY_EVENT, {
      detail: activity,
    }),
  );
}
