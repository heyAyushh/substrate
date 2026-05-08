import type { AgentMessage } from "@earendil-works/pi-agent-core";

type UserMessage = Extract<AgentMessage, { role: "user" }>;

export type LegacyUserWithAttachmentsMessage = Omit<UserMessage, "role"> & {
  role: "user-with-attachments";
};
export type UserLikeMessage = UserMessage | LegacyUserWithAttachmentsMessage;
export type AssistantMessageLike = Extract<AgentMessage, { role: "assistant" }>;
export type ToolResultMessageLike = Extract<
  AgentMessage,
  { role: "toolResult" }
>;
export type ToolCallBlock = Extract<
  AssistantMessageLike["content"][number],
  { type: "toolCall" }
>;
export type ThinkingBlock = Extract<
  AssistantMessageLike["content"][number],
  { type: "thinking" }
>;
export type TextBlock = Extract<
  AssistantMessageLike["content"][number],
  { type: "text" }
>;
export type ToolResultTextBlock = Extract<
  ToolResultMessageLike["content"][number],
  { type: "text" }
>;

function getMessageRole(
  message: AgentMessage | LegacyUserWithAttachmentsMessage | null | undefined,
) {
  return (message as { role?: unknown } | null | undefined)?.role;
}

export function isUserLikeMessage(
  message: AgentMessage | LegacyUserWithAttachmentsMessage | null | undefined,
): message is UserLikeMessage {
  const role = getMessageRole(message);
  return role === "user" || role === "user-with-attachments";
}

export function isAssistantMessage(
  message: AgentMessage | null | undefined,
): message is AssistantMessageLike {
  return message?.role === "assistant";
}

export function isToolResultMessage(
  message: AgentMessage | null | undefined,
): message is ToolResultMessageLike {
  return message?.role === "toolResult";
}

export function isTextBlock(
  block: AssistantMessageLike["content"][number],
): block is TextBlock {
  return block.type === "text";
}

export function isThinkingBlock(
  block: AssistantMessageLike["content"][number],
): block is ThinkingBlock {
  return block.type === "thinking";
}

export function isToolCallBlock(
  block: AssistantMessageLike["content"][number],
): block is ToolCallBlock {
  return block.type === "toolCall";
}

export function isToolResultTextBlock(
  block: ToolResultMessageLike["content"][number],
): block is ToolResultTextBlock {
  return block.type === "text";
}

export function getUserMessageText(message: UserLikeMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }

      if (
        "type" in entry &&
        entry.type === "text" &&
        "text" in entry &&
        typeof entry.text === "string"
      ) {
        return entry.text;
      }

      if ("type" in entry && entry.type === "image") {
        return "[image]";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}
