export const dynamic = "force-dynamic";

type ProbeResult = {
  name: string;
  status: number | null;
  ok: boolean;
  detail: string;
};

async function safeText(response: Response): Promise<string> {
  const text = await response.text();
  return text.replace(/\s+/g, " ").slice(0, 500);
}

async function probePrijsprofeet(retailer: string): Promise<ProbeResult> {
  const url = `https://www.prijsprofeet.nl/api/v1/search?q=melk&retailer=${encodeURIComponent(retailer)}&page_size=5`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "application/json",
        "user-agent": "SmartBasket/0.1 (+https://smart-basket-ten.vercel.app)",
      },
    });
    return {
      name: `prijsprofeet:${retailer}`,
      status: response.status,
      ok: response.ok,
      detail: await safeText(response),
    };
  } catch (error) {
    return { name: `prijsprofeet:${retailer}`, status: null, ok: false, detail: error instanceof Error ? error.message : "unknown error" };
  }
}

const etosVariants = [
  {
    name: "etos:appie-ios-ah-headers",
    clientId: "appie-ios",
    headers: {
      "x-application": "AHWEBSHOP",
      "x-client-name": "appie-ios",
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "Appie/8.22.3",
    },
  },
  {
    name: "etos:appie-basic",
    clientId: "appie",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "Appie/9.27.0",
    },
  },
  {
    name: "etos:appie-ios-basic",
    clientId: "appie-ios",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "Appie/8.22.3",
    },
  },
] as const;

async function probeEtosVariant(variant: (typeof etosVariants)[number]): Promise<ProbeResult> {
  const base = "https://api.etos.nl";
  try {
    const tokenResponse = await fetch(`${base}/mobile-auth/v1/auth/token/anonymous`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: variant.headers,
      body: JSON.stringify({ clientId: variant.clientId }),
    });

    const tokenText = await tokenResponse.text();
    if (!tokenResponse.ok) {
      return { name: variant.name, status: tokenResponse.status, ok: false, detail: `auth: ${tokenText.replace(/\s+/g, " ").slice(0, 300)}` };
    }

    let token: string | null = null;
    try {
      const parsed = JSON.parse(tokenText) as { access_token?: string };
      token = parsed.access_token ?? null;
    } catch {
      token = null;
    }

    if (!token) {
      return { name: variant.name, status: tokenResponse.status, ok: false, detail: "auth succeeded but no access_token" };
    }

    const paths = [
      "/mobile-services/product/search/v2?query=shampoo&size=5&page=0&sortOn=RELEVANCE",
      "/mobile-services/product/search/v1?query=shampoo&size=5&page=0&sortOn=RELEVANCE",
      "/mobile-services/product/search?query=shampoo&size=5&page=0",
      "/mobile-services/v1/product/search?query=shampoo&size=5&page=0",
    ];

    const attempts: string[] = [];
    for (const path of paths) {
      const response = await fetch(`${base}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: { ...variant.headers, authorization: `Bearer ${token}` },
      });
      const sample = await safeText(response);
      attempts.push(`${path} => ${response.status} ${sample.slice(0, 180)}`);
      if (response.ok) {
        return { name: variant.name, status: response.status, ok: true, detail: attempts.join(" | ") };
      }
    }

    return { name: variant.name, status: 500, ok: false, detail: attempts.join(" | ") };
  } catch (error) {
    return { name: variant.name, status: null, ok: false, detail: error instanceof Error ? error.message : "unknown error" };
  }
}

export async function GET() {
  const results = await Promise.all([
    probePrijsprofeet("aldi"),
    probePrijsprofeet("Aldi"),
    ...etosVariants.map(probeEtosVariant),
  ]);

  return Response.json({ checkedAt: new Date().toISOString(), results });
}
