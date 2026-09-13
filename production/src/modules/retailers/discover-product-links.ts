import { extractLinks } from "./html";
import type { RetailerKey } from "./types";

const PRODUCT_PATH_PATTERNS: Record<RetailerKey, RegExp[]> = {
  ah: [/^\/producten\/product\/wi\d+\//i, /^\/producten\/product\/wi\d+$/i],
  aldi: [/^\/product\/\d+\.html$/i],
  action: [/^\/nl-nl\/p\/\d+\//i, /^\/nl-nl\/p\/\d+$/i],
  etos: [/^\/producten\/[^?#]+-[0-9]{6,}\.html$/i],
  kruidvat: [/\/p\/\d+\/?$/i],
};

export function isProductUrl(retailerKey: RetailerKey, input: string): boolean {
  try {
    const pathname = new URL(input).pathname;
    return PRODUCT_PATH_PATTERNS[retailerKey].some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
}

export function discoverProductLinks(
  retailerKey: RetailerKey,
  html: string,
  listingUrl: string,
  limit = 50,
): string[] {
  const links = extractLinks(html, listingUrl)
    .filter((url) => isProductUrl(retailerKey, url))
    .map((url) => {
      const normalized = new URL(url);
      normalized.search = "";
      normalized.hash = "";
      return normalized.toString();
    });

  return [...new Set(links)].slice(0, Math.max(0, limit));
}
