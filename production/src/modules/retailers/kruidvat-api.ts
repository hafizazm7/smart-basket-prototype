import { parsePromotionLabel } from "@/modules/pricing/parse-promotion";
import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";

const API_BASE = "https://app.kruidvat.nl/api/v2/kvn-spa";

type KruidvatPromotion = {
  startDate?: string;
  endDate?: string;
  badge?: { headline?: string };
};

type KruidvatProduct = {
  code?: string | number;
  name?: string;
  shortDescription?: string;
  manufacturer?: string;
  price?: { value?: number };
  topPromotion?: KruidvatPromotion;
};

type KruidvatSearchResponse = {
  products?: KruidvatProduct[];
};

function parseSize(input?: string): { value: number; unit: string } | null {
  if (!input) return null;
  const text = input.toLowerCase().replace(",", ".");

  const multi = text.match(/(\d+)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]);
    if (!Number.isFinite(count) || !Number.isFinite(each) || count <= 0 || each <= 0) return null;
    const raw = multi[3].toLowerCase();
    const unit = raw === "gr" ? "g" : raw.startsWith("stuk") ? "item" : raw.startsWith("doek") ? "wipe" : raw.startsWith("wipe") ? "wipe" : raw;
    return { value: count * each, unit };
  }

  const single = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (!single) return null;
  const value = Number(single[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const raw = single[2].toLowerCase();
  const unit = raw === "gr" ? "g" : raw.startsWith("stuk") ? "item" : raw.startsWith("doek") ? "wipe" : raw.startsWith("wipe") ? "wipe" : raw;
  return { value, unit };
}

function mapProduct(product: KruidvatProduct, sourceUrl: string, observedAt: string): NormalizedRetailerPrice | null {
  const externalId = product.code;
  const title = product.name?.trim();
  const price = Number(product.price?.value);
  if (!externalId || !title || !Number.isFinite(price) || price <= 0) return null;

  const size = parseSize(product.shortDescription) ?? parseSize(title);
  const label = product.topPromotion?.badge?.headline?.trim() || null;
  const parsedPromotion = label ? parsePromotionLabel(label) : null;

  return normalizeRetailerPriceRecord({
    retailerKey: "kruidvat",
    externalId: String(externalId),
    rawName: title,
    brand: product.manufacturer?.trim() || null,
    description: product.shortDescription?.trim() || null,
    sizeValue: size?.value ?? null,
    sizeUnit: size?.unit ?? null,
    productUrl: `https://www.kruidvat.nl/p/${encodeURIComponent(String(externalId))}`,
    price,
    currency: "EUR",
    sourceUrl,
    observedAt,
    promotion: parsedPromotion && parsedPromotion.kind !== "other"
      ? {
          kind: parsedPromotion.kind,
          label: parsedPromotion.label,
          minQuantity: parsedPromotion.minQuantity ?? null,
          payQuantity: parsedPromotion.payQuantity ?? null,
          promoPrice: parsedPromotion.promoPrice ?? null,
          discountPercent: parsedPromotion.discountPercent ?? null,
          eligibility: parsedPromotion.eligibility,
          startsAt: product.topPromotion?.startDate ?? null,
          endsAt: product.topPromotion?.endDate ?? null,
        }
      : null,
  });
}

export async function searchKruidvatApi(query: string, limit = 20): Promise<{
  retailerKey: "kruidvat";
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "kruidvat-app-api";
}> {
  const trimmed = query.trim();
  const sourceUrl = `${API_BASE}/search?fields=FULL&lang=nl&query=${encodeURIComponent(trimmed)}`;

  if (!trimmed) {
    return { retailerKey: "kruidvat", sourceUrl, status: 400, records: [], parser: "kruidvat-app-api" };
  }

  const response = await fetch(sourceUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "application/json",
      "accept-language": "nl-NL,nl;q=0.9",
      "user-agent": "okhttp/4.9.3",
    },
  });

  if (!response.ok) {
    return { retailerKey: "kruidvat", sourceUrl, status: response.status, records: [], parser: "kruidvat-app-api" };
  }

  const body = (await response.json()) as KruidvatSearchResponse;
  const observedAt = new Date().toISOString();
  const records = (body.products ?? [])
    .map((product) => mapProduct(product, sourceUrl, observedAt))
    .filter((record): record is NormalizedRetailerPrice => Boolean(record))
    .slice(0, Math.max(1, Math.min(50, limit)));

  return { retailerKey: "kruidvat", sourceUrl, status: response.status, records, parser: "kruidvat-app-api" };
}
