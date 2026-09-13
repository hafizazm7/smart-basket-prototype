import type { FreshnessStatus, PriceSourceType } from "./types";

type FreshnessThreshold = {
  currentHours: number;
  checkHours: number;
};

export const DEFAULT_FRESHNESS_THRESHOLDS: Record<PriceSourceType, FreshnessThreshold> = {
  web: { currentHours: 36, checkHours: 24 * 7 },
  shelf_photo: { currentHours: 72, checkHours: 24 * 14 },
  manual: { currentHours: 72, checkHours: 24 * 14 },
};

export function classifyFreshness(
  observedAt: string | Date,
  sourceType: PriceSourceType,
  now = new Date(),
): FreshnessStatus {
  const observed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return "historical";

  const ageHours = Math.max(0, (now.getTime() - observed.getTime()) / 3_600_000);
  const thresholds = DEFAULT_FRESHNESS_THRESHOLDS[sourceType];

  if (ageHours <= thresholds.currentHours) return "current";
  if (ageHours <= thresholds.checkHours) return "check";
  return "historical";
}

export function freshnessLabel(status: FreshnessStatus): string {
  if (status === "current") return "Current";
  if (status === "check") return "May need checking";
  return "Historical / unknown";
}
