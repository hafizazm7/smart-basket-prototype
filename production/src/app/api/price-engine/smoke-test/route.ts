import { fetchOfficialRetailerHtml } from "@/modules/retailers/official-web";
import { parseOfficialProductPage } from "@/modules/retailers/parse-product-page";
import type { RetailerKey } from "@/modules/retailers/types";

export const dynamic = "force-dynamic";

const FIXTURES: { retailer: RetailerKey; url: string }[] = [
  {
    retailer: "ah",
    url: "https://www.ah.nl/producten/product/wi185858/andrelon-volume-en-care-shampoo",
  },
  {
    retailer: "aldi",
    url: "https://www.aldi.nl/product/1229354.html",
  },
  {
    retailer: "action",
    url: "https://www.action.com/nl-nl/p/3219696/l-oreal-elvive-shampoo-clean-control/",
  },
  {
    retailer: "etos",
    url: "https://www.etos.nl/producten/etos-baby-kids-anti-prik-shampoo-300-ml-120777261.html",
  },
  {
    retailer: "kruidvat",
    url: "https://www.kruidvat.nl/kruidvat-keratin-repair-shampoo/p/6515115",
  },
];

async function runFixture(fixture: (typeof FIXTURES)[number]) {
  const started = Date.now();

  try {
    const fetched = await fetchOfficialRetailerHtml(fixture.retailer, fixture.url, 12_000);
    const record = parseOfficialProductPage(fixture.retailer, fetched.finalUrl, fetched.html);

    return {
      retailer: fixture.retailer,
      ok: Boolean(record),
      elapsedMs: Date.now() - started,
      record: record
        ? {
            externalId: record.externalId,
            name: record.rawName,
            price: record.price,
            sizeValue: record.sizeValue,
            sizeUnit: record.sizeUnit,
            promotion: record.promotion?.label ?? null,
            sourceUrl: record.sourceUrl,
          }
        : null,
      error: record ? null : "Reachable page, but no trustworthy record parsed.",
    };
  } catch (error) {
    return {
      retailer: fixture.retailer,
      ok: false,
      elapsedMs: Date.now() - started,
      record: null,
      error: error instanceof Error ? error.message : "Unknown collector error.",
    };
  }
}

export async function GET() {
  const results = await Promise.all(FIXTURES.map(runFixture));

  return Response.json({
    ok: results.every((result) => result.ok),
    passed: results.filter((result) => result.ok).length,
    total: results.length,
    checkedAt: new Date().toISOString(),
    results,
  });
}
