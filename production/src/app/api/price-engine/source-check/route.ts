import { RETAILER_SOURCES } from "@/modules/retailers/sources";

export const dynamic = "force-dynamic";

async function checkSource(key: keyof typeof RETAILER_SOURCES) {
  const source = RETAILER_SOURCES[key];
  const started = Date.now();

  try {
    const response = await fetch(source.officialBaseUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
        "user-agent": "SmartBasket-MVP/0.1 (+price-data-feasibility-check)",
      },
    });

    return {
      key,
      name: source.name,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      key,
      name: source.name,
      ok: false,
      status: null,
      contentType: null,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

export async function GET() {
  const keys = Object.keys(RETAILER_SOURCES) as (keyof typeof RETAILER_SOURCES)[];
  const sources = await Promise.all(keys.map(checkSource));

  return Response.json({
    ok: sources.some((source) => source.ok),
    checkedAt: new Date().toISOString(),
    sources,
  });
}
