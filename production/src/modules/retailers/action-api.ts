import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";

const ACTION_API_URL = "https://gateway.action.com/api/gateway";

const PRODUCT_SEARCH_QUERY = `
query ProductSearch($input: SearchProductsInput!) {
  searchProducts(input: $input) {
    productResults {
      searchProducts {
        product {
          code
          category
          description
          href
          image
          isDeal
          isNew
          aisleName
          brandInfo { name }
          price {
            currencyPosition
            currencyCode
            current {
              whole
              fractional
              amount
              formatted
            }
          }
        }
      }
      pagination {
        numberOfPages
        numberOfResults
      }
    }
  }
}`;

type ActionProduct = {
  code?: string;
  category?: string;
  description?: string;
  href?: string;
  image?: string;
  isDeal?: boolean;
  isNew?: boolean;
  aisleName?: string;
  brandInfo?: { name?: string };
  price?: {
    currencyCode?: string;
    current?: {
      whole?: number | string;
      fractional?: number | string;
      amount?: number | string;
      formatted?: string;
    };
  };
};

type ActionGraphqlResponse = {
  data?: {
    searchProducts?: {
      productResults?: {
        searchProducts?: Array<{ product?: ActionProduct }>;
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9,.-]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function productPrice(product: ActionProduct): number | null {
  const current = product.price?.current;
  const amount = parseNumber(current?.amount);
  if (amount && amount > 0) return amount;

  const whole = parseNumber(current?.whole);
  const fractional = parseNumber(current?.fractional);
  if (whole !== null) {
    const price = whole + ((fractional ?? 0) / 100);
    if (price > 0) return price;
  }

  const formatted = parseNumber(current?.formatted);
  return formatted && formatted > 0 ? formatted : null;
}

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

function absoluteUrl(input?: string): string | null {
  if (!input) return null;
  try {
    return new URL(input, "https://www.action.com").toString();
  } catch {
    return null;
  }
}

function titleCaseSlug(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function productNameFromHref(input?: string, code?: string): string | null {
  if (!input) return null;

  try {
    const url = new URL(input, "https://www.action.com");
    const ignored = new Set(["nl-nl", "nl", "p", "product", "producten"]);
    const candidates = url.pathname
      .split("/")
      .map((part) => decodeURIComponent(part).trim())
      .filter((part) => part && !ignored.has(part.toLowerCase()) && !/^\d+$/.test(part))
      .filter((part) => /[a-z]/i.test(part));

    const slug = candidates.sort((a, b) => b.length - a.length)[0];
    if (!slug) return null;

    const withoutCode = code
      ? slug.replace(new RegExp(`[-_]?${code.replace(/[^0-9a-z]/gi, "")}$`, "i"), "")
      : slug;
    const name = titleCaseSlug(withoutCode);
    return name.length >= 4 ? name : null;
  } catch {
    return null;
  }
}

function mapProduct(product: ActionProduct, observedAt: string): NormalizedRetailerPrice | null {
  const brand = product.brandInfo?.name?.trim() || null;
  const category = product.category?.trim() || product.aisleName?.trim() || null;
  const pack = product.description?.trim() || null;
  const hrefName = productNameFromHref(product.href, product.code);
  const fallbackName = [brand, category].filter(Boolean).join(" ").trim() || pack;
  const name = hrefName || fallbackName;
  const price = productPrice(product);
  if (!name || !price || price <= 0) return null;

  const size = parseSize(pack ?? undefined) ?? parseSize(name);

  return normalizeRetailerPriceRecord({
    retailerKey: "action",
    externalId: product.code?.trim() || null,
    rawName: name,
    brand,
    description: pack,
    sizeValue: size?.value ?? null,
    sizeUnit: size?.unit ?? null,
    productUrl: absoluteUrl(product.href),
    price,
    currency: "EUR",
    sourceUrl: ACTION_API_URL,
    observedAt,
    promotion: null,
  });
}

export async function searchActionApi(query: string, limit = 20): Promise<{
  retailerKey: "action";
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "action-graphql";
}> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { retailerKey: "action", sourceUrl: ACTION_API_URL, status: 400, records: [], parser: "action-graphql" };
  }

  const response = await fetch(ACTION_API_URL, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "accept-language": "nl-NL",
      "user-agent": "SmartBasket-MVP/0.1",
    },
    body: JSON.stringify({
      operationName: "ProductSearch",
      query: PRODUCT_SEARCH_QUERY,
      variables: { input: { searchTerm: trimmed } },
    }),
  });

  if (!response.ok) {
    return { retailerKey: "action", sourceUrl: ACTION_API_URL, status: response.status, records: [], parser: "action-graphql" };
  }

  const body = (await response.json()) as ActionGraphqlResponse;
  if (Array.isArray(body.errors) && body.errors.length > 0 && !body.data) {
    return { retailerKey: "action", sourceUrl: ACTION_API_URL, status: 502, records: [], parser: "action-graphql" };
  }

  const observedAt = new Date().toISOString();
  const products = body.data?.searchProducts?.productResults?.searchProducts ?? [];
  const records = products
    .map((entry) => entry.product ? mapProduct(entry.product, observedAt) : null)
    .filter((record): record is NormalizedRetailerPrice => Boolean(record))
    .slice(0, Math.max(1, Math.min(50, limit)));

  return {
    retailerKey: "action",
    sourceUrl: ACTION_API_URL,
    status: response.status,
    records,
    parser: "action-graphql",
  };
}
