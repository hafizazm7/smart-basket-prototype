import { classifyFreshness } from "./freshness";
import type { CurrentPriceSelection, PriceObservation } from "./types";

export function isReliableObservation(observation: PriceObservation): boolean {
  if (observation.sourceType === "web") return true;
  return observation.confirmed;
}

function observedTime(observation: PriceObservation): number {
  const value = observation.observedAt instanceof Date
    ? observation.observedAt.getTime()
    : new Date(observation.observedAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function selectCurrentPrice(
  observations: PriceObservation[],
  now = new Date(),
): CurrentPriceSelection {
  if (!observations.length) {
    return { observation: null, freshness: "historical", reliable: false };
  }

  const notFuture = observations.filter((observation) => observedTime(observation) <= now.getTime());
  const candidates = notFuture.length ? notFuture : observations;
  const newestFirst = [...candidates].sort((a, b) => observedTime(b) - observedTime(a));

  const reliable = newestFirst.find(isReliableObservation);
  const selected = reliable ?? newestFirst[0];
  const selectedReliable = isReliableObservation(selected);

  return {
    observation: selected,
    freshness: selectedReliable
      ? classifyFreshness(selected.observedAt, selected.sourceType, now)
      : "historical",
    reliable: selectedReliable,
  };
}
