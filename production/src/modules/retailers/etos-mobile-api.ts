import { parsePromotionLabel } from "@/modules/pricing/parse-promotion";
import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";

const API_BASE = "https://api.etos.nl";
const CLIENT_ID = "appie";
const APP_HEADERS = {
  "x-application": "AHWEBSHOP",
  "x-client-name": CLIENT_ID,
  "x-client-version": "9.27.0",
  accept: "application/json",
  "content-type": "application/json",
  "accept-language": "nl-NL,nl;q=0.9",
  "x-accept-language": "nl-NL",
  "user-agent": "Appie/9.27.0",
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type EtosProduct = {
  webshopId?: number | string;
  id?: number | string;
  title?: string;
  name?: string;
  salesUnitSize?: string;
  currentPrice?: number;
  priceBeforeBonus?: number;
  brand?: string;
  bonusMechanism?: string;
};

type EtosSearchResponse = {
  products?: EtosProduct[];
};

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

function parseSize(input?: string): { value: number; unit: string } | null {
  if (!input) return null;
  const match = input.trim().match(/([0-9]+(?:[,.][0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const raw = match[2].toLowerCase();
  const unit = raw === "gr" ? "g" : raw.startsWith("stuk") ? "item" : raw.startsWith("doek") ? "wipe" : raw.startsWith("wipe") ? "wipe" : raw;
  return { value, unit };
}

async function getAnonymousToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const response = await fetch(`${API_BASE}/mobile-auth/v1/auth/token/anonymous`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: APP_HEADERS,
    body: JSON.stringify({ clientId: CLIENT_ID }),
  });

  if (!response.ok) {
    throw new Error(`Etos anonymous auth returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as TokenResponse;
  if (!body.access_token) throw new Error("Etos anonymous auth returned no access token.");

  cachedToken = body.access_token;
  const ttlSeconds = Math.max(120, body.expires_in ?? 3600);
  cachedTokenExpiresAt = Date.now() + (ttlSeconds - 60) * 1000;
  return cachedToken;
}

function mapProduct(product: EtosProduct, sourceUrl: string, observedAt: string): NormalizedRetailerPrice | null {
  const externalId = product.webshopId ?? product.id;
  const title = product.title?.trim() || product.name?.trim();
  if (!externalId || !title) return null;

  const promotionLabel = product.bonusMechanism?.trim() || null;
  const parsedPromotion = promotionLabel ? parsePromotionLabel(promotionLabel) : null;
  const hasStructuredPromotion = parsedPromotion && parsedPromotion.kind !== "other";

  const current = Number(product.currentPrice);
  const before = Number(product.priceBeforeBonus);
  const price = hasStructuredPromotion && Number.isFinite(before) && before > 0
    ? before
    : Number.isFinite(current) && current > 0
      ? current
      : Number.isFinite(before) && before > 0
        ? before
        : 0;

  if (price <= 0) return null;

  const size = parseSize(product.salesUnitSize);
  return normalizeRetailerPriceRecord({
    retailerKey: "etos",
    externalId: String(externalId),
    rawName: title,
    brand: product.brand ?? null,
    description: product.salesUnitSize ?? null,
    sizeValue: size?.value ?? null,
    sizeUnit: size?.unit ?? null,
    productUrl: `https://www.etos.nl/product/${encodeURIComponent(String(externalId))}`,
    price,
    currency: "EUR",
    sourceUrl,
    observedAt,
    promotion: hasStructuredPromotion && parsedPromotion
      ? {
          kind: parsedPromotion.kind,
          label: parsedPromotion.label,
          minQuantity: parsedPromotion.minQuantity ?? null,
          payQuantity: parsedPromotion.payQuantity ?? null,
          promoPrice: parsedPromotion.promoPrice ?? null,
          discountPercent: parsedPromotion.discountPercent ?? null,
          eligibility: parsedPromotion.eligibility,
        }
      : null,
  });
}

export async function searchEtosMobileApi(query: string, limit = 20): Promise<{
  retailerKey: "etos";
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "etos-mobile-api";
}> {
  const trimmed = query.trim();
  const sourceUrl = `${API_BASE}/mobile-services/product/search/v2?query=${encodeURIComponent(trimmed)}&size=${Math.min(50, Math.max(1, limit))}&page=0&sortOn=RELEVANCE`;

  if (!trimmed) {
    return { retailerKey: "etos", sourceUrl, status: 400, records: [], parser: "etos-mobile-api" };
  }

  try {
    const token = await getAnonymousToken();
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { ...APP_HEADERS, authorization: `Bearer ${token}` },
    });

    if (response.status === 401 || response.status === 403) {
      cachedToken = null;
      cachedTokenExpiresAt = 0;
    }

    if (!response.ok) {
      return { retailerKey: "etos", sourceUrl, status: response.status, records: [], parser: "etos-mobile-api" };
    }

    const body = (await response.json()) as EtosSearchResponse;
    const observedAt = new Date().toISOString();
    const records = (body.products ?? [])
      .map((product) => mapProduct(product, sourceUrl, observedAt))
      .filter((record): record is NormalizedRetailerPrice => Boolean(record))
      .slice(0, limit);

    return { retailerKey: "etos", sourceUrl, status: response.status, records, parser: "etos-mobile-api" };
  } catch {
    return { retailerKey: "etos", sourceUrl, status: 502, records: [], parser: "etos-mobile-api" };
  }
}
