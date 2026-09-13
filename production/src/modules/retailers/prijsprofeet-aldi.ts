import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";

const API_BASE = "https://www.prijsprofeet.nl/api/v1";
const USER_AGENT = "SmartBasket/0.1 (+https://smart-basket-ten.vercel.app)";

type PrijsProfeetProduct = {
  product_id?: string;
  base_product_id?: string;
  name?: string;
  brand?: string | null;
  price?: number;
  original_price?: number | null;
  discount_percentage?: number | null;
  quantity?: string | null;
  unit?: string | null;
  product_url?: string | null;
  extracted_at?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  promotion_status?: string | null;
  is_current_deal?: boolean | null;
};

type SearchEnvelope = {
  results?: PrijsProfeetProduct[];
  products?: PrijsProfeetProduct[];
  items?: PrijsProfeetProduct[];
};

function parsePackage(input?: string | null): { value: number; unit: string } | null {
  if (!input) return null;
  const text = input.toLowerCase().replace(",", ".");

  const multi = text.match(/(\d+)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]);
    if (!Number.isFinite(count) || !Number.isFinite(each) || count <= 0 || each <= 0) return null;
    const raw = multi[3].toLowerCase();
    const unit = raw === "gr" ? "g" : raw.startsWith("stuk") ? "item" : raw.startsWith("doek") || raw.startsWith("wipe") ? "wipe" : raw;
    return { value: count * each, unit };
  }

  const single = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (!single) return null;

  const value = Number(single[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const raw = single[2].toLowerCase();
  const unit = raw === "gr" ? "g" : raw.startsWith("stuk") ? "item" : raw.startsWith("doek") || raw.startsWith("wipe") ? "wipe" : raw;
  return { value, unit };
}

function extractProducts(payload: unknown): PrijsProfeetProduct[] {
  if (Array.isArray(payload)) return payload as PrijsProfeetProduct[];
  if (!payload || typeof payload !== "object") return [];
  const envelope = payload as SearchEnvelope;
  if (Array.isArray(envelope.results)) return envelope.results;
  if (Array.isArray(envelope.products)) return envelope.products;
  if (Array.isArray(envelope.items)) return envelope.items;
  return [];
}

function isUsableToday(product: PrijsProfeetProduct): boolean {
  const status = product.promotion_status?.toLowerCase();
  return status !== "upcoming" && status !== "historical";
}

function mapProduct(product: PrijsProfeetProduct, sourceUrl: string): NormalizedRetailerPrice | null {
  const name = product.name?.trim();
  const current = Number(product.price);
  if (!name || !Number.isFinite(current) || current <= 0) return null;

  const original = Number(product.original_price);
  const hasPromotion = Number.isFinite(original) && original > current;
  const size = parsePackage(product.quantity);
  const observedAt = product.extracted_at && !Number.isNaN(new Date(product.extracted_at).getTime())
    ? new Date(product.extracted_at).toISOString()
    : new Date().toISOString();

  return normalizeRetailerPriceRecord({
    retailerKey: "aldi",
    externalId: product.base_product_id?.trim() || product.product_id?.trim() || null,
    rawName: name,
    brand: product.brand?.trim() || null,
    description: product.quantity?.trim() || null,
    sizeValue: size?.value ?? null,
    sizeUnit: size?.unit ?? null,
    productUrl: product.product_url?.trim() || null,
    price: hasPromotion ? original : current,
    currency: "EUR",
    sourceUrl,
    observedAt,
    promotion: hasPromotion
      ? {
          kind: "fixed_price",
          label: product.discount_percentage
            ? `Aanbieding -${Math.round(product.discount_percentage)}%`
            : `Aanbieding €${current.toFixed(2)}`,
          promoPrice: current,
          eligibility: "public",
          startsAt: product.valid_from ?? null,
          endsAt: product.valid_until ?? null,
        }
      : null,
  });
}

export async function searchAldiPrijsProfeet(query: string, limit = 20): Promise<{
  retailerKey: "aldi";
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "prijsprofeet";
}> {
  const trimmed = query.trim();
  const safeLimit = Math.max(1, Math.min(50, limit));
  const sourceUrl = `${API_BASE}/products/search/${encodeURIComponent(trimmed)}?retailer=aldi&page=1&page_size=${safeLimit}`;

  if (!trimmed || trimmed === "*") {
    return { retailerKey: "aldi", sourceUrl, status: 400, records: [], parser: "prijsprofeet" };
  }

  const response = await fetch(sourceUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "application/json",
      "accept-language": "nl-NL,nl;q=0.9",
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    return { retailerKey: "aldi", sourceUrl, status: response.status, records: [], parser: "prijsprofeet" };
  }

  const payload = (await response.json()) as unknown;
  const records = extractProducts(payload)
    .filter(isUsableToday)
    .map((product) => mapProduct(product, sourceUrl))
    .filter((record): record is NormalizedRetailerPrice => Boolean(record))
    .slice(0, safeLimit);

  return { retailerKey: "aldi", sourceUrl, status: response.status, records, parser: "prijsprofeet" };
}
