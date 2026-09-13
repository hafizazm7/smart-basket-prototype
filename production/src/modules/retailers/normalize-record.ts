import { calculateBaseUnitPrice } from "@/modules/pricing/unit-price";
import type { RetailerPriceRecord } from "./types";

export type NormalizedRetailerPrice = RetailerPriceRecord & {
  unitPrice: number | null;
  unitPriceUnit: string | null;
};

export function normalizeRetailerPriceRecord(record: RetailerPriceRecord): NormalizedRetailerPrice {
  const unitPrice = calculateBaseUnitPrice(record.price, record.sizeValue, record.sizeUnit);

  return {
    ...record,
    rawName: record.rawName.trim(),
    brand: record.brand?.trim() || null,
    description: record.description?.trim() || null,
    productUrl: record.productUrl?.trim() || null,
    sourceUrl: record.sourceUrl.trim(),
    unitPrice: unitPrice?.unitPrice ?? null,
    unitPriceUnit: unitPrice?.unit ?? null,
  };
}
