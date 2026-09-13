import { RETAILER_SOURCES } from "./sources";
import type { RetailerKey } from "./types";

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function isAllowedRetailerUrl(retailerKey: RetailerKey, input: string): boolean {
  try {
    const url = new URL(input);
    const official = new URL(RETAILER_SOURCES[retailerKey].officialBaseUrl);
    return (
      url.protocol === "https:" &&
      normalizeHostname(url.hostname) === normalizeHostname(official.hostname)
    );
  } catch {
    return false;
  }
}

export async function fetchOfficialRetailerHtml(
  retailerKey: RetailerKey,
  input: string,
  timeoutMs = 10_000,
): Promise<{ html: string; finalUrl: string; status: number }> {
  if (!isAllowedRetailerUrl(retailerKey, input)) {
    throw new Error(`URL is not an allowed ${retailerKey} official retailer URL.`);
  }

  const response = await fetch(input, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
      "user-agent": "SmartBasket-MVP/0.1 (+central-price-collector)",
    },
  });

  if (!response.ok) {
    throw new Error(`Retailer returned HTTP ${response.status}.`);
  }

  if (!isAllowedRetailerUrl(retailerKey, response.url)) {
    throw new Error("Retailer redirected outside its official domain.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error(`Unexpected retailer content type: ${contentType || "unknown"}.`);
  }

  return {
    html: await response.text(),
    finalUrl: response.url,
    status: response.status,
  };
}
