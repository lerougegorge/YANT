import { z } from 'zod';
import type { NovaGroup } from '../db/types';

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,brands,quantity,serving_size,serving_quantity,nutriments,nova_group,categories_tags,code';

const offResponseSchema = z.object({
  status: z.number(),
  product: z
    .object({
      code: z.string().optional(),
      product_name: z.string().optional(),
      brands: z.string().optional(),
      serving_size: z.string().optional(),
      serving_quantity: z.union([z.number(), z.string()]).optional(),
      nova_group: z.union([z.number(), z.string()]).optional(),
      categories_tags: z.array(z.string()).optional(),
      nutriments: z.record(z.union([z.number(), z.string()])).optional()
    })
    .optional()
});

export interface OffFoodItemDraft {
  description: string;
  servingDescription: string | null;
  servingGrams: number | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  fatPer100g: number | null;
  carbohydratesPer100g: number | null;
  fibrePer100g: number | null;
  caloriesPerServing: number | null;
  proteinPerServing: number | null;
  fatPerServing: number | null;
  carbohydratesPerServing: number | null;
  fibrePerServing: number | null;
  novaGroup: NovaGroup;
  fruitVeg: boolean;
  barcode: string;
  productUrl: string;
}

const FRUIT_VEG_TAG_HINTS = ['fruits', 'vegetables', 'vegetable', 'fruit', 'legumes', 'salads'];

function num(v: number | string | undefined): number | null {
  if (v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Looks up a barcode against Open Food Facts. Returns null on a miss (status 0), which is
 * expected and should fall through to the next lookup rung silently, not as an error.
 */
export async function lookupOpenFoodFacts(barcode: string): Promise<OffFoodItemDraft | null> {
  const res = await fetch(`${OFF_BASE}/${encodeURIComponent(barcode)}?fields=${FIELDS}`, {
    headers: {
      // Browsers forbid scripts from overriding User-Agent; this is sent on a best-effort basis
      // for environments that permit it, and silently dropped elsewhere.
      'User-Agent': 'NutritionTracker/1.0 (personal use)'
    }
  });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);

  const json = await res.json();
  const parsed = offResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.status !== 1 || !parsed.data.product) return null;

  const p = parsed.data.product;
  const n = p.nutriments ?? {};

  let caloriesPer100g = num(n['energy-kcal_100g']);
  if (caloriesPer100g === null) {
    const kj = num(n['energy_100g']);
    caloriesPer100g = kj !== null ? kj / 4.184 : null;
  }
  if (caloriesPer100g === null) return null; // not usable per spec — treat as a miss

  const proteinPer100g = num(n['proteins_100g']);
  const fatPer100g = num(n['fat_100g']);
  const carbohydratesPer100g = num(n['carbohydrates_100g']);
  const fibrePer100g = num(n['fiber_100g']);

  const servingGrams = num(p.serving_quantity);

  let caloriesPerServing = num(n['energy-kcal_serving']);
  if (caloriesPerServing === null) {
    const kjServing = num(n['energy_serving']);
    caloriesPerServing = kjServing !== null ? kjServing / 4.184 : deriveServing(caloriesPer100g, servingGrams);
  }
  const proteinPerServing = num(n['proteins_serving']) ?? deriveServing(proteinPer100g, servingGrams);
  const fatPerServing = num(n['fat_serving']) ?? deriveServing(fatPer100g, servingGrams);
  const carbohydratesPerServing = num(n['carbohydrates_serving']) ?? deriveServing(carbohydratesPer100g, servingGrams);
  const fibrePerServing = num(n['fiber_serving']) ?? deriveServing(fibrePer100g, servingGrams);

  const nova = num(p.nova_group);
  const novaGroup: NovaGroup = nova === 1 || nova === 2 || nova === 3 || nova === 4 ? (nova as NovaGroup) : null;

  const fruitVeg = (p.categories_tags ?? []).some((tag) => FRUIT_VEG_TAG_HINTS.some((hint) => tag.includes(hint)));

  const description = [p.brands, p.product_name].filter(Boolean).join(' — ') || p.product_name || 'Unknown product';

  return {
    description,
    servingDescription: p.serving_size ?? null,
    servingGrams,
    caloriesPer100g,
    proteinPer100g,
    fatPer100g,
    carbohydratesPer100g,
    fibrePer100g,
    caloriesPerServing,
    proteinPerServing,
    fatPerServing,
    carbohydratesPerServing,
    fibrePerServing,
    novaGroup,
    fruitVeg,
    barcode: p.code ?? barcode,
    productUrl: `https://world.openfoodfacts.org/product/${p.code ?? barcode}`
  };
}

function deriveServing(per100g: number | null, servingGrams: number | null): number | null {
  if (per100g === null || servingGrams === null) return null;
  return (per100g * servingGrams) / 100;
}
