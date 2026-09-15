import { effectiveTotalForQuantity, isPromotionActive, isPromotionUsableForMvp } from "@/modules/pricing/promotions";
import type { Promotion } from "@/modules/pricing/types";
import type { RetailerKey } from "@/modules/retailers/types";
import type {
  BasketLine,
  BasketOptimization,
  BasketPlan,
  OptimizerItem,
  OptimizerOffer,
  StoreBasket,
} from "./types";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function usablePromotion(offer: OptimizerOffer): Promotion | null {
  if (!offer.promotion) return null;

  const promotion: Promotion = {
    retailerProductId: offer.externalId ?? offer.productName,
    observedAt: offer.observedAt,
    ...offer.promotion,
  };

  return isPromotionActive(promotion) && isPromotionUsableForMvp(promotion)
    ? promotion
    : null;
}

function lineForOffer(item: OptimizerItem, offer: OptimizerOffer): BasketLine {
  const promotion = usablePromotion(offer);
  const packages = Math.max(1, Math.floor(offer.packageQuantity ?? item.quantity));
  return {
    itemId: item.id,
    query: item.query,
    quantity: item.quantity,
    packages,
    retailer: offer.retailer,
    productName: offer.productName,
    unitPrice: offer.price,
    total: effectiveTotalForQuantity(offer.price, packages, promotion),
    sourceUrl: offer.sourceUrl,
    observedAt: offer.observedAt,
    freshness: offer.freshness,
    promotionLabel: offer.promotion?.label ?? null,
    promotionEligibility: offer.promotion?.eligibility ?? null,
    promotionApplied: Boolean(promotion),
  };
}

function validOffers(item: OptimizerItem): OptimizerOffer[] {
  if (item.keptAsTyped) return [];
  return item.offers.filter((offer) => (
    Number.isFinite(offer.price)
    && offer.price > 0
    && offer.freshness !== "historical"
  ));
}

function cheapestLine(item: OptimizerItem, retailers: Set<RetailerKey>): BasketLine | null {
  const lines = validOffers(item)
    .filter((offer) => retailers.has(offer.retailer))
    .map((offer) => lineForOffer(item, offer))
    .sort((left, right) => (
      left.total - right.total
      || left.retailer.localeCompare(right.retailer)
      || left.productName.localeCompare(right.productName)
    ));
  return lines[0] ?? null;
}

function storeBasket(items: OptimizerItem[], retailer: RetailerKey): StoreBasket {
  const retailerSet = new Set([retailer]);
  const lines = items
    .map((item) => cheapestLine(item, retailerSet))
    .filter((line): line is BasketLine => Boolean(line));

  return {
    retailer,
    lines,
    subtotal: roundMoney(lines.reduce((sum, line) => sum + line.total, 0)),
    coveredItems: lines.length,
    totalItems: items.length,
    complete: lines.length === items.length,
  };
}

function planForRetailers(
  items: OptimizerItem[],
  retailers: RetailerKey[],
): BasketPlan | null {
  if (!retailers.length) return null;

  const retailerSet = new Set(retailers);
  const lines = items
    .map((item) => cheapestLine(item, retailerSet))
    .filter((line): line is BasketLine => Boolean(line));
  if (!lines.length) return null;

  const stores = retailers
    .map((retailer) => {
      const storeLines = lines.filter((line) => line.retailer === retailer);
      return {
        retailer,
        lines: storeLines,
        subtotal: roundMoney(storeLines.reduce((sum, line) => sum + line.total, 0)),
        coveredItems: storeLines.length,
        totalItems: items.length,
        complete: storeLines.length === items.length,
      } satisfies StoreBasket;
    })
    .filter((store) => store.lines.length > 0)
    .sort((left, right) => left.retailer.localeCompare(right.retailer));

  return {
    stores,
    total: roundMoney(lines.reduce((sum, line) => sum + line.total, 0)),
    coveredItems: lines.length,
    totalItems: items.length,
    complete: lines.length === items.length,
  };
}

function retailerSubsets(retailers: RetailerKey[], maxStores: number): RetailerKey[][] {
  const subsets: RetailerKey[][] = [];

  function visit(index: number, selected: RetailerKey[]) {
    if (selected.length > 0) subsets.push([...selected]);
    if (selected.length >= maxStores) return;

    for (let next = index; next < retailers.length; next += 1) {
      selected.push(retailers[next]);
      visit(next + 1, selected);
      selected.pop();
    }
  }

  visit(0, []);
  return subsets;
}

function comparePlans(left: BasketPlan, right: BasketPlan): number {
  return (
    right.coveredItems - left.coveredItems
    || left.total - right.total
    || left.stores.length - right.stores.length
    || left.stores.map((store) => store.retailer).join(",").localeCompare(
      right.stores.map((store) => store.retailer).join(","),
    )
  );
}

export function optimizeBasket(
  items: OptimizerItem[],
  requestedMaxStores = 3,
): BasketOptimization {
  const availableRetailers = [...new Set(
    items.flatMap((item) => validOffers(item).map((offer) => offer.retailer)),
  )].sort();
  const maxStores = Math.max(1, Math.min(
    availableRetailers.length || 1,
    Math.floor(requestedMaxStores) || 1,
  ));

  const byStore = availableRetailers
    .map((retailer) => storeBasket(items, retailer))
    .sort((left, right) => (
      right.coveredItems - left.coveredItems
      || left.subtotal - right.subtotal
      || left.retailer.localeCompare(right.retailer)
    ));

  const plans = retailerSubsets(availableRetailers, maxStores)
    .map((retailers) => planForRetailers(items, retailers))
    .filter((plan): plan is BasketPlan => Boolean(plan))
    .sort(comparePlans);
  const recommended = plans[0] ?? null;
  const singleStore = byStore
    .filter((store) => store.complete)
    .sort((left, right) => left.subtotal - right.subtotal || left.retailer.localeCompare(right.retailer))[0]
    ?? null;
  const unpricedItems = items.filter((item) => validOffers(item).length === 0);

  const canCompareSavings = Boolean(recommended?.complete && singleStore);
  const savings = canCompareSavings
    ? roundMoney(Math.max(0, (singleStore?.subtotal ?? 0) - (recommended?.total ?? 0)))
    : null;
  const savingsPercent = savings != null && singleStore && singleStore.subtotal > 0
    ? Math.round((savings / singleStore.subtotal) * 100)
    : null;

  return {
    recommended,
    byStore,
    singleStore,
    unpricedItems,
    savings,
    savingsPercent,
    availableRetailers,
  };
}
