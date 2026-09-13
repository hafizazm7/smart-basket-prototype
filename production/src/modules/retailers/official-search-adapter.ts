import { searchAhMobileApi } from "./ah-mobile-api";
import { searchAldiHybrid } from "./aldi-hybrid";
import { searchActionApi } from "./action-api";
import { searchEtosMobileApi } from "./etos-mobile-api";
import { searchKruidvatApi } from "./kruidvat-api";
import type { NormalizedRetailerPrice } from "./normalize-record";
import { RETAILER_SOURCES } from "./sources";
import type { RetailerAdapter, RetailerKey, RetailerPriceRecord } from "./types";

export type RetailerSearchResult = {
  retailerKey: RetailerKey;
  sourceUrl: string;
  status: number;
  records: NormalizedRetailerPrice[];
  parser: "ah-mobile-api" | "checkjebon" | "prijsprofeet" | "action-graphql" | "etos-mobile-api" | "kruidvat-app-api";
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

    switch (this.key) {
      case "ah":
        return searchAhMobileApi(trimmed);
      case "aldi":
        return searchAldiHybrid(trimmed);
      case "action":
        return searchActionApi(trimmed);
      case "etos":
        return searchEtosMobileApi(trimmed);
      case "kruidvat":
        return searchKruidvatApi(trimmed);
    }
  }
}

export function getRetailerAdapter(key: RetailerKey): OfficialSearchAdapter {
  return new OfficialSearchAdapter(key);
}
