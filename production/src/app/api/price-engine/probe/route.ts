export const dynamic = "force-dynamic";

type ProbeResult = {
  retailer: "action" | "etos" | "kruidvat";
  probe: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  detail: unknown;
  elapsedMs: number;
};

async function probeAction(): Promise<ProbeResult> {
  const started = Date.now();
  const variables = encodeURIComponent(JSON.stringify({ input: ["3016130"] }));
  const extensions = encodeURIComponent(JSON.stringify({
    persistedQuery: {
      sha256Hash: "01f60c35372a4d855a2aa460f53abfb31c02de45d5f442ffc7cb59dd48fab63c",
      version: 1,
    },
    headers: { "Accept-Language": "nl-NL" },
  }));
  const url = `https://www.action.com/api/graphql?operationName=GetProductsByCodes&variables=${variables}&extensions=${extensions}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "application/json",
        "accept-language": "nl-NL,nl;q=0.9",
        "apollographql-client-name": "web",
        "x-apollo-operation-name": "GetProductsByCodes",
        "x-client-version": "1.194",
        "user-agent": "Mozilla/5.0 SmartBasket-MVP/0.1",
      },
    });

    const contentType = response.headers.get("content-type");
    const text = await response.text();
    let detail: unknown = text.slice(0, 400);
    if (contentType?.includes("application/json")) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        detail = {
          hasData: Boolean(json.data),
          hasErrors: Array.isArray(json.errors) && json.errors.length > 0,
          topLevelKeys: Object.keys(json).slice(0, 10),
          sample: text.slice(0, 400),
        };
      } catch {
        // Keep text sample.
      }
    }

    return {
      retailer: "action",
      probe: "persisted GraphQL GetProductsByCodes",
      ok: response.ok && Boolean(contentType?.includes("application/json")),
      status: response.status,
      contentType,
      detail,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      retailer: "action",
      probe: "persisted GraphQL GetProductsByCodes",
      ok: false,
      status: null,
      contentType: null,
      detail: error instanceof Error ? error.message : "Unknown error",
      elapsedMs: Date.now() - started,
    };
  }
}

async function probeEtos(): Promise<ProbeResult> {
  const started = Date.now();
  const url = "https://www.etos.nl/on/demandware.store/Sites-etos-nl-Site/nl_NL/Search-Show?q=shampoo&format=ajax";

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "nl-NL,nl;q=0.9",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 SmartBasket-MVP/0.1",
      },
    });
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    const lower = text.toLowerCase();

    return {
      retailer: "etos",
      probe: "Salesforce SFRA Search-Show",
      ok: response.ok && (lower.includes("product") || lower.includes("price")),
      status: response.status,
      contentType,
      detail: {
        bytes: text.length,
        looksLikeProductHtml: lower.includes("product") || lower.includes("price"),
        sample: text.replace(/\s+/g, " ").slice(0, 400),
      },
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      retailer: "etos",
      probe: "Salesforce SFRA Search-Show",
      ok: false,
      status: null,
      contentType: null,
      detail: error instanceof Error ? error.message : "Unknown error",
      elapsedMs: Date.now() - started,
    };
  }
}

async function probeKruidvat(): Promise<ProbeResult> {
  const started = Date.now();
  const url = "https://api.kruidvat.nl/api/v2/api-docs";

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "application/json",
        "accept-language": "nl-NL,nl;q=0.9",
        "user-agent": "Mozilla/5.0 SmartBasket-MVP/0.1",
      },
    });
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    let detail: unknown = text.slice(0, 400);

    if (contentType?.includes("json")) {
      try {
        const json = JSON.parse(text) as {
          info?: { title?: string; version?: string };
          paths?: Record<string, unknown>;
        };
        const paths = Object.keys(json.paths ?? {});
        detail = {
          title: json.info?.title ?? null,
          version: json.info?.version ?? null,
          pathCount: paths.length,
          productOrSearchPaths: paths.filter((path) => /product|search/i.test(path)).slice(0, 30),
        };
      } catch {
        // Keep text sample.
      }
    }

    return {
      retailer: "kruidvat",
      probe: "website API OpenAPI docs",
      ok: response.ok && Boolean(contentType?.includes("json")),
      status: response.status,
      contentType,
      detail,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      retailer: "kruidvat",
      probe: "website API OpenAPI docs",
      ok: false,
      status: null,
      contentType: null,
      detail: error instanceof Error ? error.message : "Unknown error",
      elapsedMs: Date.now() - started,
    };
  }
}

export async function GET() {
  const results = await Promise.all([probeAction(), probeEtos(), probeKruidvat()]);
  return Response.json({
    ok: results.every((result) => result.ok),
    checkedAt: new Date().toISOString(),
    results,
  });
}
