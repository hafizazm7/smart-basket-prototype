import { createClient } from "@supabase/supabase-js";
import { classifyFreshness, freshnessLabel } from "@/modules/pricing/freshness";
import type { PriceSourceType } from "@/modules/pricing/types";

export const dynamic = "force-dynamic";

function parseIds(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 100);
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ ok: false, error: "Supabase environment variables are missing." }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const ids = parseIds(requestUrl.searchParams.get("ids"));
  if (!ids.length) {
    return Response.json({ ok: false, error: "Provide retailer product ids using ?ids=id1,id2" }, { status: 400 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const [pricesResult, promotionsResult, productsResult] = await Promise.all([
    supabase
      .from("current_price_observations")
      .select("id,retailer_product_id,store_id,price,currency,unit_price,unit_price_unit,source_type,source_url,observed_at,confirmed")
      .in("retailer_product_id", ids),
    supabase
      .from("active_promotions")
      .select("id,retailer_product_id,store_id,kind,label,min_quantity,pay_quantity,promo_price,discount_percent,eligibility,currency,source_url,starts_at,ends_at,observed_at")
      .in("retailer_product_id", ids),
    supabase
      .from("retailer_products")
      .select("id,retailer_id,external_id,raw_name,brand,description,size_value,size_unit,product_url")
      .in("id", ids),
  ]);

  const error = pricesResult.error ?? promotionsResult.error ?? productsResult.error;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const promotionsByProduct = new Map<string, typeof promotionsResult.data>();
  for (const promotion of promotionsResult.data ?? []) {
    const current = promotionsByProduct.get(promotion.retailer_product_id) ?? [];
    current.push(promotion);
    promotionsByProduct.set(promotion.retailer_product_id, current);
  }

  const pricesByProduct = new Map<string, typeof pricesResult.data>();
  for (const price of pricesResult.data ?? []) {
    const current = pricesByProduct.get(price.retailer_product_id) ?? [];
    current.push(price);
    pricesByProduct.set(price.retailer_product_id, current);
  }

  const products = (productsResult.data ?? []).map((product) => ({
    ...product,
    prices: (pricesByProduct.get(product.id) ?? []).map((price) => {
      const sourceType = price.source_type as PriceSourceType;
      const freshness = classifyFreshness(price.observed_at, sourceType);
      const reliable = freshness !== "historical" && (sourceType === "web" || price.confirmed === true);
      return {
        ...price,
        freshness,
        freshnessLabel: freshnessLabel(freshness),
        reliable,
      };
    }),
    promotions: promotionsByProduct.get(product.id) ?? [],
  }));

  return Response.json({
    ok: true,
    requested: ids.length,
    found: products.length,
    products,
  });
}
