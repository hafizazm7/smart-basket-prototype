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
  accepted: boolean;
  requiresConfirmation: boolean;
  reasons: string[];
};

type MatchResponse = {
  ok: boolean;
  query: string;
  searchQuery?: string;
  requestedBrand: string | null;
  alternativesAllowed: boolean;
  acceptedMatches: number;
  matches: MatchOption[];
  otherCandidates?: MatchOption[];
};

type MatchState = {
  loading: boolean;
  error: string | null;
  response: MatchResponse | null;
  alternativesAllowed: boolean;
  selectedKey: string | null;
  showOther: boolean;
};

const OVERRIDE_KEY = "smart-basket.match-overrides.v1";
const MATCH_CONCURRENCY = 3;

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

function allOptions(response: MatchResponse | null): MatchOption[] {
  if (!response) return [];
  const seen = new Set<string>();
  return [...response.matches, ...(response.otherCandidates ?? [])].filter((option) => {
    const key = optionKey(option);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

async function loadInitialMatches(items: ReviewItem[]): Promise<Array<readonly [string, MatchState]>> {
  const entries: Array<readonly [string, MatchState] | undefined> = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      const item = items[index];
      try {
        const response = await loadMatch(item, false);
        const override = readOverrides()[queryKey(item.text)] ?? null;
        const choices = allOptions(response);
        const overrideChoice = choices.find((option) => optionKey(option) === override) ?? null;
        const selectedKey = overrideChoice
          ? optionKey(overrideChoice)
          : response.matches[0]
            ? optionKey(response.matches[0])
            : null;

        entries[index] = [item.id, {
          loading: false,
          error: null,
          response,
          alternativesAllowed: false,
          selectedKey,
          showOther: Boolean(overrideChoice && !overrideChoice.accepted),
        }] as const;
      } catch (error) {
        entries[index] = [item.id, {
          loading: false,
          error: error instanceof Error ? error.message : "Product matching failed.",
          response: null,
          alternativesAllowed: false,
          selectedKey: null,
          showOther: false,
        }] as const;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MATCH_CONCURRENCY, items.length) }, () => worker()),
  );

  return entries.filter((entry): entry is readonly [string, MatchState] => Boolean(entry));
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
      showOther: false,
    }])));

    void loadInitialMatches(items).then((entries) => {
      if (!cancelled) setStates(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const summary = useMemo(() => {
    const values = Object.values(states);
    const loading = values.some((state) => state.loading);
    const ready = values.filter((state) => Boolean(state.selectedKey)).length;
    const needsCheck = values.filter((state) => {
      const selected = allOptions(state.response).find((option) => optionKey(option) === state.selectedKey);
      return Boolean(selected?.requiresConfirmation);
    }).length;
    return { loading, ready, needsCheck };
  }, [states]);

  async function toggleAlternatives(item: ReviewItem, allowed: boolean) {
    setStates((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] ?? {
          response: null,
          selectedKey: null,
          error: null,
          showOther: false,
        }),
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
          showOther: false,
        },
      }));
    } catch (error) {
      setStates((current) => ({
        ...current,
        [item.id]: {
          ...(current[item.id] ?? { response: null, selectedKey: null, showOther: false }),
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

  function toggleOther(itemId: string) {
    setStates((current) => ({
      ...current,
      [itemId]: { ...current[itemId], showOther: !current[itemId]?.showOther },
    }));
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
        const response = state?.response ?? null;
        const recommended = response?.matches ?? [];
        const others = response?.otherCandidates ?? [];
        const choices = allOptions(response);
        const visibleOptions = state?.showOther ? choices : recommended;
        const selected = choices.find((option) => optionKey(option) === state?.selectedKey) ?? null;

        return (
          <article className="soft-card stack" key={item.id}>
            <div className="row space">
              <div>
                <strong>{item.text}</strong>
                <div className="helper">Qty {item.quantity}</div>
              </div>
              {selected && (
                <span className="helper">
                  {!selected.accepted ? "Manual choice" : selected.requiresConfirmation ? "Check" : "Good match"}
                </span>
              )}
            </div>

            {state?.loading ? (
              <div className="helper">Finding matches…</div>
            ) : state?.error ? (
              <div className="helper">Could not match this item yet: {state.error}</div>
            ) : visibleOptions.length === 0 ? (
              <div className="helper">No reliable match found. You can keep the item and verify it in-store later.</div>
            ) : (
              <>
                <label className="helper" htmlFor={`match-${item.id}`}>
                  {state?.showOther ? "Choose product" : "Matched product"}
                </label>
                <select
                  id={`match-${item.id}`}
                  className="text-input"
                  value={state.selectedKey ?? ""}
                  onChange={(event) => selectMatch(item, event.target.value)}
                >
                  {visibleOptions.slice(0, 20).map((option) => (
                    <option key={optionKey(option)} value={optionKey(option)}>
                      {option.accepted ? "" : "Check · "}{option.retailer.toUpperCase()} · {option.name} · {formatMoney(option.price)}
                    </option>
                  ))}
                </select>

                {selected && (
                  <div className="helper">
                    {selected.brand ? `${selected.brand} · ` : ""}
                    {selected.sizeValue && selected.sizeUnit ? `${selected.sizeValue} ${selected.sizeUnit} · ` : ""}
                    {Math.round(selected.confidence * 100)}% match
                    {selected.unitPrice && selected.unitPriceUnit ? ` · ${formatMoney(selected.unitPrice)}/${selected.unitPriceUnit}` : ""}
                    {!selected.accepted ? " · verify this choice" : ""}
                  </div>
                )}
              </>
            )}

            {!state?.loading && !state?.error && others.length > 0 && (
              <button className="paste-btn" type="button" onClick={() => toggleOther(item.id)}>
                {state?.showOther ? "Hide uncertain matches" : "Can't see the right product? Show possible matches"}
              </button>
            )}

            {response?.requestedBrand && (
              <label className="helper row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={state?.alternativesAllowed ?? false}
                  onChange={(event) => void toggleAlternatives(item, event.target.checked)}
                />
                Allow alternatives to {response.requestedBrand}
              </label>
            )}
          </article>
        );
      })}

      <div className="helper">Your selection is saved on this device. Smart Basket will never silently replace a requested brand.</div>
    </section>
  );
}
