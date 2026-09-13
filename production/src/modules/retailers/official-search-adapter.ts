import { searchAhMobileApi } from "./ah-mobile-api";
import { searchAldiCheckjebon } from "./checkjebon-aldi";
import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";
import { parseProductJsonLd } from "./jsonld";
import { RETAILER_SOURCES } from "./sources";
import type { RetailerAdapter, RetailerKey, RetailerPriceRecord } from "./types";

const DEFAULT_HEADERS = {
  "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
  "user-agent": "SmartBasket-MVP/0.1 (+centralized-retailer-price-collector)",
};

export type RetailerSearchResult = {
  retailerKey: RetailerKey;
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "json-ld" | "ah-mobile-api" | "checkjebon";
};

export class OfficialSearchAdapter implements RetailerAdapter {
  readonly key: RetailerKey;
  readonly name: string;
  readonly officialBaseUrl: string;

  constructor(key: RetailerKey) {
    const source = RETAILER_SOURCES[key];
    this.key = key;
    this.name = source.name;
    this.officialBaseUrl = source.officialBaseUrl;
  }

  async search(query: string): Promise<RetailerPriceRecord[]> {
    const result = await this.searchNormalized(query);
    return result.records;
  }

  async searchNormalized(query: string): Promise<RetailerSearchResult> {
    const trimmed = query.trim();

    if (this.key === "ah") return searchAhMobileApi(trimmed);
    if (this.key === "aldi") return searchAldiCheckjebon(trimmed);

    if (!trimmed) {
      return {
        retailerKey: this.key,
        sourceUrl: RETAILER_SOURCES[this.key].searchUrl(""),
        status: 400,
        records: [],
        parser: "json-ld",
      };
    }

    const sourceUrl = RETAILER_SOURCES[this.key].searchUrl(trimmed);
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      return {
        retailerKey: this.key,
        sourceUrl,
        status: response.status,
        records: [],
        parser: "json-ld",
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        retailerKey: this.key,
        sourceUrl,
        status: response.status,
        records: [],
        parser: "json-ld",
      };
    }

    const observedAt = new Date().toISOString();
    const html = await response.text();
    const records = parseProductJsonLd(html, this.key, sourceUrl, observedAt)
      .map(normalizeRetailerPriceRecord)
      .slice(0, 50);

    return {
      retailerKey: this.key,
      sourceUrl,
      status: response.status,
      records,
      parser: "json-ld",
    };
  }
}

export function getRetailerAdapter(key: RetailerKey): OfficialSearchAdapter {
  return new OfficialSearchAdapter(key);
}
