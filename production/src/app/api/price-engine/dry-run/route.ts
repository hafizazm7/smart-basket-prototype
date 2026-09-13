import { fetchOfficialRetailerHtml } from "@/modules/retailers/official-web";
import { parseOfficialProductPage } from "@/modules/retailers/parse-product-page";
import type { RetailerKey } from "@/modules/retailers/types";

const RETAILERS = new Set<RetailerKey>(["ah", "aldi", "action", "etos", "kruidvat"]);

function readRetailer(value: string | null): RetailerKey | null {
  return value && RETAILERS.has(value as RetailerKey) ? (value as RetailerKey) : null;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const retailerKey = readRetailer(params.get("retailer"));
  const productUrl = params.get("url");

  if (!retailerKey || !productUrl) {
    return Response.json(
      { ok: false, error: "Use ?retailer=ah|aldi|action|etos|kruidvat&url=<official product URL>." },
      { status: 400 },
    );
  }

  try {
    const fetched = await fetchOfficialRetailerHtml(retailerKey, productUrl);
    const parsed = parseOfficialProductPage(retailerKey, fetched.finalUrl, fetched.html);

    if (!parsed) {
      return Response.json(
        {
          ok: false,
          retailer: retailerKey,
          fetchedStatus: fetched.status,
          error: "Page was reachable but a trustworthy price record could not be parsed.",
        },
        { status: 422 },
      );
    }

    return Response.json({ ok: true, record: parsed });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        retailer: retailerKey,
        error: error instanceof Error ? error.message : "Unknown collector error.",
      },
      { status: 502 },
    );
  }
}
