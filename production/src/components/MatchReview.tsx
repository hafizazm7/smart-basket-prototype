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
  confirmedByUser: boolean;
  keptAsTyped: boolean;
};

const OVERRIDE_KEY = "smart-basket.match-overrides.v1";
const KEEP_TYPED_SENTINEL = "__keep_as_typed__";
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
  try {
    const overrides = readOverrides();
    overrides[queryKey(query)] = selectedKey;
    window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    // Keep matching usable when browser storage is blocked.
  }
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

function selectedOption(state: MatchState | undefined): MatchOption | null {
  if (!state?.selectedKey) return null;
  return allOptions(state.response).find((option) => optionKey(option) === state.selectedKey) ?? null;
}

function needsAttention(state: MatchState | undefined): boolean {
  if (!state || state.loading) return false;
  if (state.error) return !state.keptAsTyped;

  const selected = selectedOption(state);
  if (!selected) return !state.keptAsTyped;
  if (!selected.accepted && !state.confirmedByUser) return true;
  return selected.requiresConfirmation && !state.confirmedByUser;
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
        const keptAsTyped = override === KEEP_TYPED_SENTINEL;
        const choices = allOptions(response);
        const overrideChoice = keptAsTyped
          ? null
          : choices.find((option) => optionKey(option) === override) ?? null;
        const selectedKey = keptAsTyped
          ? null
          : overrideChoice
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
          confirmedByUser: Boolean(overrideChoice),
          keptAsTyped,
        }] as const;
      } catch (error) {
        const keptAsTyped = readOverrides()[queryKey(item.text)] === KEEP_TYPED_SENTINEL;
        entries[index] = [item.id, {
          loading: false,
          error: error instanceof Error ? error.message : "Product matching failed.",
          response: null,
          alternativesAllowed: false,
          selectedKey: null,
          showOther: false,
          confirmedByUser: false,
          keptAsTyped,
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
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setShowAll(false);

    setStates(Object.fromEntries(items.map((item) => [item.id, {
      loading: true,
      error: null,
      response: null,
      alternativesAllowed: false,
      selectedKey: null,
      showOther: false,
      confirmedByUser: false,
      keptAsTyped: false,
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
    const matched = values.filter((state) => Boolean(selectedOption(state))).length;
    const kept = values.filter((state) => state.keptAsTyped).length;
    const attention = values.filter((state) => needsAttention(state)).length;
    return { loading, matched, kept, attention };
  }, [states]);

  async function refreshMatch(item: ReviewItem, allowed: boolean) {
    setStates((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] ?? {
          response: null,
          selectedKey: null,
          error: null,
          showOther: false,
          confirmedByUser: false,
          keptAsTyped: false,
        }),
        loading: true,
        error: null,
        alternativesAllowed: allowed,
        confirmedByUser: false,
        keptAsTyped: false,
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
          confirmedByUser: false,
          keptAsTyped: false,
        },
      }));
    } catch (error) {
      setStates((current) => ({
        ...current,
        [item.id]: {
          ...(current[item.id] ?? {
            response: null,
            selectedKey: null,
            showOther: false,
            confirmedByUser: false,
            keptAsTyped: false,
          }),
          loading: false,
          error: error instanceof Error ? error.message : "Product matching failed.",
          alternativesAllowed: allowed,
          keptAsTyped: false,
        },
      }));
    }
  }

  function selectMatch(item: ReviewItem, key: string) {
    setStates((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        selectedKey: key,
        confirmedByUser: true,
        keptAsTyped: false,
      },
    }));
    saveOverride(item.text, key);
  }

  function confirmSuggested(item: ReviewItem) {
    const state = states[item.id];
    if (!state?.selectedKey) return;
    setStates((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        confirmedByUser: true,
        keptAsTyped: false,
      },
    }));
    saveOverride(item.text, state.selectedKey);
  }

  function keepAsTyped(item: ReviewItem) {
    setStates((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        selectedKey: null,
        confirmedByUser: true,
        keptAsTyped: true,
      },
    }));
    saveOverride(item.text, KEEP_TYPED_SENTINEL);
  }

  function toggleOther(itemId: string) {
    setStates((current) => ({
      ...current,
      [itemId]: { ...current[itemId], showOther: !current[itemId]?.showOther },
    }));
  }

  const visibleItems = showAll
    ? items
    : items.filter((item) => needsAttention(states[item.id]));

  if (summary.loading) {
    return (
      <section className="card stack" aria-label="Product matching">
        <div className="photo-title">Finding the right products…</div>
        <div className="helper">Smart Basket is matching your list automatically. You only need to act if something is unclear.</div>
      </section>
    );
  }

  return (
    <section className="card stack" aria-label="Product matching">
      <div>
        <div className="photo-title">
          {summary.attention > 0 ? "Quick check" : "Products matched"}
        </div>
        <div className="helper">
          {summary.attention > 0
            ? `${summary.matched}/${items.length} items have product matches${summary.kept ? ` · ${summary.kept} kept as typed` : ""} · ${summary.attention} need your input.`
            : summary.kept > 0
              ? `${summary.matched}/${items.length} items have product matches · ${summary.kept} kept as typed. Nothing else to do here.`
              : `${summary.matched}/${items.length} items matched automatically. Nothing else to do here.`}
        </div>
      </div>

      {visibleItems.map((item) => {
        const state = states[item.id];
        const response = state?.response ?? null;
        const recommended = response?.matches ?? [];
        const others = response?.otherCandidates ?? [];
        const choices = allOptions(response);
        const visibleOptions = state?.showOther ? choices : recommended;
        const selected = selectedOption(state);
        const itemNeedsAttention = needsAttention(state);

        return (
          <article className="soft-card stack" key={item.id}>
            <div className="row space">
              <div>
                <strong>{item.text}</strong>
                <div className="helper">Qty {item.quantity}</div>
              </div>
              {selected ? (
                <span className="helper">
                  {itemNeedsAttention ? "Check" : state?.confirmedByUser ? "Confirmed" : "Auto"}
                </span>
              ) : state?.keptAsTyped ? (
                <span className="helper">Kept as typed</span>
              ) : null}
            </div>

            {state?.error ? (
              <>
                <div className="helper">Could not match this item automatically: {state.error}</div>
                <button
                  className="secondary full"
                  type="button"
                  onClick={() => void refreshMatch(item, state.alternativesAllowed)}
                >
                  Try again
                </button>
                <button className="paste-btn" type="button" onClick={() => keepAsTyped(item)}>
                  Keep item as typed
                </button>
              </>
            ) : state?.keptAsTyped ? (
              <div className="helper">This item will stay exactly as you entered it.</div>
            ) : visibleOptions.length === 0 ? (
              <>
                <div className="helper">No reliable match found. You can keep this item and verify it in-store later.</div>
                <button className="secondary full" type="button" onClick={() => keepAsTyped(item)}>
                  Keep item as typed
                </button>
              </>
            ) : (
              <>
                <label className="helper" htmlFor={`match-${item.id}`}>
                  {itemNeedsAttention ? "Which product did you mean?" : "Matched product"}
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
                  </div>
                )}

                {itemNeedsAttention && selected && (
                  <button className="secondary full" type="button" onClick={() => confirmSuggested(item)}>
                    Use this match
                  </button>
                )}
              </>
            )}

            {!state?.error && !state?.keptAsTyped && others.length > 0 && (
              <button className="paste-btn" type="button" onClick={() => toggleOther(item.id)}>
                {state?.showOther ? "Hide possible matches" : "Show other possible matches"}
              </button>
            )}

            {response?.requestedBrand && !state?.keptAsTyped && (
              <label className="helper row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={state?.alternativesAllowed ?? false}
                  onChange={(event) => void refreshMatch(item, event.target.checked)}
                />
                Allow alternatives to {response.requestedBrand}
              </label>
            )}
          </article>
        );
      })}

      <button className="paste-btn" type="button" onClick={() => setShowAll((value) => !value)}>
        {showAll ? "Hide automatic matches" : "Review automatic matches"}
      </button>

      <div className="helper">
        High-confidence matches are accepted automatically. Requested brands stay locked unless you allow alternatives.
      </div>
    </section>
  );
}
