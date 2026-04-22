import { hashCanonical } from "./canonical.js";

export const withPayloadHash = (
  payload: Readonly<Record<string, unknown>>
): Record<string, unknown> => {
  const { payloadHash: _ignored, ...payloadWithoutHash } = payload;
  return {
    ...payloadWithoutHash,
    payloadHash: hashCanonical(payloadWithoutHash),
  };
};
