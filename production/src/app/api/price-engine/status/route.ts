import { createClient } from "@supabase/supabase-js";
import { DEFAULT_FRESHNESS_THRESHOLDS } from "@/modules/pricing/freshness";
import { effectiveTotalForQuantity } from "@/modules/pricing/promotions";
import { calculateBaseUnitPrice } from "@/modules/pricing/unit-price";

export const dynamic = "force-dynamic";

function runSelfChecks() {
  const unitPrice = calculateBaseUnitPrice(2.5, 500, "g");
  const buyOneGetOne = effectiveTotalForQuantity(3, 2, {
    retailerProductId: "self-check",
    kind: "buy_x_pay_y",
    label: "1+1 gratis",
    minQuantity: 2,
    payQuantity: 1,
    observedAt: new Date().toISOString(),
  });
  const twoForFive = effectiveTotalForQuantity(3, 2, {
    retailerProductId: "self-check",
    kind: "multibuy",
    label: "2 voor 5",
    minQuantity: 2,
    promoPrice: 5,
    observedAt: new Date().toISOString(),
  });

  return {
    unitPrice500gAt250: unitPrice?.unit === "kg" && unitPrice.unitPrice === 5,
    buyOneGetOne: buyOneGetOne === 3,
    twoForFive: twoForFive === 5,
  };
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return Response.json(
      { ok: false, error: "Supabase environment variables are missing." },
      { status: 503 },
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [retailers, prices, promotions] = await Promise.all([
    supabase.from("retailers").select("id", { count: "exact", head: true }),
    supabase.from("current_price_observations").select("id", { count: "exact", head: true }),
    supabase.from("active_promotions").select("id", { count: "exact", head: true }),
  ]);

  const error = retailers.error ?? prices.error ?? promotions.error;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const checks = runSelfChecks();

  return Response.json({
    ok: Object.values(checks).every(Boolean),
    engine: "price-engine-v1",
    retailers: retailers.count ?? 0,
    currentPrices: prices.count ?? 0,
    activePromotions: promotions.count ?? 0,
    freshnessThresholds: DEFAULT_FRESHNESS_THRESHOLDS,
    checks,
  });
}
