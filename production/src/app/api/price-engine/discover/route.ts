import { discoverProductLinks } from "@/modules/retailers/discover-product-links";
import { fetchOfficialRetailerHtml } from "@/modules/retailers/official-web";
import type { RetailerKey } from "@/modules/retailers/types";

const RETAILERS = new Set<RetailerKey>(["ah", "aldi", "action", "etos", "kruidvat"]);

function readRetailer(value: string | null): RetailerKey | null {
  return value && RETAILERS.has(value as RetailerKey) ? (value as RetailerKey) : null;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const retailerKey = readRetailer(params.get("retailer"));
  const listingUrl = params.get("url");
  const requestedLimit = Number(params.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 20;

  if (!retailerKey || !listingUrl) {
    return Response.json(
      { ok: false, error: "Use ?retailer=ah|aldi|action|etos|kruidvat&url=<official listing URL>." },
      { status: 400 },
    );
  }

  try {
    const fetched = await fetchOfficialRetailerHtml(retailerKey, listingUrl);
    const productUrls = discoverProductLinks(retailerKey, fetched.html, fetched.finalUrl, limit);

    return Response.json({
      ok: true,
      retailer: retailerKey,
      listingUrl: fetched.finalUrl,
      count: productUrls.length,
      productUrls,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        retailer: retailerKey,
        error: error instanceof Error ? error.message : "Unknown discovery error.",
      },
      { status: 502 },
    );
  }
}
