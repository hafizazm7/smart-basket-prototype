import type { RequestedPackage } from "./types";

const TOKEN_ALIASES: Record<string, string> = {
  milk: "melk",
  melk: "melk",
  mayonnaise: "mayonaise",
  mayo: "mayonaise",
  mayonaise: "mayonaise",
  carrot: "wortel",
  carrots: "wortel",
  wortels: "wortel",
  wortel: "wortel",
  lemon: "citroen",
  lemons: "citroen",
  citroenen: "citroen",
  citroen: "citroen",
  babywipe: "babydoekje",
  babywipes: "babydoekje",
  wipes: "babydoekje",
  wipe: "babydoekje",
  billendoekjes: "babydoekje",
  billendoekje: "babydoekje",
  babydoekjes: "babydoekje",
  babydoekje: "babydoekje",
  dishwasher: "afwasmiddel",
  dishwashing: "afwasmiddel",
  afwas: "afwasmiddel",
  shampoo: "shampoo",
};

const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "de",
  "een",
  "en",
  "for",
  "het",
  "of",
  "pack",
  "pak",
  "pcs",
  "piece",
  "pieces",
  "st",
  "stuk",
  "stuks",
  "the",
  "van",
  "voor",
  "x",
]);

const PACKAGE_TOKEN = /^(?:\d+x)?\d+(?:\.\d+)?(?:kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)$/;

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalToken(token: string): string {
  return TOKEN_ALIASES[token] ?? token;
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .map(canonicalToken)
    .filter((token) => (
      token.length > 1
      && !STOP_TOKENS.has(token)
      && !/^\d+(?:\.\d+)?$/.test(token)
      && !PACKAGE_TOKEN.test(token)
    ));
}

export function uniqueTokens(input: string): string[] {
  return [...new Set(tokenize(input))];
}

export function extractRequestedPackage(input: string): RequestedPackage | null {
  const text = input.toLowerCase().replace(/,/g, ".");

  const multi = text.match(/(\d+)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]);
    if (Number.isFinite(count) && Number.isFinite(each) && count > 0 && each > 0) {
      return { value: count * each, unit: normalizeUnit(multi[3]) };
    }
  }

  const single = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gr|l|ml|cl|stuks?|stuk|doekjes?|wipes?)/i);
  if (!single) return null;
  const value = Number(single[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: normalizeUnit(single[2]) };
}

export function normalizeUnit(input: string): string {
  const unit = input.toLowerCase();
  if (unit === "gr") return "g";
  if (unit.startsWith("stuk")) return "item";
  if (unit.startsWith("doek") || unit.startsWith("wipe")) return "wipe";
  return unit;
}

export function toBasePackage(pkg: RequestedPackage): RequestedPackage {
  const unit = normalizeUnit(pkg.unit);
  if (unit === "g") return { value: pkg.value / 1000, unit: "kg" };
  if (unit === "ml") return { value: pkg.value / 1000, unit: "l" };
  if (unit === "cl") return { value: pkg.value / 100, unit: "l" };
  return { value: pkg.value, unit };
}

export function phrasePresent(haystack: string, needle: string): boolean {
  const normalizedHaystack = ` ${normalizeText(haystack)} `;
  const normalizedNeedle = normalizeText(needle);
  return Boolean(normalizedNeedle) && normalizedHaystack.includes(` ${normalizedNeedle} `);
}
