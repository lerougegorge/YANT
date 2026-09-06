// Canonical storage units: kcal, grams, per-100g. Conversions happen only at display time.

const KCAL_PER_KJ = 1 / 4.184;
const GRAMS_PER_OZ = 28.3495;

export function kcalToDisplay(kcal: number | null, unit: 'cal' | 'kJ'): number | null {
  if (kcal === null) return null;
  return unit === 'kJ' ? kcal / KCAL_PER_KJ : kcal;
}

export function kcalFromDisplay(value: number, unit: 'cal' | 'kJ'): number {
  return unit === 'kJ' ? value * KCAL_PER_KJ : value;
}

export function gramsToDisplay(grams: number | null, unit: 'metric' | 'oz'): number | null {
  if (grams === null) return null;
  return unit === 'oz' ? grams / GRAMS_PER_OZ : grams;
}

export function gramsFromDisplay(value: number, unit: 'metric' | 'oz'): number {
  return unit === 'oz' ? value * GRAMS_PER_OZ : value;
}

export function roundCalories(kcal: number | null): number | null {
  if (kcal === null) return null;
  return Math.round(kcal);
}

export function roundNutrient(grams: number | null): number | null {
  if (grams === null) return null;
  return Math.round(grams * 10) / 10;
}

export function formatCalories(kcal: number | null, unit: 'cal' | 'kJ'): string {
  const v = kcalToDisplay(kcal, unit);
  if (v === null) return '—';
  return `${Math.round(v)} ${unit === 'kJ' ? 'kJ' : 'kcal'}`;
}

export function formatNutrient(grams: number | null): string {
  if (grams === null) return '—';
  return `${(Math.round(grams * 10) / 10).toFixed(1)} g`;
}

/** Scales per-serving figures by an amount expressed in servings or grams. */
export function scaleFromServing(
  perServingValue: number | null,
  servingGrams: number | null,
  amount: number,
  amountUnit: 'servings' | 'grams'
): number | null {
  if (perServingValue === null) return null;
  if (amountUnit === 'servings') return perServingValue * amount;
  if (servingGrams === null || servingGrams === 0) return null;
  return (perServingValue / servingGrams) * amount;
}

export function scaleFromPer100g(per100gValue: number | null, grams: number): number | null {
  if (per100gValue === null) return null;
  return (per100gValue * grams) / 100;
}
