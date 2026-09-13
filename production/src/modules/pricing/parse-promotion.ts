import type { PromotionEligibility, PromotionKind } from "./types";

export type ParsedPromotion = {
  kind: PromotionKind;
  label: string;
  minQuantity?: number;
  payQuantity?: number;
  promoPrice?: number;
  discountPercent?: number;
  eligibility: PromotionEligibility;
};

function parseNumber(value: string): number {
  return Number(value.replace(",", "."));
}

function detectEligibility(label: string): PromotionEligibility {
  const text = label.toLowerCase();
  if (text.includes("persoonlijk") || text.includes("personalized")) return "personalized";
  if (text.includes("mijn etos") || text.includes("club") || text.includes("member")) return "loyalty";
  return "public";
}

export function parsePromotionLabel(input: string): ParsedPromotion {
  const label = input.trim();
  const text = label.toLowerCase().replace(/\s+/g, " ");
  const eligibility = detectEligibility(label);

  const buyGet = text.match(/(\d+)\s*\+\s*(\d+)\s*gratis/);
  if (buyGet) {
    const paid = Number(buyGet[1]);
    const free = Number(buyGet[2]);
    return {
      kind: "buy_x_pay_y",
      label,
      minQuantity: paid + free,
      payQuantity: paid,
      eligibility,
    };
  }

  const multiBuy = text.match(/(\d+)\s+(?:voor|for)\s+€?\s*([0-9]+(?:[,.][0-9]{1,2})?)/);
  if (multiBuy) {
    return {
      kind: "multibuy",
      label,
      minQuantity: Number(multiBuy[1]),
      promoPrice: parseNumber(multiBuy[2]),
      eligibility,
    };
  }

  const nthHalf = text.match(/(\d+)(?:e|de)?\s+(?:artikel\s+)?halve\s+prijs/);
  if (nthHalf) {
    return {
      kind: "nth_percent",
      label,
      minQuantity: Number(nthHalf[1]),
      discountPercent: 50,
      eligibility,
    };
  }

  const nthFixed = text.match(/(\d+)(?:e|de)?\s+artikel\s+€?\s*([0-9]+(?:[,.][0-9]{1,2})?)/);
  if (nthFixed) {
    return {
      kind: "nth_fixed",
      label,
      minQuantity: Number(nthFixed[1]),
      promoPrice: parseNumber(nthFixed[2]),
      eligibility,
    };
  }

  const percent = text.match(/([0-9]+(?:[,.][0-9]+)?)\s*%\s*(?:korting|discount)?/);
  if (percent) {
    return {
      kind: "percent",
      label,
      discountPercent: parseNumber(percent[1]),
      eligibility,
    };
  }

  const fixed = text.match(/(?:voor|nu)\s+€?\s*([0-9]+(?:[,.][0-9]{1,2})?)/);
  if (fixed) {
    return {
      kind: "fixed_price",
      label,
      promoPrice: parseNumber(fixed[1]),
      eligibility,
    };
  }

  return { kind: "other", label, eligibility };
}
