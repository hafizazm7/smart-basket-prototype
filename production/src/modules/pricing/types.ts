export type PriceSourceType = "web" | "shelf_photo" | "manual";

export type FreshnessStatus = "current" | "check" | "historical";

export type NormalizedUnit = "kg" | "l" | "item" | "wipe";

export type DisplayUnit = NormalizedUnit | "100g" | "100ml";

export type PromotionKind =
  | "multibuy"
  | "buy_x_pay_y"
  | "percent"
  | "fixed_price"
  | "other";

export type PriceObservation = {
  id?: string;
  retailerProductId: string;
  storeId?: string | null;
  price: number;
  currency: string;
  unitPrice?: number | null;
  unitPriceUnit?: string | null;
  sourceType: PriceSourceType;
  sourceUrl?: string | null;
  observedAt: string | Date;
  confirmed: boolean;
};

export type Promotion = {
  id?: string;
  retailerProductId: string;
  storeId?: string | null;
  kind: PromotionKind;
  label: string;
  minQuantity?: number | null;
  payQuantity?: number | null;
  promoPrice?: number | null;
  discountPercent?: number | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  observedAt: string | Date;
};

export type NormalizedPackage = {
  quantity: number;
  unit: NormalizedUnit;
};

export type CurrentPriceSelection = {
  observation: PriceObservation | null;
  freshness: FreshnessStatus;
  reliable: boolean;
};
