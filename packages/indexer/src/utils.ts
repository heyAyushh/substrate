export const compareBySlotThenReceiptId = (
  left: { slot: number; receiptId: string },
  right: { slot: number; receiptId: string }
) =>
  left.slot === right.slot
    ? left.receiptId.localeCompare(right.receiptId)
    : left.slot - right.slot;

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((element) => stableStringify(element)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)
  );
  return `{${entries
    .map(
      ([key, element]) => `${JSON.stringify(key)}:${stableStringify(element)}`
    )
    .join(",")}}`;
};
