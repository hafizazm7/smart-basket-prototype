import { parsePromotionLabel } from "@/modules/pricing/parse-promotion";
import { findProductJsonLd, extractTagText, stripHtml } from "./html";
import type { RetailerKey, RetailerPriceRecord, RetailerPromotionRecord } from "./types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const object = value.find((entry) => entry && typeof entry === "object");
    return object && typeof object === "object" ? (object as Record<string, unknown>) : null;
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getJsonLdPrice(product: Record<string, unknown> | null): number | null {
  if (!product) return null;
  const offer = firstObject(product.offers);
  if (!offer) return null;
  return asNumber(offer.price) ?? asNumber(offer.lowPrice) ?? asNumber(offer.highPrice);
}

function getJsonLdCurrency(product: Record<string, unknown> | null): string | null {
  if (!product) return null;
  const offer = firstObject(product.offers);
  return offer ? asString(offer.priceCurrency) : null;
}

function getBrand(product: Record<string, unknown> | null): string | null {
  if (!product) return null;
  const brand = product.brand;
  if (typeof brand === "string") return brand.trim() || null;
  if (brand && typeof brand === "object") return asString((brand as Record<string, unknown>).name);
  return null;
}

function extractMetaPrice(html: string): number | null {
  const patterns = [
    /<meta\b[^>]*(?:itemprop=["']price["']|property=["']product:price:amount["'])[^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:itemprop=["']price["']|property=["']product:price:amount["'])[^>]*>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = match ? asNumber(match[1]) : null;
    if (value && value > 0) return value;
  }
  return null;
}

function extractFallbackPrice(retailerKey: RetailerKey, text: string): number | null {
  const sale = text.match(/van\s*€?\s*([0-9]+(?:[,.][0-9]{1,2})?)\s+voor\s*€?\s*([0-9]+(?:[,.][0-9]{1,2})?)/i);
  if (sale) return asNumber(sale[2]);

  if (retailerKey === "action") {
    const match = text.match(/prijs\s*:\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*(?:euro|€)/i);
    if (match) return asNumber(match[1]);
  }

  if (retailerKey === "kruidvat") {
    const match = text.match(/(?:voeg toe aan wensenlijst\s*)?([0-9]+)[\s.]+([0-9]{2})\s*€\s*[0-9]+[,.][0-9]{2}\s*\/\s*prijs per/i);
    if (match) return Number(`${match[1]}.${match[2]}`);
  }

  return null;
}

function extractSize(name: string, text: string): { value: number; unit: string } | null {
  const candidate = `${name} ${text.slice(0, 2500)}`;
  const match = candidate.match(/\b([0-9]+(?:[,.][0-9]+)?)\s*(ml|cl|l|liter|litre|g|gr|gram|kg|stuk|stuks|pieces?|pcs|doekjes|wipes?)\b/i);
  if (match) {
    const value = Number(match[1].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return null;
    const rawUnit = match[2].toLowerCase();
    const unit = rawUnit === "gr" ? "g" : rawUnit === "litre" ? "l" : rawUnit;
    return { value, unit };
  }
  if (/\bper stuk\b/i.test(candidate)) return { value: 1, unit: "item" };
  return null;
}

function extractExternalId(retailerKey: RetailerKey, url: string, product: Record<string, unknown> | null): string | null {
  const jsonId = asString(product?.sku) ?? asString(product?.productID) ?? asString(product?.gtin13) ?? asString(product?.gtin);
  if (jsonId) return jsonId;

  const pathname = new URL(url).pathname;
  const patterns: Record<RetailerKey, RegExp[]> = {
    ah: [/\/wi(\d+)(?:\/|$)/i],
    aldi: [/\/product\/(\d+)\.html$/i],
    action: [/\/p\/(\d+)(?:\/|$)/i],
    etos: [/-([0-9]{6,})\.html$/i],
    kruidvat: [/\/p\/(\d+)(?:\/|$)/i],
  };

  for (const pattern of patterns[retailerKey]) {
    const match = pathname.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractPromotion(text: string): RetailerPromotionRecord | null {
  const patterns = [
    /\b\d+\s*\+\s*\d+\s*gratis\b/i,
    /\b\d+\s+(?:voor|for)\s+€?\s*[0-9]+(?:[,.][0-9]{1,2})?/i,
    /\b\d+(?:e|de)?\s+(?:artikel\s+)?halve\s+prijs\b/i,
    /\b\d+(?:e|de)?\s+artikel\s+€?\s*[0-9]+(?:[,.][0-9]{1,2})?/i,
    /\b(?:mijn etos\s+)?[0-9]+(?:[,.][0-9]+)?\s*%\s*korting\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parsePromotionLabel(match[0]);
    return {
      kind: parsed.kind,
      label: parsed.label,
      minQuantity: parsed.minQuantity,
      payQuantity: parsed.payQuantity,
      promoPrice: parsed.promoPrice,
      discountPercent: parsed.discountPercent,
      eligibility: parsed.eligibility,
    };
  }
  return null;
}

export function parseOfficialProductPage(
  retailerKey: RetailerKey,
  url: string,
  html: string,
  observedAt = new Date().toISOString(),
): RetailerPriceRecord | null {
  const product = findProductJsonLd(html);
  const text = stripHtml(html);
  const name = asString(product?.name) ?? extractTagText(html, "h1");
  if (!name) return null;

  const price = getJsonLdPrice(product) ?? extractMetaPrice(html) ?? extractFallbackPrice(retailerKey, text);
  if (!price || price <= 0) return null;

  const size = extractSize(name, text);
  const currency = (getJsonLdCurrency(product) ?? "EUR").toUpperCase();
  if (currency !== "EUR") return null;

  return {
    retailerKey,
    externalId: extractExternalId(retailerKey, url, product),
    rawName: name,
    brand: getBrand(product),
    description: asString(product?.description),
    sizeValue: size?.value ?? null,
    sizeUnit: size?.unit ?? null,
    productUrl: url,
    price,
    currency: "EUR",
    sourceUrl: url,
    observedAt,
    promotion: extractPromotion(text),
  };
}
