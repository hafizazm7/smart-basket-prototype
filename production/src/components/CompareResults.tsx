"use client";

import { useMemo, useState } from "react";
import { optimizeBasket } from "@/modules/optimizer/optimize";
import type { BasketPlan, OptimizerItem, StoreBasket } from "@/modules/optimizer/types";
import type { RetailerKey } from "@/modules/retailers/types";

type CompareTab = "recommended" | "by-store" | "single-store";
type MaxStores = 1 | 2 | 3 | "any";

const RETAILER_NAMES: Record<RetailerKey, string> = {
  ah: "Albert Heijn",
  aldi: "ALDI",
  action: "Action",
  etos: "Etos",
  kruidvat: "Kruidvat",
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
}

function formatChecked(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unknown";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  }).format(date);
}

function StoreLines({ store }: { store: StoreBasket }) {
  return (
    <section className="store-group" aria-label={`${RETAILER_NAMES[store.retailer]} items`}>
      <div className="row space store-heading">
        <div>
          <div className="store-name">{RETAILER_NAMES[store.retailer]}</div>
          <div className="helper">{store.lines.length} item{store.lines.length === 1 ? "" : "s"}</div>
        </div>
        <strong>{formatMoney(store.subtotal)}</strong>
      </div>

      <div className="basket-lines">
        {store.lines.map((line) => (
          <article className="basket-line" key={line.itemId}>
            <div className="row space basket-line-top">
              <strong>{line.query}</strong>
              <strong>{formatMoney(line.total)}</strong>
            </div>
            <div className="helper">
              Qty {line.quantity}{line.packages !== line.quantity ? ` · buy ${line.packages} packs` : ""} · {line.productName}
            </div>
            {line.promotionLabel && (
              <div className={line.promotionApplied ? "promo-note" : "helper"}>
                {line.promotionApplied
                  ? `Offer applied: ${line.promotionLabel}`
                  : `${line.promotionLabel} not included${line.promotionEligibility && line.promotionEligibility !== "public" ? " (membership/personal offer)" : ""}`}
              </div>
            )}
            <div className="source-row">
              <span className={`freshness ${line.freshness}`}>{line.freshness === "current" ? "Current" : "May need checking"}</span>
              <span>Checked {formatChecked(line.observedAt)}</span>
              <a href={line.sourceUrl} target="_blank" rel="noreferrer">Source</a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UnpricedLines({ items }: { items: OptimizerItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="store-group unpriced-store-group" aria-label="Items to check in store">
      <div className="row space store-heading unpriced-heading">
        <div>
          <div className="store-name">Check in store</div>
          <div className="helper">{items.length} item{items.length === 1 ? "" : "s"} · price not included</div>
        </div>
      </div>

      <div className="basket-lines">
        {items.map((item) => (
          <article className="basket-line" key={item.id}>
            <div className="row space basket-line-top">
              <strong>{item.query}</strong>
              <strong className="price-unavailable">Price unavailable</strong>
            </div>
            <div className="helper">
              Qty {item.quantity} · {item.keptAsTyped ? "kept as typed" : "no usable current price"} · check in store
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BasketPlanView({
  plan,
  unpricedItems,
  totalItems,
}: {
  plan: BasketPlan | null;
  unpricedItems: OptimizerItem[];
  totalItems: number;
}) {
  const pricedItems = plan?.coveredItems ?? 0;
  const storeCount = plan?.stores.length ?? 0;

  return (
    <div className="stack">
      <section className="card compare-basket-card">
        <div className="row space compare-card-heading">
          <div>
            <div className="photo-title">Recommended basket</div>
            <div className="helper">
              {totalItems}/{totalItems} items shown · {pricedItems} priced · {storeCount} store{storeCount === 1 ? "" : "s"}
            </div>
          </div>
          <div className="compare-total-wrap">
            <div className="compare-total-label">Priced total</div>
            <div className="compare-total">{plan ? formatMoney(plan.total) : "—"}</div>
          </div>
        </div>
        {plan?.stores.map((store) => <StoreLines store={store} key={store.retailer} />)}
        <UnpricedLines items={unpricedItems} />
      </section>
    </div>
  );
}

export default function CompareResults({
  items,
  onBack,
}: {
  items: OptimizerItem[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<CompareTab>("recommended");
  const [maxStores, setMaxStores] = useState<MaxStores>(3);
  const result = useMemo(
    () => optimizeBasket(items, maxStores === "any" ? 5 : maxStores),
    [items, maxStores],
  );
  const pricedItems = result.recommended?.coveredItems ?? 0;

  return (
    <section className="screen active" aria-label="Compare results">
      <button className="back-link" type="button" onClick={onBack}>← Shopping list</button>
      <h1>Compare results</h1>
      <p className="sub">The cheapest live basket within your store limit. Public offers are included automatically.</p>

      <section className="card stack store-limit" aria-label="Maximum number of stores">
        <div>
          <div className="photo-title">Maximum stores</div>
          <div className="helper">Choose how many stops you are willing to make.</div>
        </div>
        <div className="segment-control">
          {([1, 2, 3, "any"] as MaxStores[]).map((value) => (
            <button
              className={maxStores === value ? "active" : ""}
              type="button"
              key={value}
              onClick={() => setMaxStores(value)}
              aria-pressed={maxStores === value}
            >
              {value === "any" ? "Any" : value}
            </button>
          ))}
        </div>
      </section>

      {result.recommended ? (
        result.recommended.complete ? (
          <section className="savings-card" aria-label="Basket savings">
            {result.savings != null && result.savings > 0 ? (
              <>
                <div className="savings-label">You can save</div>
                <div className="savings-value">
                  {formatMoney(result.savings)}{result.savingsPercent != null ? ` (${result.savingsPercent}%)` : ""}
                </div>
                <div className="savings-copy">versus the cheapest complete single-store basket</div>
              </>
            ) : (
              <>
                <div className="savings-label">Best current total</div>
                <div className="savings-value">{formatMoney(result.recommended.total)}</div>
                <div className="savings-copy">within your selected store limit</div>
              </>
            )}
          </section>
        ) : (
          <section className="warning-card" aria-live="polite">
            <strong>All {items.length} items are shown below</strong>
            <div className="helper">{pricedItems} item{pricedItems === 1 ? " has" : "s have"} a usable price. The priced total excludes {result.unpricedItems.length} item{result.unpricedItems.length === 1 ? "" : "s"} to check in store, so Smart Basket does not claim a full-basket saving.</div>
          </section>
        )
      ) : (
        <section className="warning-card" aria-live="polite">
          <strong>All {items.length} items are shown below</strong>
          <div className="helper">No items have a usable live price yet. Check them in store; no basket total or saving is claimed.</div>
        </section>
      )}

      <div className="compare-tabs" role="tablist" aria-label="Comparison views">
        <button role="tab" aria-selected={tab === "recommended"} className={tab === "recommended" ? "active" : ""} type="button" onClick={() => setTab("recommended")}>Recommended</button>
        <button role="tab" aria-selected={tab === "by-store"} className={tab === "by-store" ? "active" : ""} type="button" onClick={() => setTab("by-store")}>By store</button>
        <button role="tab" aria-selected={tab === "single-store"} className={tab === "single-store" ? "active" : ""} type="button" onClick={() => setTab("single-store")}>Single store</button>
      </div>

      {tab === "recommended" && (
        <BasketPlanView plan={result.recommended} unpricedItems={result.unpricedItems} totalItems={items.length} />
      )}

      {tab === "by-store" && (
        <div className="stack">
          {result.byStore.map((store) => (
            <section className="card store-summary" key={store.retailer}>
              <div className="row space">
                <div>
                  <div className="photo-title">{RETAILER_NAMES[store.retailer]}</div>
                  <div className="helper">{store.coveredItems}/{store.totalItems} items · {store.complete ? "complete basket" : "priced subtotal"}</div>
                </div>
                <strong>{formatMoney(store.subtotal)}</strong>
              </div>
            </section>
          ))}
          {result.byStore.length === 0 && <div className="card list-empty">No store totals are available yet.</div>}
        </div>
      )}

      {tab === "single-store" && (
        result.singleStore ? (
          <section className="card compare-basket-card">
            <div className="row space compare-card-heading">
              <div>
                <div className="photo-title">Cheapest complete single store</div>
                <div className="helper">{RETAILER_NAMES[result.singleStore.retailer]} · {result.singleStore.coveredItems} items</div>
              </div>
              <div className="compare-total">{formatMoney(result.singleStore.subtotal)}</div>
            </div>
            <StoreLines store={result.singleStore} />
          </section>
        ) : (
          <div className="card list-empty">No single store has a usable price for every item.</div>
        )
      )}

      <p className="compare-footnote">Latest available online prices. Historical prices and membership/personal offers are not used in totals.</p>
    </section>
  );
}
