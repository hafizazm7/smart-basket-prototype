"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewItem = {
  id: string;
  text: string;
  quantity: number;
};

type MatchOption = {
  retailer: string;
  externalId: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  price: number;
  sizeValue: number | null;
  sizeUnit: string | null;
  unitPrice: number | null;
  unitPriceUnit: string | null;
  promotion: string | null;
  confidence: number;
  requiresConfirmation: boolean;
  reasons: string[];
};

type MatchResponse = {
  ok: boolean;
  query: string;
  requestedBrand: string | null;
  alternativesAllowed: boolean;
  acceptedMatches: number;
  matches: MatchOption[];
};

type MatchState = {
  loading: boolean;
  error: string | null;
  response: MatchResponse | null;
  alternativesAllowed: boolean;
  selectedKey: string | null;
};

const OVERRIDE_KEY = "smart-basket.match-overrides.v1";

function optionKey(option: MatchOption): string {
  return `${option.retailer}:${option.externalId ?? option.name}`;
}

function queryKey(query: string): string {
  return query.trim().toLowerCase();
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
}

function readOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveOverride(query: string, selectedKey: string) {
  const overrides = readOverrides();
  overrides[queryKey(query)] = selectedKey;
  window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
}

async function loadMatch(item: ReviewItem, alternativesAllowed: boolean): Promise<MatchResponse> {
  const params = new URLSearchParams({ q: item.text });
  if (alternativesAllowed) params.set("alternatives", "true");

  const response = await fetch(`/api/product-matching/match?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Matching returned HTTP ${response.status}.`);
  return response.json() as Promise<MatchResponse>;
}

export default function MatchReview({ items }: { items: ReviewItem[] }) {
  const [states, setStates] = useState<Record<string, MatchState>>({});

  useEffect(() => {
    let cancelled = false;

    setStates(Object.fromEntries(items.map((item) => [item.id, {
      loading: true,
      error: null,
      response: null,
      alternativesAllowed: false,
      selectedKey: null,
    }])));

    Promise.all(items.map(async (item) => {
      try {
        const response = await loadMatch(item, false);
        const override = readOverrides()[queryKey(item.text)] ?? null;
        const selectedKey = response.matches.some((option) => optionKey(option) === override)
          ? override
          : response.matches[0]
            ? optionKey(response.matches[0])
            : null;
        return [item.id, {
          loading: false,
          error: null,
          response,
          alternativesAllowed: false,
          selectedKey,
        }] as const;
      } catch (error) {
        return [item.id, {
          loading: false,
          error: error instanceof Error ? error.message : "Product matching failed.",
          response: null,
          alternativesAllowed: false,
          selectedKey: null,
        }] as const;
      }
    })).then((entries) => {
      if (!cancelled) setStates(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const summary = useMemo(() => {
    const values = Object.values(states);
    const loading = values.some((state) => state.loading);
    const ready = values.filter((state) => state.response?.matches.length).length;
    const needsCheck = values.filter((state) => {
      const selected = state.response?.matches.find((option) => optionKey(option) === state.selectedKey);
      return Boolean(selected?.requiresConfirmation);
    }).length;
    return { loading, ready, needsCheck };
  }, [states]);

  async function toggleAlternatives(item: ReviewItem, allowed: boolean) {
    setStates((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] ?? { response: null, selectedKey: null, error: null }),
        loading: true,
        error: null,
        alternativesAllowed: allowed,
      },
    }));

    try {
      const response = await loadMatch(item, allowed);
      const selectedKey = response.matches[0] ? optionKey(response.matches[0]) : null;
      setStates((current) => ({
        ...current,
        [item.id]: {
          loading: false,
          error: null,
          response,
          alternativesAllowed: allowed,
          selectedKey,
        },
      }));
    } catch (error) {
      setStates((current) => ({
        ...current,
        [item.id]: {
          ...(current[item.id] ?? { response: null, selectedKey: null }),
          loading: false,
          error: error instanceof Error ? error.message : "Product matching failed.",
          alternativesAllowed: allowed,
        },
      }));
    }
  }

  function selectMatch(item: ReviewItem, key: string) {
    setStates((current) => ({
      ...current,
      [item.id]: { ...current[item.id], selectedKey: key },
    }));
    saveOverride(item.text, key);
  }

  return (
    <section className="card stack" aria-label="Product match review">
      <div>
        <div className="photo-title">Review product matches</div>
        <div className="helper">
          {summary.loading
            ? "Checking the products sold by your stores…"
            : `${summary.ready}/${items.length} items matched${summary.needsCheck ? ` · ${summary.needsCheck} need a quick check` : ""}.`}
        </div>
      </div>

      {items.map((item) => {
        const state = states[item.id];
        const response = state?.response;
        const options = response?.matches ?? [];
        const selected = options.find((option) => optionKey(option) === state?.selectedKey) ?? null;

        return (
          <article className="soft-card stack" key={item.id}>
            <div className="row space">
              <div>
                <strong>{item.text}</strong>
                <div className="helper">Qty {item.quantity}</div>
              </div>
              {selected && (
                <span className="helper">
                  {selected.requiresConfirmation ? "Check" : "Good match"}
                </span>
              )}
            </div>

            {state?.loading ? (
              <div className="helper">Finding matches…</div>
            ) : state?.error ? (
              <div className="helper">Could not match this item yet: {state.error}</div>
            ) : options.length === 0 ? (
              <div className="helper">No reliable match found. You can keep the item and verify it in-store later.</div>
            ) : (
              <>
                <label className="helper" htmlFor={`match-${item.id}`}>Matched product</label>
                <select
                  id={`match-${item.id}`}
                  className="text-input"
                  value={state.selectedKey ?? ""}
                  onChange={(event) => selectMatch(item, event.target.value)}
                >
                  {options.slice(0, 10).map((option) => (
                    <option key={optionKey(option)} value={optionKey(option)}>
                      {option.retailer.toUpperCase()} · {option.name} · {formatMoney(option.price)}
                    </option>
                  ))}
                </select>

                {selected && (
                  <div className="helper">
                    {selected.brand ? `${selected.brand} · ` : ""}
                    {selected.sizeValue && selected.sizeUnit ? `${selected.sizeValue} ${selected.sizeUnit} · ` : ""}
                    {Math.round(selected.confidence * 100)}% match
                    {selected.unitPrice && selected.unitPriceUnit ? ` · ${formatMoney(selected.unitPrice)}/${selected.unitPriceUnit}` : ""}
                  </div>
                )}

                {response?.requestedBrand && (
                  <label className="helper row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={state.alternativesAllowed}
                      onChange={(event) => void toggleAlternatives(item, event.target.checked)}
                    />
                    Allow alternatives to {response.requestedBrand}
                  </label>
                )}
              </>
            )}
          </article>
        );
      })}

      <div className="helper">Your selection is saved on this device. Smart Basket will never silently replace a requested brand.</div>
    </section>
  );
}
