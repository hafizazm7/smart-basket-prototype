import { getRetailerAdapter } from "@/modules/retailers/official-search-adapter";
import type { RetailerKey } from "@/modules/retailers/types";

export const dynamic = "force-dynamic";

const FIXTURES: { retailer: RetailerKey; query: string }[] = [
  { retailer: "ah", query: "melk" },
  { retailer: "aldi", query: "melk" },
  { retailer: "action", query: "shampoo" },
  { retailer: "etos", query: "shampoo" },
  { retailer: "kruidvat", query: "shampoo" },
];

async function runFixture(fixture: (typeof FIXTURES)[number]) {
  const started = Date.now();

  try {
    const result = await getRetailerAdapter(fixture.retailer).searchNormalized(fixture.query);
    const record = result.records[0] ?? null;
    const ok = result.status >= 200 && result.status < 300 && Boolean(record);

    return {
      retailer: fixture.retailer,
      query: fixture.query,
      ok,
      parser: result.parser,
      sourceStatus: result.status,
      candidatesFound: result.records.length,
      elapsedMs: Date.now() - started,
      record: record
        ? {
            externalId: record.externalId,
            name: record.rawName,
            price: record.price,
            sizeValue: record.sizeValue,
            sizeUnit: record.sizeUnit,
            unitPrice: record.unitPrice,
            unitPriceUnit: record.unitPriceUnit,
            promotion: record.promotion?.label ?? null,
            sourceUrl: record.sourceUrl,
          }
        : null,
      error: ok ? null : `Collector returned HTTP ${result.status} with ${result.records.length} usable records.`,
    };
  } catch (error) {
    return {
      retailer: fixture.retailer,
      query: fixture.query,
      ok: false,
      parser: null,
      sourceStatus: null,
      candidatesFound: 0,
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
