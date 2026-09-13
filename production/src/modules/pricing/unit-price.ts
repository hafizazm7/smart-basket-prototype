import type { DisplayUnit, NormalizedPackage, NormalizedUnit } from "./types";

const WEIGHT_UNITS: Record<string, number> = {
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  kg: 1,
  kilogram: 1,
  kilograms: 1,
};

const VOLUME_UNITS: Record<string, number> = {
  ml: 0.001,
  milliliter: 0.001,
  milliliters: 0.001,
  cl: 0.01,
  l: 1,
  liter: 1,
  liters: 1,
};

const ITEM_UNITS = new Set(["item", "items", "stuk", "stuks", "piece", "pieces", "pcs"]);
const WIPE_UNITS = new Set(["wipe", "wipes", "doekje", "doekjes"]);

function cleanUnit(unit: string): string {
  return unit.trim().toLowerCase().replaceAll(".", "");
}

export function normalizePackage(sizeValue: number, sizeUnit: string): NormalizedPackage | null {
  if (!Number.isFinite(sizeValue) || sizeValue <= 0) return null;

  const unit = cleanUnit(sizeUnit);

  if (unit in WEIGHT_UNITS) {
    return { quantity: sizeValue * WEIGHT_UNITS[unit], unit: "kg" };
  }

  if (unit in VOLUME_UNITS) {
    return { quantity: sizeValue * VOLUME_UNITS[unit], unit: "l" };
  }

  if (ITEM_UNITS.has(unit)) {
    return { quantity: sizeValue, unit: "item" };
  }

  if (WIPE_UNITS.has(unit)) {
    return { quantity: sizeValue, unit: "wipe" };
  }

  return null;
}

export function calculateBaseUnitPrice(
  price: number,
  sizeValue: number | null | undefined,
  sizeUnit: string | null | undefined,
): { unitPrice: number; unit: NormalizedUnit } | null {
  if (!Number.isFinite(price) || price <= 0 || !sizeValue || !sizeUnit) return null;

  const normalized = normalizePackage(sizeValue, sizeUnit);
  if (!normalized) return null;

  return {
    unitPrice: price / normalized.quantity,
    unit: normalized.unit,
  };
}

export function convertUnitPrice(
  baseUnitPrice: number,
  baseUnit: NormalizedUnit,
  displayUnit: DisplayUnit,
): number | null {
  if (!Number.isFinite(baseUnitPrice) || baseUnitPrice <= 0) return null;

  if (displayUnit === baseUnit) return baseUnitPrice;
  if (baseUnit === "kg" && displayUnit === "100g") return baseUnitPrice / 10;
  if (baseUnit === "l" && displayUnit === "100ml") return baseUnitPrice / 10;

  return null;
}
