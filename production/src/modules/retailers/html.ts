const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  euro: "€",
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITY_MAP[name.toLowerCase()] ?? match);
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTagText(html: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = html.match(pattern);
  return match ? stripHtml(match[1]) : null;
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const pattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(decodeHtmlEntities(match[1]), baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") links.add(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }

  return [...links];
}

export function extractJsonLd(html: string): unknown[] {
  const values: unknown[] = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const raw = decodeHtmlEntities(match[1]).trim();
    if (!raw) continue;
    try {
      values.push(JSON.parse(raw));
    } catch {
      // Some retailer pages contain malformed/escaped JSON-LD; fallbacks handle those pages.
    }
  }

  return values;
}

export function walkJson(value: unknown, visit: (node: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = walkJson(entry, visit);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const object = value as Record<string, unknown>;
  if (visit(object)) return object;

  for (const child of Object.values(object)) {
    const found = walkJson(child, visit);
    if (found) return found;
  }

  return null;
}

export function findProductJsonLd(html: string): Record<string, unknown> | null {
  for (const value of extractJsonLd(html)) {
    const found = walkJson(value, (node) => {
      const type = node["@type"];
      return type === "Product" || (Array.isArray(type) && type.includes("Product"));
    });
    if (found) return found;
  }
  return null;
}
