import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";

const DATA_URL = "https://www.checkjebon.nl/data/supermarkets.json";
const CACHE_TTL_MS = 60 * 60 * 1000;

type CheckjebonProduct = {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
};

type CheckjebonSupermarket = {
  n?: string;
  c?: string;
  u?: string;
  d?: CheckjebonProduct[];
};

type CachedDataset = {
  expiresAt: number;
  observedAt: string;
  supermarkets: CheckjebonSupermarket[];
};

let cache: CachedDataset | null = null;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePackage(input?: string): { value: number; unit: string } | null {
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

function absoluteProductUrl(baseUrl: string | undefined, link: string | undefined): string | null {
  if (!link) return null;
  try {
    return new URL(link, baseUrl || "https://www.aldi.nl").toString();
  } catch {
    return null;
  }
}

async function loadDataset(): Promise<CachedDataset> {
  if (cache && Date.now() < cache.expiresAt) return cache;

  const response = await fetch(DATA_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: {
      accept: "application/json",
      "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
      "user-agent": "SmartBasket-MVP/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Checkjebon returned HTTP ${response.status}.`);
  }

  const supermarkets = (await response.json()) as CheckjebonSupermarket[];
  const lastModified = response.headers.get("last-modified");
  const parsedLastModified = lastModified ? new Date(lastModified) : null;
  const observedAt = parsedLastModified && !Number.isNaN(parsedLastModified.getTime())
    ? parsedLastModified.toISOString()
    : new Date().toISOString();

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    observedAt,
    supermarkets,
  };

  return cache;
}

export async function searchAldiCheckjebon(query: string, limit = 20): Promise<{
  retailerKey: "aldi";
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "checkjebon";
}> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { retailerKey: "aldi", sourceUrl: DATA_URL, status: 400, records: [], parser: "checkjebon" };
  }

  const dataset = await loadDataset();
  const aldi = dataset.supermarkets.find((store) => {
    const code = (store.n ?? "").toLowerCase();
    const name = (store.c ?? "").toLowerCase();
    return code === "aldi" || name.includes("aldi");
  });

  if (!aldi) {
    return { retailerKey: "aldi", sourceUrl: DATA_URL, status: 502, records: [], parser: "checkjebon" };
  }

  const matchAll = trimmed === "*";
  const queryTokens = matchAll ? [] : normalizeText(trimmed).split(" ").filter(Boolean);
  const products = (aldi.d ?? [])
    .map((product) => ({ product, normalizedName: normalizeText(product.n ?? "") }))
    .filter(({ product, normalizedName }) => {
      if (!product.n || typeof product.p !== "number" || product.p <= 0) return false;
      return matchAll || queryTokens.every((token) => normalizedName.includes(token));
    })
    .slice(0, Math.max(1, Math.min(50, limit)));

  const records = products.map(({ product }) => {
    const pkg = parsePackage(product.s);
    return normalizeRetailerPriceRecord({
      retailerKey: "aldi",
      externalId: product.l?.trim() || product.n?.trim() || null,
      rawName: product.n!.trim(),
      brand: null,
      description: product.s?.trim() || null,
      sizeValue: pkg?.value ?? null,
      sizeUnit: pkg?.unit ?? null,
      productUrl: absoluteProductUrl(aldi.u, product.l),
      price: product.p!,
      currency: "EUR",
      sourceUrl: DATA_URL,
      observedAt: dataset.observedAt,
      promotion: null,
    });
  });

  return {
    retailerKey: "aldi",
    sourceUrl: DATA_URL,
    status: 200,
    records,
    parser: "checkjebon",
  };
}
