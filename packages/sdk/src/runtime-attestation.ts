export interface RuntimeAttestationRecord {
  readonly identityId: string;
  readonly runtimeCommit: string;
  readonly runtimeAuthority: string;
  readonly validFromSlot: number;
}

export interface RuntimeAttestationInput {
  readonly identityId: string;
  readonly runtimeCommit: string;
  readonly runtimeAuthority: string;
  readonly validFromSlot: number;
}

export function appendRuntimeAttestation(
  history: ReadonlyArray<RuntimeAttestationRecord>,
  input: RuntimeAttestationInput
): RuntimeAttestationRecord {
  const latest = history
    .filter((entry) => entry.identityId === input.identityId)
    .sort((left, right) => left.validFromSlot - right.validFromSlot)
    .at(-1);

  if (latest && input.validFromSlot <= latest.validFromSlot) {
    throw new Error("runtime attestations must advance by slot");
  }

  return { ...input };
}

export function resolveRuntimeAtSlot(
  history: ReadonlyArray<RuntimeAttestationRecord>,
  slot: number
): RuntimeAttestationRecord | undefined {
  return [...history]
    .sort((left, right) => left.validFromSlot - right.validFromSlot)
    .filter((entry) => entry.validFromSlot <= slot)
    .at(-1);
}
