import { rankMatches } from "@/modules/matching/match";
import { toRetailerSearchQuery } from "@/modules/matching/text";
import type { RetrievedCandidate } from "@/modules/matching/types";
import type { RetailerKey } from "@/modules/retailers/types";

export const dynamic = "force-dynamic";

function candidate(
  retailer: RetailerKey,
  externalId: string,
  name: string,
  brand: string | null,
  sizeValue: number | null,
  sizeUnit: string | null,
  sourceRank = 0,
): RetrievedCandidate {
  return {
    retailer,
    sourceRank,
    record: {
      retailerKey: retailer,
      externalId,
      rawName: name,
      brand,
      description: sizeValue && sizeUnit ? `${sizeValue} ${sizeUnit}` : null,
      sizeValue,
      sizeUnit,
      productUrl: null,
      price: 3.99,
      currency: "EUR",
      sourceUrl: "https://example.test/product-source",
      observedAt: new Date().toISOString(),
      promotion: null,
      unitPrice: null,
      unitPriceUnit: null,
    },
  };
}

export async function GET() {
  const dreft = candidate("ah", "dreft-350", "Dreft Platinum Afwasmiddel Original", "Dreft", 350, "ml");
  const fairy = candidate("kruidvat", "fairy-383", "Fairy Original Afwasmiddel", "Fairy", 383, "ml");
  const wrongUnit = candidate("aldi", "dreft-350g", "Dreft Afwasmiddel", "Dreft", 350, "g");
  const wrongProduct = candidate("action", "dreft-shampoo", "Dreft Shampoo", "Dreft", 350, "ml");
  const differentSize = candidate("etos", "dreft-700", "Dreft Afwasmiddel", "Dreft", 700, "ml");
  const wipes = candidate("etos", "wipes-1", "Zwitsal Sensitive Billendoekjes", "Zwitsal", 57, "wipe");
  const unrelated = candidate("action", "shampoo-1", "Shampoo verzorging", null, 300, "ml");
  const cocaColaZero = candidate("action", "coke-zero", "Coca Cola Zero", null, 375, "ml");
  const cocaColaBrand = candidate("action", "coke-brand", "Coca Cola", null, 375, "ml", 1);
  const fantaZero = candidate("action", "fanta-zero", "Fanta Zero Sugar", null, 375, "ml", 2);

  const locked = rankMatches(
    { query: "Dreft afwasmiddel 350ml", alternativesAllowed: false },
    [dreft, fairy, wrongUnit, wrongProduct, differentSize],
  );
  const withAlternatives = rankMatches(
    { query: "Dreft afwasmiddel 350ml", alternativesAllowed: true },
    [dreft, fairy],
  );
  const synonym = rankMatches(
    { query: "baby wipes", alternativesAllowed: false },
    [wipes],
  );
  const rejectUnrelated = rankMatches(
    { query: "melk", alternativesAllowed: false },
    [unrelated],
  );
  const metadataFreeBrandLocked = rankMatches(
    { query: "Coca-Cola Zero 1.5L", alternativesAllowed: false },
    [cocaColaZero, cocaColaBrand, fantaZero],
  );
  const metadataFreeAlternatives = rankMatches(
    { query: "Coca-Cola Zero 1.5L", alternativesAllowed: true },
    [cocaColaZero, cocaColaBrand, fantaZero],
  );

  const translations = {
    babyWipes: toRetailerSearchQuery("baby wipes") === "billendoekjes",
    carrots: toRetailerSearchQuery("Carrots") === "wortels",
    lemons: toRetailerSearchQuery("Lemons") === "citroenen",
    mayonnaise: toRetailerSearchQuery("Mayonnaise") === "mayonaise",
    milk: toRetailerSearchQuery("milk") === "melk",
    brandedSizePreserved: toRetailerSearchQuery("Dreft dishwashing liquid 350ml") === "Dreft afwasmiddel 350ml",
  };

  const checks = {
    requestedBrandInferred: locked[0]?.requestedBrand === "Dreft",
    requestedBrandLocked: locked.some((match) => match.record.externalId === "dreft-350" && match.accepted)
      && locked.some((match) => match.record.externalId === "fairy-383" && !match.accepted),
    alternativesCanBeEnabled: withAlternatives.some((match) => match.record.externalId === "fairy-383" && match.accepted),
    exactBrandRanksFirst: withAlternatives[0]?.record.externalId === "dreft-350",
    dutchEnglishSynonymWorks: synonym[0]?.accepted === true,
    topRankUnrelatedCandidateRejected: rejectUnrelated[0]?.accepted === false,
    sameBrandWrongProductRejected: locked.some((match) => match.record.externalId === "dreft-shampoo" && !match.accepted),
    incompatibleUnitRejected: locked.some((match) => match.record.externalId === "dreft-350g" && !match.accepted),
    differentRequestedSizeNeedsConfirmation: locked.some((match) => (
      match.record.externalId === "dreft-700"
      && match.accepted
      && match.requiresConfirmation
    )),
    exactRequestedSizeCanAutoMatch: locked.some((match) => (
      match.record.externalId === "dreft-350"
      && match.accepted
      && !match.requiresConfirmation
    )),
    metadataFreeBrandInferred: metadataFreeBrandLocked[0]?.requestedBrand === "coca cola",
    metadataFreeBrandLocked: metadataFreeBrandLocked.some((match) => (
      match.record.externalId === "coke-zero" && match.accepted
    )) && metadataFreeBrandLocked.some((match) => (
      match.record.externalId === "fanta-zero"
      && !match.accepted
      && match.reasons.includes("brand_mismatch")
    )),
    metadataFreeAlternativesCanBeEnabled: metadataFreeAlternatives.some((match) => (
      match.record.externalId === "fanta-zero"
      && match.accepted
      && match.reasons.includes("brand_alternative")
    )),
    retailerSearchTranslationWorks: Object.values(translations).every(Boolean),
  };

  return Response.json({
    ok: Object.values(checks).every(Boolean),
    checkedAt: new Date().toISOString(),
    checks,
    translations,
    samples: {
      locked: locked.map((match) => ({
        id: match.record.externalId,
        accepted: match.accepted,
        confidence: match.confidence,
        requiresConfirmation: match.requiresConfirmation,
        reasons: match.reasons,
      })),
      alternatives: withAlternatives.map((match) => ({
        id: match.record.externalId,
        accepted: match.accepted,
        confidence: match.confidence,
        requiresConfirmation: match.requiresConfirmation,
        reasons: match.reasons,
      })),
      metadataFreeBrandLocked: metadataFreeBrandLocked.map((match) => ({
        id: match.record.externalId,
        accepted: match.accepted,
        confidence: match.confidence,
        requiresConfirmation: match.requiresConfirmation,
        requestedBrand: match.requestedBrand,
        reasons: match.reasons,
      })),
    },
  });
}
