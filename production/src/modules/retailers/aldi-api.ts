import { parsePromotionLabel } from "@/modules/pricing/parse-promotion";
import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";

const API_BASE = "https://webservice.aldi.nl/api/v1";

type AldiArticle = {
  articleId?: string;
  articleNumber?: string;
  title?: string;
  brandName?: string;
  shortDescription?: string;
  salesUnit?: string;
  price?: string | number;
  priceFormatted?: string;
  basePriceValue?: number;
  priceReduction?: string;
  webDetailURL?: string;
  isNotAvailable?: boolean;
  isSoldOut?: boolean;
};

type AldiSearchResponse = {
  articles?: AldiArticle[];
};

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9,.-]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSize(input?: string): { value: number; unit: string } | null {
  if (!input) return null;
  const match = input.match(/([0-9]+(?:[,.][0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const raw = match[2].toLowerCase();
  const unit = raw === "gr" ? "g" : raw.startsWith("stuk") ? "item" : raw.startsWith("doek") ? "wipe" : raw.startsWith("wipe") ? "wipe" : raw;
  return { value, unit };
}

function absoluteUrl(input?: string): string | null {
  if (!input) return null;
  try {
    return new URL(input, "https://www.aldi.nl").toString();
  } catch {
    return null;
  }
}

function mapArticle(article: AldiArticle, sourceUrl: string, observedAt: string): NormalizedRetailerPrice | null {
  const title = article.title?.trim();
  if (!title) return null;

  const price = numberFrom(article.price) ?? numberFrom(article.priceFormatted);
  if (!price || price <= 0) return null;

  const size = parseSize(article.salesUnit);
  const promotionText = article.priceReduction?.trim();
  const parsedPromotion = promotionText ? parsePromotionLabel(promotionText) : null;
  const promotion = parsedPromotion && parsedPromotion.kind !== "other"
    ? {
        kind: parsedPromotion.kind,
        label: parsedPromotion.label,
        minQuantity: parsedPromotion.minQuantity ?? null,
        payQuantity: parsedPromotion.payQuantity ?? null,
        promoPrice: parsedPromotion.promoPrice ?? null,
        discountPercent: parsedPromotion.discountPercent ?? null,
        eligibility: parsedPromotion.eligibility,
      }
    : null;

  return normalizeRetailerPriceRecord({
    retailerKey: "aldi",
    externalId: article.articleNumber?.trim() || article.articleId?.trim() || null,
    rawName: title,
    brand: article.brandName?.trim() || null,
    description: article.shortDescription?.trim() || article.salesUnit?.trim() || null,
    sizeValue: size?.value ?? null,
    sizeUnit: size?.unit ?? null,
    productUrl: absoluteUrl(article.webDetailURL),
    price,
    currency: "EUR",
    sourceUrl,
    observedAt,
    promotion,
  });
}

export async function searchAldiApi(query: string, limit = 20): Promise<{
  retailerKey: "aldi";
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "aldi-api";
}> {
  const trimmed = query.trim();
  const sourceUrl = `${API_BASE}/articlesearch/${encodeURIComponent(trimmed)}.json`;
  if (!trimmed) {
    return { retailerKey: "aldi", sourceUrl, status: 400, records: [], parser: "aldi-api" };
  }

  const response = await fetch(sourceUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "application/json",
      "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
      "user-agent": "SmartBasket-MVP/0.1",
    },
  });

  if (!response.ok) {
    return { retailerKey: "aldi", sourceUrl, status: response.status, records: [], parser: "aldi-api" };
  }

  const body = (await response.json()) as AldiSearchResponse;
  const observedAt = new Date().toISOString();
  const records = (body.articles ?? [])
    .filter((article) => !article.isNotAvailable && !article.isSoldOut)
    .map((article) => mapArticle(article, sourceUrl, observedAt))
    .filter((record): record is NormalizedRetailerPrice => Boolean(record))
    .slice(0, limit);

  return { retailerKey: "aldi", sourceUrl, status: response.status, records, parser: "aldi-api" };
}
