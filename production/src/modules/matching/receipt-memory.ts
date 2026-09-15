export type ReceiptMemoryEntry = {
  receiptLabel: string;
  learnedAt: string;
};

export const RECEIPT_MEMORY_KEY = "smart-basket.receipt-memory.v1";
const MATCH_OVERRIDE_KEY = "smart-basket.match-overrides.v1";

export function receiptMemoryKey(query: string): string {
  return query.trim().toLowerCase();
}

export function readReceiptMemory(): Record<string, ReceiptMemoryEntry> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(RECEIPT_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, ReceiptMemoryEntry>
      : {};
  } catch {
    return {};
  }
}

export function saveReceiptMappings(mappings: Array<{ query: string; receiptLabel: string }>): number {
  if (typeof window === "undefined") return 0;

  try {
    const memory = readReceiptMemory();
    const learnedAt = new Date().toISOString();
    let saved = 0;

    for (const mapping of mappings) {
      const query = mapping.query.trim();
      const receiptLabel = mapping.receiptLabel.trim();
      if (!query || !receiptLabel) continue;
      memory[receiptMemoryKey(query)] = { receiptLabel, learnedAt };
      saved += 1;
    }

    window.localStorage.setItem(RECEIPT_MEMORY_KEY, JSON.stringify(memory));

    // A newly confirmed receipt link replaces an earlier "keep as typed" or
    // manual correction so the learned receipt wording is used next time.
    try {
      const rawOverrides = window.localStorage.getItem(MATCH_OVERRIDE_KEY);
      const overrides = rawOverrides ? JSON.parse(rawOverrides) : {};
      if (overrides && typeof overrides === "object") {
        for (const mapping of mappings) delete overrides[receiptMemoryKey(mapping.query)];
        window.localStorage.setItem(MATCH_OVERRIDE_KEY, JSON.stringify(overrides));
      }
    } catch {
      // The receipt memory is still useful when old override data is malformed.
    }

    return saved;
  } catch {
    return 0;
  }
}
