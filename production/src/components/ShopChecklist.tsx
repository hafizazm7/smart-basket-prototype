"use client";

import type { RetailerKey } from "@/modules/retailers/types";

export type ChecklistItem = { id: string; text: string; quantity: number };
export type ShopAssignment = { retailer: RetailerKey; productName: string };

const STORE_NAMES: Record<RetailerKey, string> = {
  ah: "Albert Heijn",
  aldi: "ALDI",
  action: "Action",
  etos: "Etos",
  kruidvat: "Kruidvat",
};

export default function ShopChecklist({
  items,
  checkedIds,
  assignments,
  onToggle,
  onReset,
  onBack,
}: {
  items: ChecklistItem[];
  checkedIds: Set<string>;
  assignments: Record<string, ShopAssignment> | null;
  onToggle: (id: string) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const completed = items.filter((item) => checkedIds.has(item.id)).length;
  const groups = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const retailer = assignments?.[item.id]?.retailer;
    const group = retailer ? STORE_NAMES[retailer] : "Check in store";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }

  return (
    <section className="screen active" aria-label="Shopping checklist">
      <button className="back-link" type="button" onClick={onBack}>← Shopping list</button>
      <h1>Shop</h1>
      <p className="sub">Tap each item as you put it in your basket. Your checks are saved on this device.</p>
      <section className="card shop-progress" aria-live="polite">
        <div className="row space">
          <strong>{completed}/{items.length} items done</strong>
          {completed > 0 && <button className="paste-btn" type="button" onClick={onReset}>Reset checks</button>}
        </div>
        <progress value={completed} max={Math.max(items.length, 1)} aria-label="Shopping progress" />
      </section>
      {items.length === 0 ? (
        <div className="card list-empty">Your checklist is empty. Add items in List to get started.</div>
      ) : (
        [...groups].map(([group, groupItems]) => (
          <section className="card shop-group" key={group} aria-label={group}>
            <div className="shop-group-heading">
              <strong>{group}</strong>
              <span>{groupItems.filter((item) => checkedIds.has(item.id)).length}/{groupItems.length}</span>
            </div>
            {groupItems.map((item) => {
              const done = checkedIds.has(item.id);
              const assignment = assignments?.[item.id];
              return (
                <label className={`shop-item${done ? " done" : ""}`} key={item.id}>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => onToggle(item.id)}
                    aria-label={`Mark ${item.text} as ${done ? "not bought" : "bought"}`}
                  />
                  <span className="shop-item-copy">
                    <strong>{item.text}</strong>
                    <span>Qty {item.quantity}{assignment ? ` · ${assignment.productName}` : " · check in store"}</span>
                  </span>
                </label>
              );
            })}
          </section>
        ))
      )}
      {items.length > 0 && completed === items.length && (
        <div className="notice" role="status">All done! Your checklist is saved. Use Reset checks for your next trip.</div>
      )}
    </section>
  );
}
