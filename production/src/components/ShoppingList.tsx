"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CompareResults from "@/components/CompareResults";
import MatchReview from "@/components/MatchReview";
import ReceiptLearning from "@/components/ReceiptLearning";
import ShopChecklist, { type ShopAssignment } from "@/components/ShopChecklist";
import type { BasketPlan } from "@/modules/optimizer/types";
import type { OptimizerItem } from "@/modules/optimizer/types";

type ShoppingItem = {
  id: string;
  text: string;
  quantity: number;
  createdAt: number;
};

const STORAGE_KEY = "smart-basket.shopping-list.v1";
const CHECKED_KEY = "smart-basket.shop-checked.v1";
const ASSIGNMENTS_KEY = "smart-basket.shop-assignments.v1";

function listSignature(items: ShoppingItem[]): string {
  return JSON.stringify(items.map(({ id, text, quantity }) => [id, text, quantity]));
}

function makeItem(text: string): ShoppingItem {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    quantity: 1,
    createdAt: Date.now(),
  };
}

export default function ShoppingList() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [singleInput, setSingleInput] = useState("");
  const [singleMode, setSingleMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewItems, setReviewItems] = useState<ShoppingItem[] | null>(null);
  const [optimizerItems, setOptimizerItems] = useState<OptimizerItem[] | null>(null);
  const [matchAttention, setMatchAttention] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [shopAssignments, setShopAssignments] = useState<Record<string, ShopAssignment> | null>(null);
  const [currentPlan, setCurrentPlan] = useState<BasketPlan | null>(null);
  const [screen, setScreen] = useState<"list" | "compare" | "shop">("list");
  const matchReviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let restored: ShoppingItem[] = [];

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ShoppingItem[];
        if (Array.isArray(parsed)) restored = parsed;
      }
    } catch {
      // Keep the list usable even if local storage is unavailable or malformed.
    }

    let restoredChecks: string[] = [];
    let restoredAssignments: Record<string, ShopAssignment> | null = null;
    try {
      const savedChecks = JSON.parse(window.localStorage.getItem(CHECKED_KEY) ?? "[]") as unknown;
      if (Array.isArray(savedChecks)) restoredChecks = savedChecks.filter((id): id is string => typeof id === "string");
      const savedPlan = JSON.parse(window.localStorage.getItem(ASSIGNMENTS_KEY) ?? "null") as {
        signature?: string;
        assignments?: Record<string, ShopAssignment>;
      } | null;
      if (savedPlan?.signature === listSignature(restored) && savedPlan.assignments) {
        restoredAssignments = savedPlan.assignments;
      }
    } catch {
      // A damaged storage entry should not prevent a usable checklist.
    }

    const frame = window.requestAnimationFrame(() => {
      setItems(restored);
      setCheckedIds(new Set(restoredChecks.filter((id) => restored.some((item) => item.id === id))));
      setShopAssignments(restoredAssignments);
      setReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      window.localStorage.setItem(CHECKED_KEY, JSON.stringify([...checkedIds]));
      window.localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify({
        signature: listSignature(items), assignments: shopAssignments,
      }));
    } catch {
      // Checklist remains usable when browser storage is blocked.
    }
  }, [items, checkedIds, shopAssignments, ready]);

  const totalUnits = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  function invalidateComparison() {
    setReviewItems(null);
    setOptimizerItems(null);
    setMatchAttention(null);
    setScreen("list");
    setShopAssignments(null);
    setCurrentPlan(null);
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openShop(plan: BasketPlan | null) {
    const assignments: Record<string, ShopAssignment> = {};
    for (const store of plan?.stores ?? []) {
      for (const line of store.lines) {
        assignments[line.itemId] = { retailer: store.retailer, productName: line.productName };
      }
    }
    setShopAssignments(assignments);
    setScreen("shop");
  }

  function addBulkItems() {
    const lines = bulkInput
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setNotice("Add at least one item first.");
      return;
    }

    setItems((current) => [...current, ...lines.map(makeItem)]);
    invalidateComparison();
    setBulkInput("");
    setNotice(`${lines.length} item${lines.length === 1 ? "" : "s"} added.`);
  }

  function addSingleItem() {
    const value = singleInput.trim();
    if (!value) return;
    setItems((current) => [...current, makeItem(value)]);
    invalidateComparison();
    setSingleInput("");
    setNotice("Item added.");
  }

  function changeQuantity(id: string, delta: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
    invalidateComparison();
    setCheckedIds((current) => new Set([...current].filter((checkedId) => checkedId !== id)));
  }

  function startEdit(item: ShoppingItem) {
    setEditingId(item.id);
    setEditingText(item.text);
  }

  function saveEdit(id: string) {
    const value = editingText.trim();
    if (!value) return;
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, text: value } : item)),
    );
    invalidateComparison();
    setCheckedIds((current) => new Set([...current].filter((checkedId) => checkedId !== id)));
    setEditingId(null);
    setEditingText("");
    setNotice("Item updated.");
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    invalidateComparison();
    setCheckedIds((current) => new Set([...current].filter((checkedId) => checkedId !== id)));
    if (editingId === id) setEditingId(null);
    setNotice("Item removed.");
  }

  function clearAll() {
    if (!items.length) return;
    if (!window.confirm("Clear the whole shopping list?")) return;
    setItems([]);
    setCheckedIds(new Set());
    invalidateComparison();
    setNotice("Shopping list cleared.");
  }

  function handleFindCheapest() {
    if (!items.length) {
      setNotice("Add at least one item first.");
      return;
    }
    setScreen("list");
    setOptimizerItems(null);
    setMatchAttention(null);
    setReviewItems(items.map((item) => ({ ...item })));
    setNotice("Matching products automatically. Smart Basket will only ask if something needs your input.");
  }

  function handlePrimaryAction() {
    if (!reviewItems) {
      handleFindCheapest();
      return;
    }

    if (optimizerItems) {
      setScreen("compare");
      return;
    }

    if (matchAttention && matchAttention > 0) {
      matchReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const primaryActionDisabled = Boolean(reviewItems)
    && !optimizerItems
    && !(matchAttention && matchAttention > 0);

  const primaryActionLabel = !reviewItems
    ? "Find Cheapest"
    : optimizerItems
      ? "Compare basket"
      : matchAttention === null
        ? "Matching products…"
        : matchAttention > 0
          ? `Review ${matchAttention} remaining item${matchAttention === 1 ? "" : "s"}`
          : "Preparing comparison…";

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-icon" aria-hidden="true">SB</div>
          <div>
            <div className="brand-title">Smart Basket</div>
            <div className="brand-sub">Save money without the hassle</div>
          </div>
        </div>
        <div className="header-actions" aria-label="Quick actions">
          <button className="header-action" type="button" disabled aria-label="Shopping history">◷</button>
          <button className="header-action" type="button" disabled aria-label="My Stores">⌁</button>
        </div>
      </header>

      {screen === "compare" && optimizerItems ? (
        <CompareResults items={optimizerItems} onBack={() => setScreen("list")} onShop={openShop} onPlanChange={setCurrentPlan} />
      ) : screen === "shop" ? (
        <ShopChecklist
          items={items}
          checkedIds={checkedIds}
          assignments={shopAssignments}
          onToggle={toggleChecked}
          onReset={() => setCheckedIds(new Set())}
          onBack={() => setScreen("list")}
        />
      ) : (
      <section className="screen active" aria-label="Shopping list">
        <h1>Your shopping list</h1>
        <p className="sub">Paste or type your shopping list, one item per line, or update a shelf price with a photo.</p>

        <section className="card stack" aria-label="Add shopping items">
          <div className="stack">
            <textarea
              className="textarea"
              value={bulkInput}
              onChange={(event) => setBulkInput(event.target.value)}
              placeholder={"Carrots\nLemons\nMayonnaise\nBaby wipes"}
              rows={4}
            />
            <button className="secondary full" onClick={addBulkItems} type="button">
              Add items
            </button>
          </div>

          <button
            className="paste-btn"
            type="button"
            onClick={() => setSingleMode((value) => !value)}
            aria-expanded={singleMode}
          >
            {singleMode ? "Hide single item" : "+ Add single item"}
          </button>

          {singleMode && (
            <div className="add-row">
              <input
                className="text-input"
                value={singleInput}
                onChange={(event) => setSingleInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addSingleItem();
                }}
                placeholder="Add one item…"
                aria-label="Add one item"
              />
              <button className="add-btn" type="button" onClick={addSingleItem} aria-label="Add item">
                +
              </button>
            </div>
          )}
        </section>

        <div className="row space list-heading">
          <div className="item-count">
            {items.length} item{items.length === 1 ? "" : "s"}
            {items.length > 0 && <span className="unit-count"> · {totalUnits} unit{totalUnits === 1 ? "" : "s"}</span>}
          </div>
          {items.length > 0 && (
            <button className="danger-ghost" type="button" onClick={clearAll}>Clear</button>
          )}
        </div>

        <section className="card list-card" aria-live="polite">
          {!ready ? (
            <div className="list-empty">Loading your list…</div>
          ) : items.length === 0 ? (
            <div className="list-empty">Your list is empty.</div>
          ) : (
            items.map((item) => (
              <article className="list-item" key={item.id}>
                <div className="item-icon" aria-hidden="true">🛒</div>
                <div className="item-copy">
                  {editingId === item.id ? (
                    <div className="edit-wrap">
                      <input
                        className="edit-input"
                        value={editingText}
                        autoFocus
                        onChange={(event) => setEditingText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveEdit(item.id);
                          if (event.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button className="mini-action" type="button" onClick={() => saveEdit(item.id)}>Save</button>
                    </div>
                  ) : (
                    <button className="item-name" type="button" onClick={() => startEdit(item)}>
                      {item.text}
                    </button>
                  )}

                  <div className="item-meta">Quantity / size optional</div>
                  <div className="qty-control" aria-label={`Quantity for ${item.text}`}>
                    <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label="Decrease quantity">−</button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label="Increase quantity">+</button>
                  </div>
                </div>
                <div className="row-actions">
                  <button className="edit-link" type="button" onClick={() => startEdit(item)}>Edit</button>
                  <button className="remove" type="button" onClick={() => removeItem(item.id)} aria-label={`Delete ${item.text}`}>×</button>
                </div>
              </article>
            ))
          )}
        </section>

        {reviewItems && (
          <div className="match-review-anchor" ref={matchReviewRef}>
            <MatchReview
              items={reviewItems}
              onReadyChange={setOptimizerItems}
              onAttentionChange={setMatchAttention}
            />
          </div>
        )}

        <ReceiptLearning
          items={items}
          onLearned={(count) => {
            setOptimizerItems(null);
            setMatchAttention(null);
            setReviewItems(items.map((item) => ({ ...item })));
            setNotice(`${count} receipt match${count === 1 ? "" : "es"} saved. Rechecking your products automatically…`);
            window.requestAnimationFrame(() => {
              matchReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />

        <div className="action-spacer" />
        <button
          className="primary"
          type="button"
          disabled={primaryActionDisabled}
          onClick={handlePrimaryAction}
        >
          {primaryActionLabel}
        </button>
        {notice && <p className="notice">{notice}</p>}
      </section>
      )}

      <nav className="bottom-nav" aria-label="Smart Basket navigation">
        <button className={screen === "list" ? "active" : ""} type="button" onClick={() => setScreen("list")}><span className="nav-ico">☷</span>List</button>
        <button className={screen === "compare" ? "active" : ""} type="button" disabled={!optimizerItems} onClick={() => setScreen("compare")}><span className="nav-ico">⌁</span>Compare</button>
        <button className={screen === "shop" ? "active" : ""} type="button" onClick={() => {
          if (screen === "compare") openShop(currentPlan);
          else setScreen("shop");
        }}><span className="nav-ico">✓</span>Shop</button>
        <button type="button" disabled><span className="nav-ico">⌂</span>Stores</button>
      </nav>
    </main>
  );
}
