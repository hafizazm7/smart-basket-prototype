import type { NormalizedRetailerPrice } from "@/modules/retailers/normalize-record";
import { extractRequestedPackage, phrasePresent, toBasePackage, uniqueTokens } from "./text";
import type { MatchReason, MatchRequest, RankedMatch, RequestedPackage, RetrievedCandidate } from "./types";

const PRODUCT_FORM_TOKENS = new Set([
  "capsule",
  "capsules",
  "cockpitspray",
  "groentehapje",
  "knijpfruit",
  "knijpzakje",
  "limonadepoeder",
  "maaltijd",
  "maaltijdpotje",
  "maispuffs",
  "olie",
  "poeder",
  "radler",
  "reiniger",
  "reinigingsdoekje",
  "reinigingsdoekjes",
  "siroop",
  "spray",
  "supplement",
  "tablet",
  "tabletten",
  "vaatwascapsule",
  "vaatwascapsules",
  "vaatwastablet",
  "vaatwastabletten",
  "vloerreinigingsmiddel",
  "vuilniszak",
  "vuilniszakken",
  "zuigtablet",
  "zuigtabletten",
]);

const PRODUCE_QUERY_TOKENS = new Set(["citroen", "wortel"]);
const PRODUCE_NAME_MODIFIERS = new Set([
  "ah",
  "aldi",
  "albert",
  "biologisch",
  "bio",
  "etos",
  "fijn",
  "fijne",
  "geschrapt",
  "geschrapte",
  "groot",
  "grote",
  "heijn",
  "julienne",
  "klein",
  "kleine",
  "kruidvat",
  "los",
  "losse",
  "net",
  "snoepgroente",
  "vers",
  "verse",
  "zak",
]);

const EXCLUSIVE_VARIANT_GROUPS = [
  new Set(["volle", "halfvolle", "mager"]),
];

const MILK_PRODUCT_FORMS = new Set([
  "chocolade",
  "chocolademelk",
  "gecondenseerd",
  "koffiemelk",
  "melkpoeder",
  "poeder",
]);

const RETAILER_IDENTITIES: Record<RetrievedCandidate["retailer"], string[]> = {
  ah: ["ah", "albert heijn"],
  aldi: ["aldi"],
  action: ["action"],
  etos: ["etos"],
  kruidvat: ["kruidvat"],
};

function candidateText(record: NormalizedRetailerPrice): string {
  return [record.brand, record.rawName, record.description].filter(Boolean).join(" ");
}

function inferBrandFromStandaloneProductName(
  query: string,
  candidates: RetrievedCandidate[],
): string | null {
  const queryTokens = uniqueTokens(query);
  if (queryTokens.length < 3) return null;

  const prefixes = candidates
    .map((candidate) => uniqueTokens(candidate.record.rawName))
    .filter((tokens) => (
      tokens.length >= 2
      && tokens.length < queryTokens.length
      && tokens.every((token, index) => token === queryTokens[index])
    ))
    .sort((a, b) => b.length - a.length);

  return prefixes[0]?.join(" ") ?? null;
}

export function inferRequestedBrand(query: string, candidates: RetrievedCandidate[]): string | null {
  const brands = [...new Set(
    candidates
      .map((candidate) => candidate.record.brand?.trim())
      .filter((brand): brand is string => Boolean(brand)),
  )].sort((a, b) => b.length - a.length);

  return brands.find((brand) => phrasePresent(query, brand))
    ?? inferBrandFromStandaloneProductName(query, candidates);
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

function hasProductFormConflict(
  queryTokens: string[],
  record: NormalizedRetailerPrice,
  requestedBrand: string | null,
): boolean {
  // A one-concept request such as "carrots" or "lemons" must not silently
  // become baby food, cleaning products, supplements, or flavoured drinks.
  // Multi-concept requests already carry enough context for normal overlap scoring.
  if (queryTokens.length !== 1) return false;

  const queryToken = queryTokens[0];
  const brandTokens = new Set(requestedBrand ? uniqueTokens(requestedBrand) : []);
  const candidateNameTokens = uniqueTokens(record.rawName);

  if (PRODUCE_QUERY_TOKENS.has(queryToken)) {
    return candidateNameTokens.some((token) => (
      token !== queryToken
      && !brandTokens.has(token)
      && !PRODUCE_NAME_MODIFIERS.has(token)
    ));
  }

  return candidateNameTokens.some((token) => (
    token !== queryToken
    && !brandTokens.has(token)
    && PRODUCT_FORM_TOKENS.has(token)
  ));
}

function hasVariantConflict(queryTokens: string[], candidateTokens: Set<string>): boolean {
  const exclusiveConflict = EXCLUSIVE_VARIANT_GROUPS.some((group) => {
    const requestedVariant = queryTokens.find((token) => group.has(token));
    if (!requestedVariant) return false;
    const candidateVariant = [...group].find((token) => candidateTokens.has(token));
    return Boolean(candidateVariant && candidateVariant !== requestedVariant);
  });
  if (exclusiveConflict) return true;

  if (!queryTokens.includes("melk")) return false;
  const requestedMilkForms = new Set(
    queryTokens.filter((token) => MILK_PRODUCT_FORMS.has(token)),
  );
  return [...MILK_PRODUCT_FORMS].some((token) => (
    candidateTokens.has(token) && !requestedMilkForms.has(token)
  ));
}

function hasRetailerIdentityConflict(candidate: RetrievedCandidate): boolean {
  const text = candidateText(candidate.record);
  return (Object.entries(RETAILER_IDENTITIES) as Array<[
    RetrievedCandidate["retailer"],
    string[],
  ]>).some(([retailer, identities]) => (
    retailer !== candidate.retailer
    && identities.some((identity) => phrasePresent(text, identity))
  ));
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

  // An exact brand alone is not enough when the user also named a product.
  // For example, "Dreft shampoo" must not match "Dreft afwasmiddel".
  const semanticRelevant = queryTokens.length === 0 || textHits > 0;
  const productFormConflict = hasProductFormConflict(queryTokens, record, requestedBrand);
  if (productFormConflict) reasons.push("product_form_conflict");
  const variantConflict = hasVariantConflict(queryTokens, candidateTokens);
  if (variantConflict) reasons.push("variant_conflict");
  const retailerIdentityConflict = hasRetailerIdentityConflict(candidate);
  if (retailerIdentityConflict) reasons.push("retailer_identity_conflict");
  const accepted = (
    semanticRelevant
    && !lockedBrandMismatch
    && !packageScore.incompatible
    && !productFormConflict
    && !variantConflict
    && !retailerIdentityConflict
    && confidence >= 0.44
  );
  const requestedSizeNeedsCheck = requestedPackage !== null && packageScore.reason !== "size_exact";
  const requiresConfirmation = accepted && (confidence < 0.82 || requestedSizeNeedsCheck);

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

export function retainMatchesPerRetailer(
  matches: RankedMatch[],
  limit: number,
): RankedMatch[] {
  const counts = new Map<RetrievedCandidate["retailer"], number>();
  return matches.filter((match) => {
    const count = counts.get(match.retailer) ?? 0;
    if (count >= limit) return false;
    counts.set(match.retailer, count + 1);
    return true;
  });
}
