import type { RetailerPriceRecord, RetailerKey } from "./types";

function decodeHtml(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function collectObjects(value: unknown, output: Record<string, unknown>[]) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectObjects(entry, output));
    return;
  }
  if (typeof value !== "object") return;

  const object = value as Record<string, unknown>;
  output.push(object);
  Object.values(object).forEach((entry) => collectObjects(entry, output));
}

function isProduct(object: Record<string, unknown>): boolean {
  const type = object["@type"];
  return type === "Product" || (Array.isArray(type) && type.includes("Product"));
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", ".").replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function offerObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry && typeof entry === "object");
    return (first as Record<string, unknown> | undefined) ?? null;
  }
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function brandName(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    return firstString((value as Record<string, unknown>).name);
  }
  return null;
}

export function parsePackageFromText(text: string): { sizeValue: number; sizeUnit: string } | null {
  const normalized = text.toLowerCase().replace(",", ".");
  const multipack = normalized.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|l|g|kg|stuks?|doekjes?)/i);
  if (multipack) {
    const count = Number(multipack[1]);
    const size = Number(multipack[2]);
    if (Number.isFinite(count) && Number.isFinite(size) && count > 0 && size > 0) {
      return { sizeValue: count * size, sizeUnit: multipack[3] };
    }
  }

  const simple = normalized.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l|g|kg|stuks?|doekjes?)/i);
  if (!simple) return null;
  const sizeValue = Number(simple[1]);
  if (!Number.isFinite(sizeValue) || sizeValue <= 0) return null;
  return { sizeValue, sizeUnit: simple[2] };
}

export function parseProductJsonLd(
  html: string,
  retailerKey: RetailerKey,
  sourceUrl: string,
  observedAt = new Date().toISOString(),
): RetailerPriceRecord[] {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const objects: Record<string, unknown>[] = [];

  for (const match of scripts) {
    const raw = decodeHtml(match[1].trim());
    if (!raw) continue;
    try {
      collectObjects(JSON.parse(raw), objects);
    } catch {
      // Ignore malformed structured-data blocks; another block may still be valid.
    }
  }

  const seen = new Set<string>();
  const products: RetailerPriceRecord[] = [];

  for (const object of objects.filter(isProduct)) {
    const offer = offerObject(object.offers);
    const name = firstString(object.name);
    const price = firstNumber(offer?.price, offer?.lowPrice, object.price);
    if (!name || !price || price <= 0) continue;

    const productUrl = firstString(object.url, offer?.url) ?? sourceUrl;
    const externalId = firstString(object.sku, object.productID, object.gtin13, object.gtin);
    const dedupeKey = externalId ?? `${name}|${price}|${productUrl}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const description = firstString(object.description);
    const packageInfo = parsePackageFromText(`${name} ${description ?? ""}`);

    products.push({
      retailerKey,
      externalId,
      rawName: name,
      brand: brandName(object.brand),
      description,
      sizeValue: packageInfo?.sizeValue ?? null,
      sizeUnit: packageInfo?.sizeUnit ?? null,
      productUrl,
      price,
      currency: "EUR",
      sourceUrl,
      observedAt,
      promotion: null,
    });
  }

  return products;
}
