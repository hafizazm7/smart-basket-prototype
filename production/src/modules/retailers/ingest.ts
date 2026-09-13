import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePromotionLabel } from "@/modules/pricing/parse-promotion";
import { normalizeRetailerPriceRecord, type NormalizedRetailerPrice } from "./normalize-record";
import type { RetailerPriceRecord } from "./types";

function stableExternalId(record: RetailerPriceRecord): string {
  if (record.externalId?.trim()) return record.externalId.trim();
  const identity = `${record.productUrl ?? ""}|${record.rawName}|${record.sizeValue ?? ""}|${record.sizeUnit ?? ""}`;
  return `smartbasket:${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

export type IngestResult = {
  retailerProductId: string;
  priceObservationId: string;
  promotionId: string | null;
};

export async function ingestRetailerPriceRecord(
  supabase: SupabaseClient,
  input: RetailerPriceRecord | NormalizedRetailerPrice,
): Promise<IngestResult> {
  const record = "unitPrice" in input ? input : normalizeRetailerPriceRecord(input);

  const { data: retailer, error: retailerError } = await supabase
    .from("retailers")
    .select("id")
    .eq("key", record.retailerKey)
    .single();
  if (retailerError || !retailer) {
    throw new Error(retailerError?.message ?? `Retailer ${record.retailerKey} is not configured.`);
  }

  const externalId = stableExternalId(record);
  const { data: retailerProduct, error: productError } = await supabase
    .from("retailer_products")
    .upsert(
      {
        retailer_id: retailer.id,
        external_id: externalId,
        raw_name: record.rawName,
        brand: record.brand ?? null,
        description: record.description ?? null,
        size_value: record.sizeValue ?? null,
        size_unit: record.sizeUnit ?? null,
        product_url: record.productUrl ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "retailer_id,external_id" },
    )
    .select("id")
    .single();
  if (productError || !retailerProduct) {
    throw new Error(productError?.message ?? "Could not upsert retailer product.");
  }

  const { data: observation, error: observationError } = await supabase
    .from("price_observations")
    .insert({
      retailer_product_id: retailerProduct.id,
      price: record.price,
      currency: record.currency,
      unit_price: record.unitPrice,
      unit_price_unit: record.unitPriceUnit,
      source_type: "web",
      source_url: record.sourceUrl,
      observed_at: record.observedAt,
      confirmed: true,
    })
    .select("id")
    .single();
  if (observationError || !observation) {
    throw new Error(observationError?.message ?? "Could not insert price observation.");
  }

  let promotionId: string | null = null;
  if (record.promotion?.label) {
    const parsed = parsePromotionLabel(record.promotion.label);
    const promotion = {
      ...parsed,
      ...record.promotion,
    };
    const { data: insertedPromotion, error: promotionError } = await supabase
      .from("promotions")
      .insert({
        retailer_product_id: retailerProduct.id,
        kind: promotion.kind,
        label: promotion.label,
        min_quantity: promotion.minQuantity ?? null,
        pay_quantity: promotion.payQuantity ?? null,
        promo_price: promotion.promoPrice ?? null,
        discount_percent: promotion.discountPercent ?? null,
        eligibility: promotion.eligibility ?? "public",
        currency: "EUR",
        source_url: record.sourceUrl,
        starts_at: promotion.startsAt ?? null,
        ends_at: promotion.endsAt ?? null,
        observed_at: record.observedAt,
      })
      .select("id")
      .single();
    if (promotionError) throw new Error(promotionError.message);
    promotionId = insertedPromotion?.id ?? null;
  }

  return {
    retailerProductId: retailerProduct.id,
    priceObservationId: observation.id,
    promotionId,
  };
}
