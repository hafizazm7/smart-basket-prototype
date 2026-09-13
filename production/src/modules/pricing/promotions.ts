import type { Promotion } from "./types";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isPromotionActive(promotion: Promotion, now = new Date()): boolean {
  const start = promotion.startsAt ? new Date(promotion.startsAt) : null;
  const end = promotion.endsAt ? new Date(promotion.endsAt) : null;

  if (start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) return false;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) return false;
  return true;
}

export function isPromotionUsableForMvp(promotion: Promotion): boolean {
  return (promotion.eligibility ?? "public") === "public";
}

export function effectiveTotalForQuantity(
  regularPriceEach: number,
  quantity: number,
  promotion?: Promotion | null,
): number {
  if (!Number.isFinite(regularPriceEach) || regularPriceEach <= 0) return 0;
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const qty = Math.floor(quantity);
  if (!promotion || !isPromotionActive(promotion) || !isPromotionUsableForMvp(promotion)) {
    return roundMoney(regularPriceEach * qty);
  }

  const minQty = Math.max(1, Math.floor(promotion.minQuantity ?? 1));
  if (qty < minQty) return roundMoney(regularPriceEach * qty);

  if (promotion.kind === "buy_x_pay_y" && promotion.payQuantity != null) {
    const payQty = Math.max(0, Math.min(minQty, Math.floor(promotion.payQuantity)));
    const groups = Math.floor(qty / minQty);
    const remainder = qty % minQty;
    return roundMoney((groups * payQty + remainder) * regularPriceEach);
  }

  if (promotion.kind === "multibuy" && promotion.promoPrice != null) {
    const groups = Math.floor(qty / minQty);
    const remainder = qty % minQty;
    return roundMoney(groups * promotion.promoPrice + remainder * regularPriceEach);
  }

  if (promotion.kind === "percent" && promotion.discountPercent != null) {
    const discount = Math.min(100, Math.max(0, promotion.discountPercent)) / 100;
    return roundMoney(qty * regularPriceEach * (1 - discount));
  }

  if (promotion.kind === "nth_percent" && promotion.discountPercent != null) {
    const discount = Math.min(100, Math.max(0, promotion.discountPercent)) / 100;
    const groups = Math.floor(qty / minQty);
    const remainder = qty % minQty;
    const groupTotal = (minQty - discount) * regularPriceEach;
    return roundMoney(groups * groupTotal + remainder * regularPriceEach);
  }

  if (promotion.kind === "nth_fixed" && promotion.promoPrice != null) {
    const groups = Math.floor(qty / minQty);
    const remainder = qty % minQty;
    const groupTotal = (minQty - 1) * regularPriceEach + promotion.promoPrice;
    return roundMoney(groups * groupTotal + remainder * regularPriceEach);
  }

  if (promotion.kind === "fixed_price" && promotion.promoPrice != null) {
    return roundMoney(qty * promotion.promoPrice);
  }

  return roundMoney(regularPriceEach * qty);
}

export function effectivePriceEach(
  regularPriceEach: number,
  quantity: number,
  promotion?: Promotion | null,
): number {
  if (quantity <= 0) return 0;
  return roundMoney(effectiveTotalForQuantity(regularPriceEach, quantity, promotion) / quantity);
}
