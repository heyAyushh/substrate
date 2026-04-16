import { deriveIdentifier } from "./canonical.js";
import type { IdentityRecord } from "./client.js";

export const AUTHORITY_ROTATED_MARKER =
  "trust-substrate.authority_rotated" as const;

export type AuthorityRotationMode = "normal" | "emergency";

export interface PendingAuthorityRotation {
  readonly identityId: string;
  readonly previousAuthority: string;
  readonly newAuthority: string;
  readonly unlockSlot: number;
}

export interface RotateAuthorityInput {
  readonly identity: IdentityRecord;
  readonly newAuthority: string;
  readonly unlockSlot: number;
}

export interface AuthorityRotationEventInput {
  readonly agentId: string;
  readonly previousAuthority: string;
  readonly newAuthority: string;
  readonly slot: number;
  readonly mode?: AuthorityRotationMode;
  readonly sequence?: number;
}

export interface FinalizeAuthorityRotationInput {
  readonly identity: IdentityRecord;
  readonly pendingRotation: PendingAuthorityRotation;
  readonly finalizedSlot: number;
  readonly mode?: AuthorityRotationMode;
  readonly sequence?: number;
}

export interface AuthorityRotationEvent {
  readonly type: typeof AUTHORITY_ROTATED_MARKER;
  readonly eventId: string;
  readonly agentId: string;
  readonly previousAuthority: string;
  readonly newAuthority: string;
  readonly slot: number;
  readonly mode: AuthorityRotationMode;
  readonly sequence?: number;
}

function assertNonEmptyAuthority(authority: string, fieldName: string): void {
  if (authority.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
}

function assertValidSlot(slot: number, fieldName: string): void {
  if (!Number.isSafeInteger(slot) || slot < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
}

function assertValidSequence(sequence: number | undefined): void {
  if (
    sequence !== undefined &&
    (!Number.isSafeInteger(sequence) || sequence < 0)
  ) {
    throw new Error("rotation sequence must be a non-negative safe integer");
  }
}

export function requestAuthorityRotation(
  input: RotateAuthorityInput
): PendingAuthorityRotation {
  assertNonEmptyAuthority(input.newAuthority, "newAuthority");
  assertValidSlot(input.unlockSlot, "unlockSlot");

  return {
    identityId: input.identity.identityId,
    previousAuthority: input.identity.authority,
    newAuthority: input.newAuthority,
    unlockSlot: input.unlockSlot,
  };
}

export function createAuthorityRotationEvent(
  input: AuthorityRotationEventInput
): AuthorityRotationEvent {
  assertNonEmptyAuthority(input.previousAuthority, "previousAuthority");
  assertNonEmptyAuthority(input.newAuthority, "newAuthority");
  assertValidSlot(input.slot, "slot");
  assertValidSequence(input.sequence);

  const mode = input.mode ?? "normal";

  return {
    type: AUTHORITY_ROTATED_MARKER,
    eventId: deriveIdentifier("authority_rotation", {
      agentId: input.agentId,
      previousAuthority: input.previousAuthority,
      newAuthority: input.newAuthority,
      slot: input.slot,
      mode,
      sequence: input.sequence ?? null,
    }),
    agentId: input.agentId,
    previousAuthority: input.previousAuthority,
    newAuthority: input.newAuthority,
    slot: input.slot,
    mode,
    sequence: input.sequence,
  };
}

export function finalizeAuthorityRotation(
  input: FinalizeAuthorityRotationInput
): { identity: IdentityRecord; rotation: AuthorityRotationEvent } {
  assertValidSlot(input.finalizedSlot, "finalizedSlot");
  assertValidSequence(input.sequence);

  if (input.finalizedSlot < input.pendingRotation.unlockSlot) {
    throw new Error("authority rotation cooldown has not elapsed");
  }
  if (input.identity.identityId !== input.pendingRotation.identityId) {
    throw new Error("pending authority rotation identity mismatch");
  }
  if (input.identity.authority !== input.pendingRotation.previousAuthority) {
    throw new Error("pending authority rotation no longer matches identity");
  }

  return {
    identity: {
      ...input.identity,
      authority: input.pendingRotation.newAuthority,
    },
    rotation: createAuthorityRotationEvent({
      agentId: input.identity.identityId,
      previousAuthority: input.pendingRotation.previousAuthority,
      newAuthority: input.pendingRotation.newAuthority,
      slot: input.finalizedSlot,
      mode: input.mode,
      sequence: input.sequence,
    }),
  };
}
