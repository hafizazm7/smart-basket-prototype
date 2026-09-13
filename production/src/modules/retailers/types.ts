import type { PromotionEligibility, PromotionKind } from "@/modules/pricing/types";

export type RetailerKey = "ah" | "aldi" | "action" | "etos" | "kruidvat";

export type RetailerPromotionRecord = {
  kind: PromotionKind;
  label: string;
  minQuantity?: number | null;
  payQuantity?: number | null;
  promoPrice?: number | null;
  discountPercent?: number | null;
  eligibility?: PromotionEligibility;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type RetailerPriceRecord = {
  retailerKey: RetailerKey;
  externalId?: string | null;
  rawName: string;
  brand?: string | null;
  description?: string | null;
  sizeValue?: number | null;
  sizeUnit?: string | null;
  productUrl?: string | null;
  price: number;
  currency: "EUR";
  sourceUrl: string;
  observedAt: string;
  promotion?: RetailerPromotionRecord | null;
};

export interface RetailerAdapter {
  readonly key: RetailerKey;
  readonly name: string;
  readonly officialBaseUrl: string;
  search(query: string): Promise<RetailerPriceRecord[]>;
}
