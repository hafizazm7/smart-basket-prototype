import { RETAILER_KEYS } from "@/modules/retailers/sources";
import { getRetailerAdapter } from "@/modules/retailers/official-search-adapter";
import type { RetailerKey } from "@/modules/retailers/types";

export const dynamic = "force-dynamic";

function selectedRetailers(requested: string | null): RetailerKey[] {
  if (!requested || requested === "all") return RETAILER_KEYS;
  const values = requested
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is RetailerKey => RETAILER_KEYS.includes(value as RetailerKey));
  return [...new Set(values)];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const retailers = selectedRetailers(url.searchParams.get("retailers"));

  if (!query) {
    return Response.json({ ok: false, error: "Missing q search parameter." }, { status: 400 });
  }
  if (query.length > 120) {
    return Response.json({ ok: false, error: "Search query is too long." }, { status: 400 });
  }
  if (!retailers.length) {
    return Response.json({ ok: false, error: "No supported retailers selected." }, { status: 400 });
  }

  const settled = await Promise.allSettled(
    retailers.map(async (retailerKey) => getRetailerAdapter(retailerKey).searchNormalized(query)),
  );

  const sources = settled.map((result, index) => {
    const retailerKey = retailers[index];
    if (result.status === "fulfilled") return result.value;
    return {
      retailerKey,
      sourceUrl: null,
      status: null,
      records: [],
      parser: "json-ld" as const,
      error: result.reason instanceof Error ? result.reason.message : "Retailer fetch failed",
    };
  });

  return Response.json({
    ok: sources.some((source) => source.records.length > 0),
    query,
    searchedAt: new Date().toISOString(),
    totalCandidates: sources.reduce((sum, source) => sum + source.records.length, 0),
    sources,
    note: "Candidates only. Product matching/ranking is intentionally deferred to Step 8.",
  });
}
