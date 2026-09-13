"use client";

import { useEffect, useMemo, useState } from "react";

type ShoppingItem = {
  id: string;
  text: string;
  quantity: number;
  createdAt: number;
};

const STORAGE_KEY = "smart-basket.shopping-list.v1";

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

    const frame = window.requestAnimationFrame(() => {
      setItems(restored);
      setReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const totalUnits = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  function addBulkItems() {
    const lines = bulkInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setNotice("Add at least one item first.");
      return;
    }

    setItems((current) => [...current, ...lines.map(makeItem)]);
    setBulkInput("");
    setNotice(`${lines.length} item${lines.length === 1 ? "" : "s"} added.`);
  }

  function addSingleItem() {
    const value = singleInput.trim();
    if (!value) return;
    setItems((current) => [...current, makeItem(value)]);
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
    setEditingId(null);
    setEditingText("");
    setNotice("Item updated.");
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (editingId === id) setEditingId(null);
    setNotice("Item removed.");
  }

  function clearAll() {
    if (!items.length) return;
    if (!window.confirm("Clear the whole shopping list?")) return;
    setItems([]);
    setNotice("Shopping list cleared.");
  }

  function handleFindCheapest() {
    if (!items.length) return;
    setNotice("Your list is ready. Store price comparison will be connected in Step 7.");
  }

  function handlePhotoUpdate() {
    setNotice("Shelf-photo price updates will be connected after the list build.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand">Smart Basket</p>
          <p className="topbar-note">LIST → COMPARE → SHOP</p>
        </div>
        <span className="step-chip">Step 6</span>
      </header>

      <section className="list-screen" aria-label="Shopping list">
        <div className="intro">
          <h1>Your shopping list</h1>
          <p>Paste or type your shopping list, one item per line.</p>
        </div>

        <section className="panel composer" aria-label="Add shopping items">
          <textarea
            className="bulk-input"
            value={bulkInput}
            onChange={(event) => setBulkInput(event.target.value)}
            placeholder={"Carrots\nLemons\nMayonnaise\nBaby wipes"}
            rows={5}
          />
          <button className="button secondary full" onClick={addBulkItems} type="button">
            Add items
          </button>

          <button
            className="text-button"
            type="button"
            onClick={() => setSingleMode((value) => !value)}
            aria-expanded={singleMode}
          >
            {singleMode ? "− Hide single item" : "+ Add single item"}
          </button>

          {singleMode && (
            <div className="single-row">
              <input
                className="single-input"
                value={singleInput}
                onChange={(event) => setSingleInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addSingleItem();
                }}
                placeholder="e.g. Dreft 500 ml"
                aria-label="Add one item"
              />
              <button className="round-add" type="button" onClick={addSingleItem} aria-label="Add item">
                +
              </button>
            </div>
          )}
        </section>

        <section className="list-section" aria-live="polite">
          <div className="section-heading">
            <div>
              <h2>Items</h2>
              <p>{items.length ? `${items.length} item${items.length === 1 ? "" : "s"} · ${totalUnits} unit${totalUnits === 1 ? "" : "s"}` : "Your list is empty"}</p>
            </div>
            {items.length > 0 && (
              <button className="clear-button" type="button" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>

          {!ready ? (
            <div className="empty-card">Loading your list…</div>
          ) : items.length === 0 ? (
            <div className="empty-card">
              <span className="empty-icon" aria-hidden="true">🧺</span>
              <strong>Start with what you need</strong>
              <span>Paste several items above and add them in one tap.</span>
            </div>
          ) : (
            <div className="items-card">
              {items.map((item) => (
                <article className="shopping-item" key={item.id}>
                  <div className="item-main">
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
                        <span>Edit</span>
                      </button>
                    )}
                  </div>

                  <div className="item-controls">
                    <div className="qty-control" aria-label={`Quantity for ${item.text}`}>
                      <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label="Decrease quantity">−</button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label="Increase quantity">+</button>
                    </div>
                    <button className="delete-button" type="button" onClick={() => removeItem(item.id)} aria-label={`Delete ${item.text}`}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="actions-block">
          <button className="button photo-button full" type="button" onClick={handlePhotoUpdate}>
            📷 Update shelf price
          </button>
          <button
            className="button primary full"
            type="button"
            disabled={!items.length}
            onClick={handleFindCheapest}
          >
            Find Cheapest
          </button>
          {notice && <p className="notice">{notice}</p>}
        </section>
      </section>

      <nav className="bottom-nav" aria-label="Smart Basket navigation">
        <button className="nav-item active" type="button"><span>☷</span>List</button>
        <button className="nav-item" type="button" disabled><span>≍</span>Compare</button>
        <button className="nav-item" type="button" disabled><span>✓</span>Shop</button>
        <button className="nav-item" type="button" disabled><span>⌂</span>Stores</button>
      </nav>
    </main>
  );
}
