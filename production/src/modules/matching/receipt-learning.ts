import { normalizeText, uniqueTokens } from "./text";

export type ReceiptListItem = {
  id: string;
  text: string;
};

export type ReceiptSuggestion = {
  itemId: string;
  receiptLabel: string | null;
  confidence: number;
  automatic: boolean;
};

const NON_PRODUCT_LINE = /\b(?:albert heijn|aldi|action|etos|kruidvat|receipt|kassabon|filiaal|datum|tijd|kassa|medewerker|subtotaal|totaal|betaling|betaald|pin|contant|wisselgeld|btw|bonus|bonuskaart|bbox|benefit|promotions?|korting|deposit|incl[.]?hef[.]?sup|spaarsaldo|koopzegels|transactie|kaartnummer|www\.|bedankt|welkom)\b/i;
const END_OF_PURCHASES = /\bsubt[o0]ta{1,2}l\b/i;
const PRICE_AT_END = /(?:\s|^)[€]?\s*-?\d{1,4}[,.]\d{2}\s*[A-Z]?\s*$/i;
const OCR_PRICE_AND_MARKER = /\s+[€]?\s*(?:\d{1,4}[,.]\d{2}|\d{3})\s*(?:BB?|%|;)\s*$/i;
const LEADING_QUANTITY = /^\s*\d+(?:[,.]\d+)?\s*[xX*]?\s+/;
const PRODUCT_CODE = /\b\d{7,}\b/;

function cleanReceiptLine(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(OCR_PRICE_AND_MARKER, "")
    .replace(PRICE_AT_END, "")
    .replace(LEADING_QUANTITY, "")
    .replace(/^[*#·\-]+\s*/, "")
    .trim();
}

export function extractReceiptProducts(text: string): string[] {
  const seen = new Set<string>();
  const products: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    if (END_OF_PURCHASES.test(rawLine)) break;
    const line = cleanReceiptLine(rawLine);
    const letters = line.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
    const normalized = normalizeText(line);

    if (
      letters < 3
      || line.length < 3
      || line.length > 80
      || NON_PRODUCT_LINE.test(line)
      || PRODUCT_CODE.test(line)
      || !normalized
      || seen.has(normalized)
    ) continue;

    seen.add(normalized);
    products.push(line);
  }

  return products;
}

export function receiptLinkConfidence(query: string, receiptLabel: string): number {
  const queryTokens = uniqueTokens(query);
  const receiptTokens = uniqueTokens(receiptLabel);
  if (!queryTokens.length || !receiptTokens.length) return 0;

  const receiptSet = new Set(receiptTokens);
  const overlap = queryTokens.filter((token) => receiptSet.has(token)).length;
  const coverage = overlap / queryTokens.length;
  const precision = overlap / receiptTokens.length;
  const queryText = normalizeText(query);
  const receiptText = normalizeText(receiptLabel);
  const phraseBonus = receiptText.includes(queryText) || queryText.includes(receiptText) ? 0.2 : 0;

  return Math.min(1, coverage * 0.65 + precision * 0.15 + phraseBonus);
}

export function suggestReceiptLinks(
  items: ReceiptListItem[],
  receiptProducts: string[],
): ReceiptSuggestion[] {
  const used = new Set<string>();

  return items.map((item) => {
    let bestLabel: string | null = null;
    let bestConfidence = 0;

    for (const receiptLabel of receiptProducts) {
      if (used.has(receiptLabel)) continue;
      const confidence = receiptLinkConfidence(item.text, receiptLabel);
      if (confidence > bestConfidence) {
        bestLabel = receiptLabel;
        bestConfidence = confidence;
      }
    }

    const automatic = bestConfidence >= 0.52;
    if (automatic && bestLabel) used.add(bestLabel);

    return {
      itemId: item.id,
      receiptLabel: automatic ? bestLabel : null,
      confidence: Number(bestConfidence.toFixed(2)),
      automatic,
    };
  });
}
