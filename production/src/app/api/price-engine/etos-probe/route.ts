export const dynamic = "force-dynamic";

const API_BASE = "https://api.etos.nl";
const CLIENT_ID = "appie";

const BASE_HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
  "accept-language": "nl-NL,nl;q=0.9",
  "user-agent": "Appie/9.27.0",
};

const GATEWAY_HEADERS = {
  ...BASE_HEADERS,
  "x-application": "AHWEBSHOP",
  "x-client-name": CLIENT_ID,
  "x-client-version": "9.27.0",
  "x-accept-language": "nl-NL",
};

type TokenResponse = { access_token?: string };

async function preview(response: Response): Promise<string> {
  const text = await response.text();
  return text.replace(/\s+/g, " ").slice(0, 280);
}

export async function GET() {
  const started = Date.now();
  const auth = await fetch(`${API_BASE}/mobile-auth/v1/auth/token/anonymous`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: GATEWAY_HEADERS,
    body: JSON.stringify({ clientId: CLIENT_ID }),
  });

  const authContentType = auth.headers.get("content-type") ?? "";
  let token: string | null = null;
  let authPreview = "";

  if (auth.ok && authContentType.includes("application/json")) {
    const body = (await auth.json()) as TokenResponse;
    token = body.access_token ?? null;
    authPreview = token ? "access_token received" : "JSON response without access_token";
  } else {
    authPreview = await preview(auth);
  }

  if (!token) {
    return Response.json({
      ok: false,
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      auth: { status: auth.status, contentType: authContentType, detail: authPreview },
      probes: [],
    });
  }

  const query = "shampoo";
  const variants = [
    {
      name: "v2-gateway-headers",
      url: `${API_BASE}/mobile-services/product/search/v2?query=${query}&size=5&page=0&sortOn=RELEVANCE`,
      headers: GATEWAY_HEADERS,
    },
    {
      name: "v2-base-headers",
      url: `${API_BASE}/mobile-services/product/search/v2?query=${query}&size=5&page=0&sortOn=RELEVANCE`,
      headers: BASE_HEADERS,
    },
    {
      name: "v1-gateway-headers",
      url: `${API_BASE}/mobile-services/product/search/v1?query=${query}&size=5&page=0&sortOn=RELEVANCE`,
      headers: GATEWAY_HEADERS,
    },
  ];

  const probes = await Promise.all(variants.map(async (variant) => {
    try {
      const response = await fetch(variant.url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: { ...variant.headers, authorization: `Bearer ${token}` },
      });
      const contentType = response.headers.get("content-type") ?? "";
      const detail = await preview(response);
      return { name: variant.name, status: response.status, contentType, detail };
    } catch (error) {
      return {
        name: variant.name,
        status: null,
        contentType: null,
        detail: error instanceof Error ? error.message : "Unknown request error",
      };
    }
  }));

  return Response.json({
    ok: probes.some((probe) => probe.status !== null && probe.status >= 200 && probe.status < 300),
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    auth: { status: auth.status, contentType: authContentType, detail: authPreview },
    probes,
  });
}
