import { rankMatches } from "@/modules/matching/match";
import { extractRequestedPackage, toRetailerSearchQuery } from "@/modules/matching/text";
import type { RankedMatch, RetrievedCandidate } from "@/modules/matching/types";
import { getRetailerAdapter } from "@/modules/retailers/official-search-adapter";
import { RETAILER_KEYS } from "@/modules/retailers/sources";
import type { RetailerKey } from "@/modules/retailers/types";

export const dynamic = "force-dynamic";

function selectedRetailers(requested: string | null): RetailerKey[] {
  if (!requested || requested === "all") return RETAILER_KEYS;
  return [...new Set(
    requested
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is RetailerKey => RETAILER_KEYS.includes(value as RetailerKey)),
  )];
}

function booleanParam(value: string | null): boolean {
  return ["1", "true", "yes", "y"].includes((value ?? "").trim().toLowerCase());
}

function serializeMatch(match: RankedMatch, accepted: boolean) {
  return {
    retailer: match.retailer,
    externalId: match.record.externalId,
    name: match.record.rawName,
    brand: match.record.brand,
    description: match.record.description,
    price: match.record.price,
    sizeValue: match.record.sizeValue,
    sizeUnit: match.record.sizeUnit,
    unitPrice: match.record.unitPrice,
    unitPriceUnit: match.record.unitPriceUnit,
    promotion: match.record.promotion?.label ?? null,
    confidence: match.confidence,
    accepted,
    requiresConfirmation: accepted ? match.requiresConfirmation : true,
    reasons: match.reasons,
    sourceUrl: match.record.sourceUrl,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const brand = (url.searchParams.get("brand") ?? "").trim() || null;
  const alternativesAllowed = booleanParam(url.searchParams.get("alternatives"));
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

  const searchQuery = toRetailerSearchQuery(query);
  const settled = await Promise.allSettled(
    retailers.map(async (retailer) => getRetailerAdapter(retailer).searchNormalized(searchQuery)),
  );

  const candidates: RetrievedCandidate[] = [];
  const sources = settled.map((result, index) => {
    const retailer = retailers[index];
    if (result.status === "rejected") {
      return {
        retailer,
        status: null,
        parser: null,
        candidates: 0,
        error: result.reason instanceof Error ? result.reason.message : "Retailer search failed",
      };
    }

    result.value.records.forEach((record, sourceRank) => {
      candidates.push({ retailer, record, sourceRank });
    });

    return {
      retailer,
      status: result.value.status,
      parser: result.value.parser,
      candidates: result.value.records.length,
      error: null,
    };
  });

  const requestedPackage = extractRequestedPackage(query);
  const ranked = rankMatches(
    {
      query,
      brand,
      alternativesAllowed,
      requestedPackage,
    },
    candidates,
  );

  const accepted = ranked.filter((match) => match.accepted);
  const requestedBrand = ranked[0]?.requestedBrand ?? brand;
  const manualCandidates = ranked.filter((match) => (
    !match.accepted
    && !match.reasons.includes("brand_mismatch")
    && !match.reasons.includes("unit_incompatible")
  ));

  return Response.json({
    ok: accepted.length > 0,
    query,
    searchQuery,
    requestedBrand,
    alternativesAllowed,
    requestedPackage,
    searchedAt: new Date().toISOString(),
    sources,
    totalCandidates: candidates.length,
    acceptedMatches: accepted.length,
    matches: accepted.slice(0, 25).map((match) => serializeMatch(match, true)),
    otherCandidates: manualCandidates.slice(0, 10).map((match) => serializeMatch(match, false)),
    rejectedPreview: ranked
      .filter((match) => !match.accepted)
      .slice(0, 5)
      .map((match) => ({
        retailer: match.retailer,
        name: match.record.rawName,
        brand: match.record.brand,
        confidence: match.confidence,
        reasons: match.reasons,
      })),
    note: "Step 8 matching only. Basket/store optimization is intentionally not performed here.",
  });
}
