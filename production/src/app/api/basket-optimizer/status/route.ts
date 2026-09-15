import { optimizeBasket } from "@/modules/optimizer/optimize";
import type { OptimizerItem, OptimizerOffer, OptimizerPromotion } from "@/modules/optimizer/types";
import type { RetailerKey } from "@/modules/retailers/types";

export const dynamic = "force-dynamic";

const observedAt = new Date().toISOString();

function offer(
  retailer: RetailerKey,
  productName: string,
  price: number,
  promotion: OptimizerPromotion | null = null,
): OptimizerOffer {
  return {
    retailer,
    externalId: `${retailer}-${productName.toLowerCase().replace(/\W+/g, "-")}`,
    productName,
    price,
    sourceUrl: `https://example.test/${retailer}`,
    observedAt,
    freshness: "current",
    promotion,
  };
}

function item(id: string, query: string, quantity: number, offers: OptimizerOffer[]): OptimizerItem {
  return { id, query, quantity, offers, keptAsTyped: false };
}

export async function GET() {
  const splitBasket = [
    item("milk", "Milk", 1, [
      offer("ah", "Milk", 3),
      offer("aldi", "Milk", 2),
    ]),
    item("soap", "Soap", 1, [
      offer("ah", "Soap", 4),
      offer("aldi", "Soap", 5),
    ]),
  ];
  const recommended = optimizeBasket(splitBasket, 2);
  const oneStore = optimizeBasket(splitBasket, 1);

  const publicPromotion = optimizeBasket([
    item("wipes", "Wipes", 2, [offer("etos", "Wipes", 3, {
      kind: "multibuy",
      label: "2 voor €5",
      minQuantity: 2,
      promoPrice: 5,
      eligibility: "public",
    })]),
  ]);
  const loyaltyPromotion = optimizeBasket([
    item("wipes", "Wipes", 2, [offer("etos", "Wipes", 3, {
      kind: "multibuy",
      label: "2 voor €5 met Mijn Etos",
      minQuantity: 2,
      promoPrice: 5,
      eligibility: "loyalty",
    })]),
  ]);
  const incomplete = optimizeBasket([
    ...splitBasket.slice(0, 1),
    { id: "typed", query: "Local market item", quantity: 1, offers: [], keptAsTyped: true },
  ], 2);

  const checks = {
    cheapestCombinationUsesTwoStores:
      recommended.recommended?.stores.length === 2
      && recommended.recommended.total === 6,
    storeLimitIsRespected:
      oneStore.recommended?.stores.length === 1
      && oneStore.recommended.total === 7,
    cheapestSingleStoreIsExposed:
      recommended.singleStore?.retailer === "ah"
      && recommended.singleStore.subtotal === 7,
    savingsUseCompleteSingleStoreBaseline:
      recommended.savings === 1
      && recommended.savingsPercent === 14,
    publicPromotionUsesQuantity:
      publicPromotion.recommended?.total === 5
      && publicPromotion.recommended.stores[0]?.lines[0]?.promotionApplied === true,
    loyaltyPromotionIsNotAssumed:
      loyaltyPromotion.recommended?.total === 6
      && loyaltyPromotion.recommended.stores[0]?.lines[0]?.promotionApplied === false,
    unpricedItemIsVisibleWithoutSavingsClaim:
      incomplete.recommended?.complete === false
      && incomplete.unpricedItems[0]?.id === "typed"
      && incomplete.savings === null,
  };

  return Response.json({
    ok: Object.values(checks).every(Boolean),
    checkedAt: new Date().toISOString(),
    checks,
    sample: {
      recommendedTotal: recommended.recommended?.total ?? null,
      recommendedStores: recommended.recommended?.stores.map((store) => store.retailer) ?? [],
      singleStoreTotal: recommended.singleStore?.subtotal ?? null,
      savings: recommended.savings,
    },
  });
}
