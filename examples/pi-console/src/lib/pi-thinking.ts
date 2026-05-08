import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

const FALLBACK_THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
];
const ALL_THINKING_LEVELS: ThinkingLevel[] = [
  ...FALLBACK_THINKING_LEVELS,
  "xhigh",
];

type PiModel = Parameters<typeof getSupportedThinkingLevels>[0];

export function getAvailableThinkingLevels(
  model: PiModel | null | undefined,
): ThinkingLevel[] {
  if (!model) {
    return FALLBACK_THINKING_LEVELS;
  }

  const supportedLevels =
    getSupportedThinkingLevels(model).filter(isThinkingLevel);

  return supportedLevels.length > 0
    ? supportedLevels
    : FALLBACK_THINKING_LEVELS;
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return ALL_THINKING_LEVELS.includes(value as ThinkingLevel);
}
