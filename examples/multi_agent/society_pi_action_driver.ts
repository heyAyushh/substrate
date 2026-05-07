import { hashCanonical } from "@trust-substrate/sdk/canonical";

export const SOCIETY_PI_ACTION_SCHEMA_VERSION = 1;

const LOCAL_CHAT_ROUTE = "/__local/chat";
const DEFAULT_PI_ACTION_TIMEOUT_MS = 120_000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export type SocietyPiProvider = "openai-codex" | "anthropic";
export type SocietyPiDecisionStatus = "accepted" | "refused";

export interface SocietyPiActionAgent {
  readonly id: string;
  readonly name?: string;
  readonly signer: string;
  readonly identity: string;
  readonly delegation: string;
}

export interface SocietyPiActionEvent {
  readonly id: string;
  readonly tick: number;
  readonly agentId: string;
  readonly action: string;
  readonly receiptKind?: string;
  readonly tokenDelta?: number;
  readonly cell?: {
    readonly x: number;
    readonly y: number;
  };
  readonly note?: string;
}

export interface SocietyPiAllowedAction {
  readonly id: string;
  readonly action: string;
  readonly receiptKind?: string;
  readonly tokenDelta?: number;
  readonly cell?: {
    readonly x: number;
    readonly y: number;
  };
  readonly note?: string;
}

export interface SocietyPiActionReceipt {
  readonly receiptId: string;
  readonly kind?: string;
  readonly payloadHash?: string;
}

export interface SocietyPiActionPromptInput {
  readonly sessionId: string;
  readonly runId: string;
  readonly commitId: string;
  readonly runtimeUrl: string;
  readonly provider: SocietyPiProvider;
  readonly modelId: string;
  readonly agent: SocietyPiActionAgent;
  readonly event: SocietyPiActionEvent;
  readonly allowedActions?: ReadonlyArray<SocietyPiAllowedAction>;
  readonly receipt: SocietyPiActionReceipt;
  readonly world: {
    readonly beforeReceipt?: string;
    readonly afterFrame?: unknown;
  };
  readonly timeoutMs?: number;
}

export interface SocietyPiActionDecision {
  readonly schemaVersion: number;
  readonly decision: SocietyPiDecisionStatus;
  readonly eventId: string;
  readonly agentId: string;
  readonly action: string;
  readonly selectedActionId?: string;
  readonly tick: number;
  readonly receiptId: string;
  readonly note?: string;
}

export interface SocietyPiActionEvidence {
  readonly schemaVersion: number;
  readonly kind: "pi-action";
  readonly provider: SocietyPiProvider;
  readonly modelId: string;
  readonly runtimeUrl: string;
  readonly systemPrompt: string;
  readonly messages: SocietyPiRuntimeRequest["messages"];
  readonly promptHash: string;
  readonly responseHash: string;
  readonly decisionHash: string;
  readonly decision: SocietyPiActionDecision;
  readonly rawResponse: string;
}

export interface SocietyPiRuntimeRequest {
  readonly runtimeUrl: string;
  readonly provider: SocietyPiProvider;
  readonly modelId: string;
  readonly systemPrompt: string;
  readonly messages: ReadonlyArray<{
    readonly role: "user" | "assistant";
    readonly content: string;
  }>;
  readonly timeoutMs: number;
}

export interface SocietyPiRuntimeClient {
  complete(request: SocietyPiRuntimeRequest): Promise<string>;
}

export const loopbackPiRuntimeClient: SocietyPiRuntimeClient = {
  async complete(request) {
    const response = await fetchWithTimeout(
      buildLocalChatUrl(request.runtimeUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: request.provider,
          modelId: request.modelId,
          systemPrompt: request.systemPrompt,
          messages: request.messages,
        }),
      },
      request.timeoutMs,
    );

    if (!response.ok) {
      throw new Error(`Pi local runtime failed: ${await response.text()}`);
    }

    const payload = (await response.json()) as { text?: unknown };
    return typeof payload.text === "string" ? payload.text : "";
  },
};

export function buildSocietyPiActionSystemPrompt(
  input: SocietyPiActionPromptInput,
): string {
  const allowedActions = normalizeAllowedActions(input);
  const assignment = {
    schemaVersion: SOCIETY_PI_ACTION_SCHEMA_VERSION,
    sessionId: input.sessionId,
    runId: input.runId,
    commitId: input.commitId,
    agent: input.agent,
    action: {
      eventId: input.event.id,
      receiptId: input.receipt.receiptId,
      tick: input.event.tick,
      agentId: input.event.agentId,
      action: input.event.action,
      receiptKind: input.event.receiptKind ?? input.receipt.kind ?? null,
      tokenDelta: input.event.tokenDelta ?? null,
      cell: input.event.cell ?? null,
      note: input.event.note ?? null,
    },
    allowedActions,
    world: {
      beforeReceipt: input.world.beforeReceipt ?? null,
      afterFrame: input.world.afterFrame ?? null,
    },
  };

  return [
    "You are a Trust Substrate Pi action agent.",
    "Choose exactly one allowed action for the assigned tick. Do not invent another action, agent, tick, or receipt.",
    "The current board can commit only actions from the allowedActions list. If none are safe, return a refused decision for the exact event.",
    "Your response becomes evidence for the signed receipt. The browser board is only a reader of committed Surfpool state.",
    "Action assignment JSON:",
    JSON.stringify(assignment, null, 2),
    "Return only strict JSON with this shape:",
    JSON.stringify(
      {
        schemaVersion: SOCIETY_PI_ACTION_SCHEMA_VERSION,
        decision: "accepted",
        eventId: input.event.id,
        agentId: input.event.agentId,
        action: input.event.action,
        selectedActionId: allowedActions[0].id,
        tick: input.event.tick,
        receiptId: input.receipt.receiptId,
        note: "short reason",
      },
      null,
      2,
    ),
  ].join("\n\n");
}

export async function requestSocietyPiAction(
  input: SocietyPiActionPromptInput,
  runtimeClient: SocietyPiRuntimeClient = loopbackPiRuntimeClient,
): Promise<SocietyPiActionEvidence> {
  const systemPrompt = buildSocietyPiActionSystemPrompt(input);
  const messages = [
    {
      role: "user" as const,
      content:
        "Execute the assigned Trust Substrate action now and return the strict JSON decision.",
    },
  ];
  const rawResponse = await runtimeClient.complete({
    runtimeUrl: input.runtimeUrl,
    provider: input.provider,
    modelId: input.modelId,
    systemPrompt,
    messages,
    timeoutMs: input.timeoutMs ?? DEFAULT_PI_ACTION_TIMEOUT_MS,
  });
  const decision = parseSocietyPiActionDecision(rawResponse);
  assertDecisionMatchesAssignment(decision, input);

  return {
    schemaVersion: SOCIETY_PI_ACTION_SCHEMA_VERSION,
    kind: "pi-action",
    provider: input.provider,
    modelId: input.modelId,
    runtimeUrl: input.runtimeUrl,
    systemPrompt,
    messages,
    promptHash: hashCanonical({ systemPrompt, messages }),
    responseHash: hashCanonical({ rawResponse }),
    decisionHash: hashCanonical(decision),
    decision,
    rawResponse,
  };
}

function parseSocietyPiActionDecision(
  response: string,
): SocietyPiActionDecision {
  const parsed = JSON.parse(stripJsonFence(response)) as Record<
    string,
    unknown
  >;
  const decision = readString(parsed.decision);
  const result = {
    schemaVersion: readNumber(parsed.schemaVersion),
    decision,
    eventId: readString(parsed.eventId),
    agentId: readString(parsed.agentId),
    action: readString(parsed.action),
    selectedActionId: readString(parsed.selectedActionId),
    tick: readNumber(parsed.tick),
    receiptId: readString(parsed.receiptId),
    note: readString(parsed.note),
  };

  if (
    result.schemaVersion !== SOCIETY_PI_ACTION_SCHEMA_VERSION ||
    (result.decision !== "accepted" && result.decision !== "refused") ||
    !result.eventId ||
    !result.agentId ||
    !result.action ||
    typeof result.tick !== "number" ||
    !result.receiptId
  ) {
    throw new Error("Pi action response did not match the required schema");
  }

  return result as SocietyPiActionDecision;
}

function assertDecisionMatchesAssignment(
  decision: SocietyPiActionDecision,
  input: SocietyPiActionPromptInput,
) {
  const allowedActions = normalizeAllowedActions(input);
  const selectedAction =
    typeof decision.selectedActionId === "string"
      ? allowedActions.find((action) => action.id === decision.selectedActionId)
      : allowedActions.find((action) => action.action === decision.action);
  if (!selectedAction) {
    throw new Error(
      "Pi action response selected an action outside the allowed set",
    );
  }

  if (
    decision.eventId !== input.event.id ||
    decision.agentId !== input.event.agentId ||
    decision.action !== selectedAction.action ||
    decision.tick !== input.event.tick ||
    decision.receiptId !== input.receipt.receiptId
  ) {
    throw new Error("Pi action response did not match assigned action");
  }

  if (decision.decision !== "accepted") {
    throw new Error(`Pi action was refused for ${input.event.id}`);
  }
}

function normalizeAllowedActions(
  input: SocietyPiActionPromptInput,
): ReadonlyArray<SocietyPiAllowedAction> {
  const supplied = Array.isArray(input.allowedActions)
    ? input.allowedActions.filter(
        (action) =>
          typeof action.id === "string" &&
          action.id.length > 0 &&
          typeof action.action === "string" &&
          action.action.length > 0,
      )
    : [];
  if (supplied.length > 0) {
    return supplied;
  }

  return [
    {
      id: input.event.id,
      action: input.event.action,
      receiptKind: input.event.receiptKind ?? input.receipt.kind,
      tokenDelta: input.event.tokenDelta,
      cell: input.event.cell,
      note: input.event.note,
    },
  ];
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildLocalChatUrl(runtimeUrl: string): string {
  const url = new URL(runtimeUrl);
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Pi local runtime URL must be loopback-only");
  }
  if (url.pathname.endsWith(LOCAL_CHAT_ROUTE)) {
    return url.toString();
  }
  url.pathname = `${url.pathname.replace(/\/+$/g, "")}${LOCAL_CHAT_ROUTE}`;
  return url.toString();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
