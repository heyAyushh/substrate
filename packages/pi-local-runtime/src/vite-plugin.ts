import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import type { Plugin } from "vite";

import {
  DEFAULT_CLAUDE_MODEL_ID,
  DEFAULT_CODEX_MODEL_ID,
  DEFAULT_COMMAND_TIMEOUT_MS,
  LOCAL_CHAT_ROUTE,
  LOCAL_CHAT_STREAM_ROUTE,
  LOCAL_RUNTIME_ROUTE,
} from "./constants.js";
import type {
  LocalChatRequestPayload,
  LocalChatStreamEvent,
  LocalMcpServer,
  LocalProviderId,
  LocalRuntimeConfig,
} from "./types.js";

interface MiddlewareStack {
  use(
    handler: (
      request: IncomingMessage & { url?: string; method?: string },
      response: ServerResponse,
      next: () => void,
    ) => void | Promise<void>,
  ): void;
}

const LOCALHOST_NAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const LOOPBACK_REMOTE_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);
const CHILD_TERMINATION_GRACE_MS = 1_500;

export interface LocalRuntimePluginOptions {
  workspaceRoot?: string;
  commandTimeoutMs?: number;
}

export function localRuntimePlugin(
  options: LocalRuntimePluginOptions = {},
): Plugin {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const commandTimeoutMs =
    options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  return {
    name: "local-runtime-bridge",
    configureServer(server) {
      attachLocalRuntimeMiddleware(
        server.middlewares,
        workspaceRoot,
        commandTimeoutMs,
      );
    },
    configurePreviewServer(server) {
      attachLocalRuntimeMiddleware(
        server.middlewares,
        workspaceRoot,
        commandTimeoutMs,
      );
    },
  };
}

function attachLocalRuntimeMiddleware(
  middlewares: MiddlewareStack,
  workspaceRoot: string,
  commandTimeoutMs: number,
) {
  middlewares.use(async (request, response, next) => {
    const pathname = readRequestPathname(request.url);

    if (isLocalRuntimeRoute(pathname) && !isTrustedLocalRequest(request)) {
      respondJson(response, 403, {
        error: "Local runtime routes only accept loopback requests.",
      });
      return;
    }

    if (pathname === LOCAL_RUNTIME_ROUTE && request.method === "GET") {
      respondJson(response, 200, detectLocalRuntime(workspaceRoot));
      return;
    }

    if (pathname === LOCAL_CHAT_STREAM_ROUTE && request.method === "POST") {
      try {
        const payload = (await readJsonBody(
          request,
        )) as LocalChatRequestPayload;
        const runtime = detectLocalRuntime(workspaceRoot);
        openEventStream(response);
        await streamLocalChat(
          runtime,
          payload,
          request,
          workspaceRoot,
          commandTimeoutMs,
          (event) => {
            writeEvent(response, event);
          },
        );
      } catch (error) {
        if (!response.headersSent) {
          openEventStream(response);
        }
        writeEvent(response, {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Local runtime stream failed",
        });
      } finally {
        response.end();
      }
      return;
    }

    if (pathname === LOCAL_CHAT_ROUTE && request.method === "POST") {
      try {
        const payload = (await readJsonBody(
          request,
        )) as LocalChatRequestPayload;
        const runtime = detectLocalRuntime(workspaceRoot);
        const result = await runLocalChat(
          runtime,
          payload,
          request,
          workspaceRoot,
          commandTimeoutMs,
        );
        respondJson(response, 200, result);
      } catch (error) {
        respondJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Local runtime request failed",
        });
      }
      return;
    }

    next();
  });
}

function readRequestPathname(requestUrl: string | undefined): string {
  try {
    return new URL(requestUrl ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}

function isLocalRuntimeRoute(pathname: string): boolean {
  return (
    pathname === LOCAL_RUNTIME_ROUTE ||
    pathname === LOCAL_CHAT_ROUTE ||
    pathname === LOCAL_CHAT_STREAM_ROUTE
  );
}

function isTrustedLocalRequest(request: IncomingMessage): boolean {
  return (
    isLoopbackRemoteAddress(request.socket.remoteAddress) &&
    isLocalHostHeader(readHeaderValue(request.headers.host)) &&
    isLocalOrigin(readHeaderValue(request.headers.origin))
  );
}

function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) {
    return false;
  }

  return LOOPBACK_REMOTE_ADDRESSES.has(remoteAddress);
}

function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) {
    return false;
  }

  try {
    return isLocalHostname(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  try {
    return isLocalHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function isLocalHostname(hostname: string): boolean {
  return LOCALHOST_NAMES.has(hostname.toLowerCase());
}

function readHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function detectLocalRuntime(workspaceRoot: string): LocalRuntimeConfig {
  const codexAvailable =
    commandExists("codex") && existsSync(path.join(homedir(), ".codex"));
  const claudeAvailable =
    commandExists("claude") && existsSync(path.join(homedir(), ".claude"));
  const mcpServers = codexAvailable ? detectCodexMcpServers(workspaceRoot) : [];

  return {
    codex: {
      available: codexAvailable,
      command: "codex",
      label: "Local Codex",
      defaultModelId: DEFAULT_CODEX_MODEL_ID,
    },
    claude: {
      available: claudeAvailable,
      command: "claude",
      label: "Local Claude",
      defaultModelId: DEFAULT_CLAUDE_MODEL_ID,
    },
    defaultProvider: codexAvailable
      ? "openai-codex"
      : claudeAvailable
        ? "anthropic"
        : null,
    mcpServers,
  };
}

function commandExists(command: string): boolean {
  const result = spawnSync("zsh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function detectCodexMcpServers(workspaceRoot: string): LocalMcpServer[] {
  const result = spawnSync("codex", ["mcp", "list"], {
    cwd: workspaceRoot,
    env: process.env,
    encoding: "utf8",
  });

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return parseCodexMcpList(result.stdout);
}

function parseCodexMcpList(output: string): LocalMcpServer[] {
  const sections = output
    .split(/\n\s*\n/)
    .map((section) =>
      section
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean),
    )
    .filter((section) => section.length >= 2);

  const servers: LocalMcpServer[] = [];

  for (const section of sections) {
    const [headerLine, ...dataLines] = section;
    if (!headerLine || !headerLine.startsWith("Name")) {
      continue;
    }

    const headers = splitTableRow(headerLine);
    for (const dataLine of dataLines) {
      const cells = splitTableRow(dataLine);
      if (cells.length !== headers.length) {
        continue;
      }

      const row = Object.fromEntries(
        headers.map((header, index) => [header, cells[index] ?? ""]),
      );
      const name = row.Name?.trim();
      const status = row.Status?.trim();
      const auth = row.Auth?.trim();

      if (!name || !status || !auth) {
        continue;
      }

      if (row.Url) {
        servers.push({
          name,
          transport: "url",
          target: row.Url.trim(),
          status,
          auth,
        });
        continue;
      }

      if (row.Command) {
        const args = row.Args?.trim();
        servers.push({
          name,
          transport: "command",
          target: args ? `${row.Command.trim()} ${args}` : row.Command.trim(),
          status,
          auth,
        });
      }
    }
  }

  return servers;
}

function splitTableRow(row: string): string[] {
  return row
    .split(/\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function respondJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function runLocalChat(
  runtime: LocalRuntimeConfig,
  payload: LocalChatRequestPayload,
  request: IncomingMessage,
  workspaceRoot: string,
  commandTimeoutMs: number,
) {
  if (payload.provider === "openai-codex" && runtime.codex.available) {
    return {
      provider: "openai-codex",
      text: await runCodex(payload, request, workspaceRoot, commandTimeoutMs),
    };
  }

  if (payload.provider === "anthropic" && runtime.claude.available) {
    return {
      provider: "anthropic",
      text: await runClaude(payload, request, workspaceRoot, commandTimeoutMs),
    };
  }

  throw new Error(
    `No local runtime available for provider ${payload.provider}`,
  );
}

async function streamLocalChat(
  runtime: LocalRuntimeConfig,
  payload: LocalChatRequestPayload,
  request: IncomingMessage,
  workspaceRoot: string,
  commandTimeoutMs: number,
  write: (event: LocalChatStreamEvent) => void,
) {
  const writeWithSession = (event: LocalChatStreamEvent) => {
    if (event.type === "activity_start" || event.type === "activity_end") {
      write({
        ...event,
        sessionId: payload.activitySessionId,
      });
      return;
    }

    write(event);
  };

  if (payload.provider === "openai-codex" && runtime.codex.available) {
    await streamCodex(
      payload,
      request,
      workspaceRoot,
      commandTimeoutMs,
      writeWithSession,
    );
    return;
  }

  if (payload.provider === "anthropic" && runtime.claude.available) {
    await streamClaude(
      payload,
      request,
      workspaceRoot,
      commandTimeoutMs,
      writeWithSession,
    );
    return;
  }

  throw new Error(
    `No local runtime available for provider ${payload.provider}`,
  );
}

async function runCodex(
  payload: LocalChatRequestPayload,
  request: IncomingMessage,
  workspaceRoot: string,
  commandTimeoutMs: number,
): Promise<string> {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pi-console-codex-"));
  const outputPath = path.join(tempDir, "reply.txt");
  const stderrChunks: string[] = [];

  try {
    const child = spawn(
      "codex",
      [
        "exec",
        "--color",
        "never",
        "-C",
        workspaceRoot,
        "--skip-git-repo-check",
        "--output-last-message",
        outputPath,
        ...(payload.modelId ? ["--model", payload.modelId] : []),
        "-",
      ],
      {
        cwd: workspaceRoot,
        detached: true,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const prompt = buildRuntimePrompt(payload);
    child.stdin.end(prompt);

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString());
    });

    const exitCode = await waitForRuntimeChild(
      child,
      request,
      commandTimeoutMs,
    );

    if (exitCode !== 0) {
      throw new Error(formatRuntimeError("Codex", stderrChunks));
    }

    if (!existsSync(outputPath)) {
      throw new Error(formatRuntimeError("Codex", stderrChunks));
    }

    return readFileSync(outputPath, "utf8").trim();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function streamCodex(
  payload: LocalChatRequestPayload,
  request: IncomingMessage,
  workspaceRoot: string,
  commandTimeoutMs: number,
  write: (event: LocalChatStreamEvent) => void,
): Promise<void> {
  const stderrChunks: string[] = [];
  const state = { text: "" };
  const buffer = { value: "" };
  const child = spawn(
    "codex",
    [
      "exec",
      "--json",
      "--color",
      "never",
      "-C",
      workspaceRoot,
      "--skip-git-repo-check",
      ...(payload.modelId ? ["--model", payload.modelId] : []),
      "-",
    ],
    {
      cwd: workspaceRoot,
      detached: true,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stdin.end(buildRuntimePrompt(payload));
  child.stdout.on("data", (chunk) => {
    buffer.value += chunk.toString();
    flushJsonLines(buffer, (line) => {
      const event = tryParseJsonLine(line);
      if (!event) {
        return;
      }
      handleCodexEvent(event, state, write);
    });
  });
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  const exitCode = await waitForRuntimeChild(child, request, commandTimeoutMs);

  if (buffer.value.trim().length > 0) {
    flushJsonLines(
      buffer,
      (line) => {
        const event = tryParseJsonLine(line);
        if (!event) {
          return;
        }
        handleCodexEvent(event, state, write);
      },
      true,
    );
  }

  if (exitCode !== 0) {
    throw new Error(formatRuntimeError("Codex", stderrChunks));
  }

  write({
    type: "done",
    provider: "openai-codex",
    text: state.text,
  });
}

async function runClaude(
  payload: LocalChatRequestPayload,
  request: IncomingMessage,
  workspaceRoot: string,
  commandTimeoutMs: number,
): Promise<string> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const child = spawn(
    "claude",
    ["-p", ...(payload.modelId ? ["--model", payload.modelId] : [])],
    {
      cwd: workspaceRoot,
      detached: true,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stdin.end(buildRuntimePrompt(payload));

  child.stdout.on("data", (chunk) => {
    stdoutChunks.push(chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  const exitCode = await waitForRuntimeChild(child, request, commandTimeoutMs);

  if (exitCode !== 0) {
    throw new Error(formatRuntimeError("Claude", stderrChunks));
  }

  return stdoutChunks.join("").trim();
}

async function streamClaude(
  payload: LocalChatRequestPayload,
  request: IncomingMessage,
  workspaceRoot: string,
  commandTimeoutMs: number,
  write: (event: LocalChatStreamEvent) => void,
): Promise<void> {
  const stderrChunks: string[] = [];
  const state = { text: "" };
  const toolNamesById = new Map<string, string>();
  const seenToolResults = new Set<string>();
  const buffer = { value: "" };
  const child = spawn(
    "claude",
    [
      "-p",
      "--verbose",
      "--output-format",
      "stream-json",
      ...(payload.modelId ? ["--model", payload.modelId] : []),
    ],
    {
      cwd: workspaceRoot,
      detached: true,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stdin.end(buildRuntimePrompt(payload));
  child.stdout.on("data", (chunk) => {
    buffer.value += chunk.toString();
    flushJsonLines(buffer, (line) => {
      const event = tryParseJsonLine(line);
      if (!event) {
        return;
      }
      handleClaudeEvent(event, state, toolNamesById, seenToolResults, write);
    });
  });
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  const exitCode = await waitForRuntimeChild(child, request, commandTimeoutMs);

  if (buffer.value.trim().length > 0) {
    flushJsonLines(
      buffer,
      (line) => {
        const event = tryParseJsonLine(line);
        if (!event) {
          return;
        }
        handleClaudeEvent(event, state, toolNamesById, seenToolResults, write);
      },
      true,
    );
  }

  if (exitCode !== 0) {
    throw new Error(formatRuntimeError("Claude", stderrChunks));
  }

  write({
    type: "done",
    provider: "anthropic",
    text: state.text,
  });
}

function openEventStream(response: ServerResponse) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/x-ndjson");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Connection", "keep-alive");
}

function writeEvent(response: ServerResponse, event: LocalChatStreamEvent) {
  response.write(`${JSON.stringify(event)}\n`);
}

async function waitForRuntimeChild(
  child: ReturnType<typeof spawn>,
  request: IncomingMessage,
  timeoutMs: number,
): Promise<number> {
  const cleanup = () => {
    terminateChildProcessGroup(child, "SIGTERM");
  };
  request.once("close", cleanup);

  try {
    return await waitForChild(child, timeoutMs);
  } finally {
    request.off("close", cleanup);
  }
}

function waitForChild(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let killTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      terminateChildProcessGroup(child, "SIGTERM");
      killTimeoutId = setTimeout(() => {
        terminateChildProcessGroup(child, "SIGKILL");
      }, CHILD_TERMINATION_GRACE_MS);
    }, timeoutMs);

    const clearTimers = () => {
      clearTimeout(timeoutId);
      if (killTimeoutId) {
        clearTimeout(killTimeoutId);
      }
    };

    child.once("error", (error) => {
      clearTimers();
      reject(error);
    });

    child.once("close", (code) => {
      clearTimers();
      if (timedOut) {
        reject(new Error("Local runtime timed out"));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function terminateChildProcessGroup(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
) {
  if (!child.pid) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function formatRuntimeError(runtimeLabel: string, stderrChunks: string[]) {
  const details = stderrChunks.join("").trim();
  if (!details) {
    return `${runtimeLabel} did not return a response`;
  }

  const lines = details
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return `${runtimeLabel} failed: ${lines[lines.length - 1]}`;
}

function buildRuntimePrompt(payload: LocalChatRequestPayload): string {
  const transcript = (payload.messages ?? [])
    .map((message) => renderTranscriptMessage(message))
    .join("\n\n");

  return [
    "You are the assistant inside the Trust Substrate Pi console.",
    payload.systemPrompt ? `System instructions:\n${payload.systemPrompt}` : "",
    transcript ? `Conversation transcript:\n${transcript}` : "",
    "Reply as the assistant to the latest user message. Use the earlier turns only as context. Use available tools and configured MCP servers when they improve accuracy. Do not restate the transcript or add role labels unless needed.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function flushJsonLines(
  buffer: { value: string },
  onLine: (line: string) => void,
  consumeRemainder = false,
) {
  let newlineIndex = buffer.value.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = buffer.value.slice(0, newlineIndex).trim();
    buffer.value = buffer.value.slice(newlineIndex + 1);
    if (line.length > 0) {
      onLine(line);
    }
    newlineIndex = buffer.value.indexOf("\n");
  }

  if (consumeRemainder && buffer.value.trim().length > 0) {
    const remainder = buffer.value.trim();
    buffer.value = "";
    onLine(remainder);
  }
}

function tryParseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function handleCodexEvent(
  event: Record<string, unknown>,
  state: { text: string },
  write: (event: LocalChatStreamEvent) => void,
) {
  if (event.type === "item.started" && isRecord(event.item)) {
    const item = event.item;
    if (item.type === "agent_message") {
      return;
    }

    if (item.type === "mcp_tool_call") {
      write({
        type: "activity_start",
        provider: "openai-codex",
        id: typeof item.id === "string" ? item.id : undefined,
        source: "mcp",
        server: typeof item.server === "string" ? item.server : undefined,
        tool: typeof item.tool === "string" ? item.tool : undefined,
        label: describeCodexMcpItem(item),
        detail: renderCodexMcpArguments(item.arguments),
      });
      return;
    }

    write({
      type: "activity_start",
      provider: "openai-codex",
      id: typeof item.id === "string" ? item.id : undefined,
      source: item.type === "command_execution" ? "shell" : "runtime",
      label: describeCodexItem(item),
      detail: detailCodexItem(item),
    });
    return;
  }

  if (event.type === "item.completed" && isRecord(event.item)) {
    const item = event.item;
    if (item.type === "agent_message") {
      const nextText = typeof item.text === "string" ? item.text.trim() : "";
      if (nextText) {
        appendAssistantText(state, nextText, "openai-codex", write);
      }
      return;
    }

    if (item.type === "mcp_tool_call") {
      write({
        type: "activity_end",
        provider: "openai-codex",
        id: typeof item.id === "string" ? item.id : undefined,
        source: "mcp",
        server: typeof item.server === "string" ? item.server : undefined,
        tool: typeof item.tool === "string" ? item.tool : undefined,
        label: describeCodexMcpItem(item),
        detail: renderCodexMcpArguments(item.arguments),
        output: renderCodexMcpOutput(item),
        isError: item.status === "failed" || isRecord(item.error),
      });
      return;
    }

    write({
      type: "activity_end",
      provider: "openai-codex",
      id: typeof item.id === "string" ? item.id : undefined,
      source: item.type === "command_execution" ? "shell" : "runtime",
      label: describeCodexItem(item),
      detail: detailCodexItem(item),
      output: outputCodexItem(item),
      isError:
        item.status === "failed" ||
        (typeof item.exit_code === "number" && item.exit_code !== 0),
    });
    return;
  }

  if (event.type === "result") {
    const nextText =
      typeof event.result === "string" ? event.result.trim() : "";
    if (nextText) {
      appendAssistantText(state, nextText, "openai-codex", write);
    }
  }
}

function describeCodexMcpItem(item: Record<string, unknown>): string {
  const server = typeof item.server === "string" ? item.server : "mcp";
  const tool = typeof item.tool === "string" ? item.tool : "tool";
  return `${server}.${tool}`;
}

function handleClaudeEvent(
  event: Record<string, unknown>,
  state: { text: string },
  toolNamesById: Map<string, string>,
  seenToolResults: Set<string>,
  write: (event: LocalChatStreamEvent) => void,
) {
  if (event.type === "assistant" && isRecord(event.message)) {
    const message = event.message;
    const content = Array.isArray(message.content) ? message.content : [];

    for (const entry of content) {
      if (!isRecord(entry) || typeof entry.type !== "string") {
        continue;
      }

      if (entry.type === "tool_use" && typeof entry.id === "string") {
        if (toolNamesById.has(entry.id)) {
          continue;
        }
        const label = typeof entry.name === "string" ? entry.name : "Tool";
        toolNamesById.set(entry.id, label);
        write({
          type: "activity_start",
          provider: "anthropic",
          id: entry.id,
          label,
          detail: renderClaudeToolInput(entry.input),
        });
        continue;
      }

      if (entry.type === "text" && typeof entry.text === "string") {
        appendAssistantText(state, entry.text, "anthropic", write);
      }
    }
    return;
  }

  if (event.type === "user" && isRecord(event.message)) {
    const message = event.message;
    const content = Array.isArray(message.content) ? message.content : [];

    for (const entry of content) {
      if (
        !isRecord(entry) ||
        entry.type !== "tool_result" ||
        typeof entry.tool_use_id !== "string" ||
        seenToolResults.has(entry.tool_use_id)
      ) {
        continue;
      }

      seenToolResults.add(entry.tool_use_id);
      write({
        type: "activity_end",
        provider: "anthropic",
        id: entry.tool_use_id,
        label: toolNamesById.get(entry.tool_use_id) ?? "Tool",
        output: renderClaudeToolResult(entry.content),
      });
    }
    return;
  }

  if (event.type === "result") {
    const nextText = typeof event.result === "string" ? event.result : "";
    if (nextText) {
      appendAssistantText(state, nextText, "anthropic", write);
    }
  }
}

function appendAssistantText(
  state: { text: string },
  nextText: string,
  provider: LocalProviderId,
  write: (event: LocalChatStreamEvent) => void,
) {
  const trimmedText = nextText.trim();
  if (trimmedText.length === 0) {
    return;
  }

  if (trimmedText.startsWith(state.text)) {
    const delta = trimmedText.slice(state.text.length);
    if (delta.length === 0) {
      return;
    }
    state.text = trimmedText;
    write({
      type: "assistant_text",
      provider,
      text: delta,
    });
    return;
  }

  if (state.text.length > 0) {
    return;
  }

  state.text = trimmedText;
  write({
    type: "assistant_text",
    provider,
    text: trimmedText,
  });
}

function describeCodexItem(item: Record<string, unknown>): string {
  if (item.type === "command_execution") {
    return "Shell command";
  }

  if (typeof item.type === "string") {
    return humanizeIdentifier(item.type);
  }

  return "Runtime activity";
}

function detailCodexItem(item: Record<string, unknown>): string | undefined {
  if (typeof item.command === "string") {
    return item.command;
  }

  if (typeof item.description === "string") {
    return item.description;
  }

  return undefined;
}

function renderCodexMcpArguments(argumentsValue: unknown): string | undefined {
  if (argumentsValue === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(argumentsValue, null, 2);
  } catch {
    return undefined;
  }
}

function renderCodexMcpOutput(
  item: Record<string, unknown>,
): string | undefined {
  if (isRecord(item.error) && typeof item.error.message === "string") {
    return item.error.message;
  }

  if (item.result === undefined || item.result === null) {
    return undefined;
  }

  if (typeof item.result === "string") {
    return trimPreview(item.result);
  }

  try {
    return trimPreview(JSON.stringify(item.result, null, 2));
  } catch {
    return undefined;
  }
}

function outputCodexItem(item: Record<string, unknown>): string | undefined {
  if (typeof item.aggregated_output === "string") {
    return trimPreview(item.aggregated_output);
  }

  if (typeof item.text === "string") {
    return trimPreview(item.text);
  }

  return undefined;
}

function renderClaudeToolInput(input: unknown): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(input);
  } catch {
    return undefined;
  }
}

function renderClaudeToolResult(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  return content
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      if (isRecord(entry) && typeof entry.text === "string") {
        return entry.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase())
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function trimPreview(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length <= 1200) {
    return trimmed;
  }

  return `${trimmed.slice(0, 1200)}\n…`;
}

function renderTranscriptMessage(message: {
  role: string;
  content?: unknown;
  toolName?: string;
}): string {
  const roleLabel =
    message.role === "toolResult"
      ? `tool:${message.toolName ?? "unknown"}`
      : message.role;
  const content = renderMessageContent(message.content);
  return `${roleLabel}\n${content}`;
}

function renderMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (!block || typeof block !== "object" || !("type" in block)) {
        return "";
      }

      const typedBlock = block as Record<string, unknown>;
      if (typedBlock.type === "text") {
        return typeof typedBlock.text === "string" ? typedBlock.text : "";
      }
      if (typedBlock.type === "thinking") {
        return typeof typedBlock.thinking === "string"
          ? `[thinking]\n${typedBlock.thinking}`
          : "[thinking]";
      }
      if (typedBlock.type === "toolCall") {
        return `[tool call ${String(
          typedBlock.name ?? "unknown",
        )}]\n${JSON.stringify(typedBlock.arguments ?? {})}`;
      }
      if (typedBlock.type === "image") {
        return "[image attachment omitted]";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}
