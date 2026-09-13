import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { getRetailerAdapter } from "@/modules/retailers/official-search-adapter";
import { ingestRetailerPriceRecord } from "@/modules/retailers/ingest";
import { RETAILER_KEYS } from "@/modules/retailers/sources";
import type { RetailerKey } from "@/modules/retailers/types";

export const dynamic = "force-dynamic";

type CollectBody = {
  retailer?: string;
  query?: string;
};

function authorized(request: Request): boolean {
  const configured = process.env.PRICE_ENGINE_COLLECT_SECRET;
  if (!configured) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${configured}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Server-side Supabase write credentials are not configured." },
      { status: 503 },
    );
  }

  let body: CollectBody;
  try {
    body = (await request.json()) as CollectBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const retailer = (body.retailer ?? "").trim().toLowerCase() as RetailerKey;
  const query = (body.query ?? "").trim();

  if (!RETAILER_KEYS.includes(retailer)) {
    return Response.json({ ok: false, error: "Unsupported retailer." }, { status: 400 });
  }
  if (!query || query.length > 120) {
    return Response.json({ ok: false, error: "Query is required and must be 120 characters or fewer." }, { status: 400 });
  }

  try {
    const source = await getRetailerAdapter(retailer).searchNormalized(query);
    const candidates = source.records.slice(0, 20);
    const ingested = [];

    for (const candidate of candidates) {
      ingested.push(await ingestRetailerPriceRecord(supabase, candidate));
    }

    return Response.json({
      ok: source.status >= 200 && source.status < 400,
      retailer,
      query,
      sourceStatus: source.status,
      candidatesFound: source.records.length,
      ingested: ingested.length,
      records: ingested,
      collectedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Collector failed." },
      { status: 502 },
    );
  }
}
