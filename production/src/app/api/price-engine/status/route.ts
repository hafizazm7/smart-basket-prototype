import { createClient } from "@supabase/supabase-js";
import { DEFAULT_FRESHNESS_THRESHOLDS } from "@/modules/pricing/freshness";

export const dynamic = "force-dynamic";

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

  return Response.json({
    ok: true,
    engine: "price-engine-v1",
    retailers: retailers.count ?? 0,
    currentPrices: prices.count ?? 0,
    activePromotions: promotions.count ?? 0,
    freshnessThresholds: DEFAULT_FRESHNESS_THRESHOLDS,
  });
}
