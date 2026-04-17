import type {
  AgentProfileResult,
  DomainSummaryResult,
  SnapshotSummary,
  TaskTraceResult,
} from "./snapshot-tools.js";
import { JSON_RESPONSE_FORMAT, MARKDOWN_RESPONSE_FORMAT } from "./constants.js";

export type ResponseFormat =
  | typeof MARKDOWN_RESPONSE_FORMAT
  | typeof JSON_RESPONSE_FORMAT;

export function formatSnapshotSummary(
  summary: SnapshotSummary,
  responseFormat: ResponseFormat
): string {
  if (responseFormat === JSON_RESPONSE_FORMAT) {
    return toJson(summary);
  }

  const domainLines = summary.domains.map(
    (domain) =>
      `- ${domain.domain}: ${domain.receiptCount} receipts, ${domain.taskIds.length} tasks, latest slot ${domain.latestSlot}`
  );
  const leaderboardLines = summary.leaderboard.map(
    (entry) =>
      `- ${entry.agentId}: score ${entry.score}, ${entry.receiptCount} receipts, ${entry.tier}`
  );

  return [
    "# Trust Substrate Snapshot",
    "",
    `Snapshot: ${summary.snapshotPath}`,
    `Receipts: ${summary.receiptCount}`,
    `Tasks: ${summary.taskCount}`,
    `Agents: ${summary.agentCount}`,
    `Latest slot: ${summary.latestSlot}`,
    "",
    "## Domains",
    ...(domainLines.length > 0 ? domainLines : ["- No domains found"]),
    "",
    "## Leaderboard",
    ...(leaderboardLines.length > 0
      ? leaderboardLines
      : ["- No ranked agents found"]),
  ].join("\n");
}

export function formatAgentProfile(
  profile: AgentProfileResult,
  responseFormat: ResponseFormat
): string {
  if (responseFormat === JSON_RESPONSE_FORMAT) {
    return toJson(profile);
  }

  const toolLines = profile.toolQuality.map(
    (tool) =>
      `- ${tool.tool}: ${tool.completions}/${tool.attempts} completions, ${tool.disputes} disputes`
  );
  const attestationLines = profile.attestations.map(
    (attestation) =>
      `- ${attestation.attesterId}: ${
        attestation.attestationKind ?? "attestation"
      } at slot ${attestation.slot}`
  );

  return [
    `# Agent ${profile.agent.agentId}`,
    "",
    `Snapshot: ${profile.snapshotPath}`,
    `Receipts: ${profile.agent.receiptCount}`,
    `First slot: ${profile.agent.firstSlot}`,
    `Latest slot: ${profile.agent.latestSlot}`,
    `Active stake: ${profile.stake.activeLamports}`,
    `Slashed stake: ${profile.stake.slashedLamports}`,
    "",
    "## Tools",
    ...(toolLines.length > 0 ? toolLines : ["- No tool usage found"]),
    "",
    "## Attestations",
    ...(attestationLines.length > 0
      ? attestationLines
      : ["- No attestations found"]),
  ].join("\n");
}

export function formatTaskTrace(
  trace: TaskTraceResult,
  responseFormat: ResponseFormat
): string {
  if (responseFormat === JSON_RESPONSE_FORMAT) {
    return toJson(trace);
  }

  const receiptLines = trace.receipts.map(
    (receipt) =>
      `- ${receipt.receiptId}: ${receipt.kind} by ${receipt.actorId} at slot ${receipt.slot}`
  );
  const handoffLines = trace.handoffs.map(
    (handoff) =>
      `- ${handoff.fromAgentId} -> ${handoff.toAgentId} at slot ${handoff.slot}`
  );

  return [
    `# Task ${trace.taskId}`,
    "",
    `Snapshot: ${trace.snapshotPath}`,
    `Receipts: ${trace.totalReceipts}`,
    `Returned: ${trace.receipts.length}`,
    trace.hasMore ? `Next offset: ${trace.nextOffset}` : "Next offset: none",
    "",
    "## Receipts",
    ...(receiptLines.length > 0 ? receiptLines : ["- No receipts found"]),
    "",
    "## Handoffs",
    ...(handoffLines.length > 0 ? handoffLines : ["- No handoffs found"]),
  ].join("\n");
}

export function formatDomainSummary(
  summary: DomainSummaryResult,
  responseFormat: ResponseFormat
): string {
  if (responseFormat === JSON_RESPONSE_FORMAT) {
    return toJson(summary);
  }

  const domainLines = summary.domains.map(
    (domain) =>
      `- ${domain.domain}: ${domain.receiptCount} receipts, ${domain.handoffCount} handoffs, latest slot ${domain.latestSlot}`
  );

  return [
    "# Domain Summary",
    "",
    `Snapshot: ${summary.snapshotPath}`,
    "",
    ...(domainLines.length > 0 ? domainLines : ["- No domains found"]),
  ].join("\n");
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
