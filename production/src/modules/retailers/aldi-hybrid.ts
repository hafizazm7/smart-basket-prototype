import { searchAldiCheckjebon } from "./checkjebon-aldi";
import { searchAldiPrijsProfeet } from "./prijsprofeet-aldi";
import type { NormalizedRetailerPrice } from "./normalize-record";

export async function searchAldiHybrid(query: string, limit = 20): Promise<{
  retailerKey: "aldi";
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "checkjebon" | "prijsprofeet";
}> {
  const trimmed = query.trim();

  if (!trimmed) {
    return searchAldiPrijsProfeet("*", limit);
  }

  if (trimmed === "*") {
    return searchAldiPrijsProfeet("*", limit);
  }

  try {
    const primary = await searchAldiCheckjebon(trimmed, limit);
    if (primary.status >= 200 && primary.status < 300 && primary.records.length > 0) {
      return primary;
    }
  } catch {
    // Supplementary public source below keeps ALDI usable if Checkjebon is empty/unavailable.
  }

  return searchAldiPrijsProfeet(trimmed, limit);
}
