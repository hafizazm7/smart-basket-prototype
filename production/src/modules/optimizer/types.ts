import type { FreshnessStatus, PromotionEligibility, PromotionKind } from "@/modules/pricing/types";
import type { RetailerKey } from "@/modules/retailers/types";

export type OptimizerPromotion = {
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

export type OptimizerOffer = {
  retailer: RetailerKey;
  externalId: string | null;
  productName: string;
  price: number;
  packageQuantity?: number;
  sourceUrl: string;
  observedAt: string;
  freshness: FreshnessStatus;
  promotion: OptimizerPromotion | null;
};

export type RetailerCoverageStatus = "matched" | "no_equivalent" | "source_unavailable";

export type RetailerCoverage = {
  retailer: RetailerKey;
  status: RetailerCoverageStatus;
};

export type OptimizerItem = {
  id: string;
  query: string;
  quantity: number;
  keptAsTyped: boolean;
  offers: OptimizerOffer[];
  retailerCoverage?: RetailerCoverage[];
};

export type BasketLine = {
  itemId: string;
  query: string;
  quantity: number;
  packages: number;
  retailer: RetailerKey;
  productName: string;
  unitPrice: number;
  total: number;
  sourceUrl: string;
  observedAt: string;
  freshness: FreshnessStatus;
  promotionLabel: string | null;
  promotionEligibility: PromotionEligibility | null;
  promotionApplied: boolean;
};

export type StoreBasket = {
  retailer: RetailerKey;
  lines: BasketLine[];
  subtotal: number;
  coveredItems: number;
  totalItems: number;
  complete: boolean;
};

export type BasketPlan = {
  stores: StoreBasket[];
  total: number;
  coveredItems: number;
  totalItems: number;
  complete: boolean;
};

export type BasketOptimization = {
  recommended: BasketPlan | null;
  byStore: StoreBasket[];
  singleStore: StoreBasket | null;
  unpricedItems: OptimizerItem[];
  savings: number | null;
  savingsPercent: number | null;
  availableRetailers: RetailerKey[];
};
