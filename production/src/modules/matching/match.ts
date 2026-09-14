import type { NormalizedRetailerPrice } from "@/modules/retailers/normalize-record";
import { extractRequestedPackage, phrasePresent, toBasePackage, uniqueTokens } from "./text";
import type { MatchReason, MatchRequest, RankedMatch, RequestedPackage, RetrievedCandidate } from "./types";

function candidateText(record: NormalizedRetailerPrice): string {
  return [record.brand, record.rawName, record.description].filter(Boolean).join(" ");
}

export function inferRequestedBrand(query: string, candidates: RetrievedCandidate[]): string | null {
  const brands = [...new Set(
    candidates
      .map((candidate) => candidate.record.brand?.trim())
      .filter((brand): brand is string => Boolean(brand)),
  )].sort((a, b) => b.length - a.length);

  return brands.find((brand) => phrasePresent(query, brand)) ?? null;
}

function packageFromRecord(record: NormalizedRetailerPrice): RequestedPackage | null {
  if (!record.sizeValue || !record.sizeUnit || record.sizeValue <= 0) return null;
  return { value: record.sizeValue, unit: record.sizeUnit };
}

function scorePackage(requested: RequestedPackage | null, candidate: RequestedPackage | null): {
  score: number;
  incompatible: boolean;
  reason: MatchReason;
} {
  if (!requested) return { score: 0.8, incompatible: false, reason: "size_unknown" };
  if (!candidate) return { score: 0.45, incompatible: false, reason: "size_unknown" };

  const left = toBasePackage(requested);
  const right = toBasePackage(candidate);
  if (left.unit !== right.unit) {
    return { score: 0, incompatible: true, reason: "unit_incompatible" };
  }

  const ratio = Math.min(left.value, right.value) / Math.max(left.value, right.value);
  if (ratio >= 0.97) return { score: 1, incompatible: false, reason: "size_exact" };
  if (ratio >= 0.5) return { score: 0.8, incompatible: false, reason: "size_similar" };
  return { score: 0.5, incompatible: false, reason: "size_different" };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function brandMatches(record: NormalizedRetailerPrice, requestedBrand: string): boolean {
  return phrasePresent(candidateText(record), requestedBrand);
}

function scoreCandidate(
  request: MatchRequest,
  candidate: RetrievedCandidate,
  requestedBrand: string | null,
  requestedPackage: RequestedPackage | null,
): RankedMatch {
  const alternativesAllowed = request.alternativesAllowed ?? false;
  const reasons: MatchReason[] = [];
  const record = candidate.record;
  const text = candidateText(record);

  const requestedBrandTokens = requestedBrand ? new Set(uniqueTokens(requestedBrand)) : new Set<string>();
  const queryTokens = uniqueTokens(request.query).filter((token) => !requestedBrandTokens.has(token));
  const candidateTokens = new Set(uniqueTokens(text));
  const textHits = queryTokens.filter((token) => candidateTokens.has(token)).length;
  const textScore = queryTokens.length === 0 ? 0.65 : textHits / queryTokens.length;

  if (textScore >= 0.75) reasons.push("text_strong");
  else if (textScore > 0) reasons.push("text_partial");

  let brandScore = 0.7;
  let lockedBrandMismatch = false;
  if (requestedBrand) {
    if (brandMatches(record, requestedBrand)) {
      brandScore = 1;
      reasons.push("brand_exact");
    } else if (alternativesAllowed) {
      brandScore = 0.25;
      reasons.push("brand_alternative");
    } else {
      brandScore = 0;
      lockedBrandMismatch = true;
      reasons.push("brand_mismatch");
    }
  }

  const packageScore = scorePackage(requestedPackage, packageFromRecord(record));
  reasons.push(packageScore.reason);

  const retrievalScore = clamp(1 - candidate.sourceRank * 0.05);
  if (retrievalScore >= 0.75) reasons.push("retrieval_relevant");

  let confidence = (
    textScore * 0.45
    + brandScore * 0.2
    + packageScore.score * 0.1
    + retrievalScore * 0.25
  );

  if (queryTokens.length > 0 && phrasePresent(text, queryTokens.join(" "))) confidence += 0.04;
  confidence = clamp(confidence);

  const accepted = !lockedBrandMismatch && !packageScore.incompatible && confidence >= 0.44;
  const requiresConfirmation = accepted && confidence < 0.82;

  return {
    ...candidate,
    confidence: Number(confidence.toFixed(4)),
    accepted,
    requiresConfirmation,
    requestedBrand,
    alternativesAllowed,
    reasons,
  };
}

export function rankMatches(request: MatchRequest, candidates: RetrievedCandidate[]): RankedMatch[] {
  const requestedBrand = request.brand?.trim() || inferRequestedBrand(request.query, candidates);
  const requestedPackage = request.requestedPackage ?? extractRequestedPackage(request.query);

  return candidates
    .map((candidate) => scoreCandidate(request, candidate, requestedBrand, requestedPackage))
    .sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
      return b.confidence - a.confidence;
    });
}
