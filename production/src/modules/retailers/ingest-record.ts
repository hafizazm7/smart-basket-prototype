import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRetailerPriceRecord } from "./normalize-record";
import type { RetailerPriceRecord } from "./types";

function fallbackExternalId(record: RetailerPriceRecord): string {
  if (record.externalId?.trim()) return record.externalId.trim();
  if (record.productUrl?.trim()) return `url:${record.productUrl.trim()}`;

  const size = record.sizeValue && record.sizeUnit
    ? `${record.sizeValue}${record.sizeUnit}`.toLowerCase()
    : "unknown-size";

  return `fallback:${record.rawName.trim().toLowerCase()}|${size}`;
}

export async function ingestRetailerPriceRecord(
  supabase: SupabaseClient,
  input: RetailerPriceRecord,
) {
  const record = normalizeRetailerPriceRecord(input);
  const externalId = fallbackExternalId(record);

  const { data: retailer, error: retailerError } = await supabase
    .from("retailers")
    .select("id")
    .eq("key", record.retailerKey)
    .single();

  if (retailerError || !retailer) {
    throw new Error(`Retailer ${record.retailerKey} is not configured.`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("retailer_products")
    .select("id")
    .eq("retailer_id", retailer.id)
    .eq("external_id", externalId)
    .maybeSingle();

  if (existingError) throw existingError;

  let retailerProductId = existing?.id as string | undefined;

  if (retailerProductId) {
    const { error } = await supabase
      .from("retailer_products")
      .update({
        raw_name: record.rawName,
        brand: record.brand,
        description: record.description,
        size_value: record.sizeValue,
        size_unit: record.sizeUnit,
        product_url: record.productUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", retailerProductId);

    if (error) throw error;
  } else {
    const { data: inserted, error } = await supabase
      .from("retailer_products")
      .insert({
        retailer_id: retailer.id,
        external_id: externalId,
        raw_name: record.rawName,
        brand: record.brand,
        description: record.description,
        size_value: record.sizeValue,
        size_unit: record.sizeUnit,
        product_url: record.productUrl,
      })
      .select("id")
      .single();

    if (error || !inserted) throw error ?? new Error("Could not create retailer product.");
    retailerProductId = inserted.id as string;
  }

  const { error: observationError } = await supabase.from("price_observations").insert({
    retailer_product_id: retailerProductId,
    price: record.price,
    currency: record.currency,
    unit_price: record.unitPrice,
    unit_price_unit: record.unitPriceUnit,
    source_type: "web",
    source_url: record.sourceUrl,
    observed_at: record.observedAt,
    confirmed: false,
  });

  if (observationError) throw observationError;

  if (record.promotion) {
    const { error: promotionError } = await supabase.from("promotions").insert({
      retailer_product_id: retailerProductId,
      kind: record.promotion.kind,
      label: record.promotion.label,
      min_quantity: record.promotion.minQuantity,
      pay_quantity: record.promotion.payQuantity,
      promo_price: record.promotion.promoPrice,
      discount_percent: record.promotion.discountPercent,
      eligibility: record.promotion.eligibility ?? "public",
      currency: record.currency,
      source_url: record.sourceUrl,
      starts_at: record.promotion.startsAt,
      ends_at: record.promotion.endsAt,
      observed_at: record.observedAt,
    });

    if (promotionError) throw promotionError;
  }

  return {
    retailerProductId,
    externalId,
    unitPrice: record.unitPrice,
    unitPriceUnit: record.unitPriceUnit,
  };
}
