import type { NovaGroup } from '../db/types';
import { NUTRIENT_FIELDS, type AiFoodResponse, type NutrientField } from './aiSchema';
import type { CallUsage } from './openrouter';

export interface ContributingResponse {
  modelId: string;
  modelName: string;
  data: AiFoodResponse;
  usage: CallUsage;
}

export interface FailedResponse {
  modelId: string;
  modelName: string;
  error: string;
}

/** Fields the user has edited by hand. Locked fields are excluded from the merge and never overwritten. */
export interface LockedFields {
  description: boolean;
  servingDescription: boolean;
  servings: boolean;
  totalWeightGrams: boolean;
  servingGrams: boolean;
  novaGroup: boolean;
  fruitVeg: boolean;
  per100g: Record<NutrientField, boolean>;
}

export function emptyLocks(): LockedFields {
  return {
    description: false,
    servingDescription: false,
    servings: false,
    totalWeightGrams: false,
    servingGrams: false,
    novaGroup: false,
    fruitVeg: false,
    per100g: { calories: false, protein: false, fat: false, carbohydrates: false, fibre: false }
  };
}

export interface MergedResult {
  description: string;
  servingDescription: string;
  servings: number;
  totalWeightGrams: number | null;
  servingGrams: number | null;
  per100g: Record<NutrientField, number | null>;
  perServing: Record<NutrientField, number | null>;
  novaGroup: NovaGroup;
  fruitVeg: boolean;
  confidence: 'low' | 'medium' | 'high';
  assumptions: string;
  contributingCount: number;
  perFieldContributorCount: Record<NutrientField, number>;
  spreadWarning: { min: number; max: number } | null;
  consistencyWarning: boolean;
  representativeModelId: string | null;
}

/** Per-field normalisation to per-100g (step 2). Per-serving figures are never averaged directly. */
function normalizeFieldToPer100g(data: AiFoodResponse, field: NutrientField): number | null {
  if (data.per100g[field] !== null) return data.per100g[field];
  if (data.perServing[field] !== null && data.servingGrams) {
    return (data.perServing[field]! * 100) / data.servingGrams;
  }
  return null;
}

function aggregate(values: number[]): number {
  const n = values.length;
  if (n === 1) return values[0];
  if (n === 2) return (values[0] + values[1]) / 2;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;
const RANK_CONFIDENCE = ['low', 'medium', 'high'] as const;

/**
 * Recomputes the full merge from every valid response gathered so far (never folds a new
 * response into an already-merged figure — see "Combining results from multiple models").
 */
export function mergeResponses(
  contributing: ContributingResponse[],
  locks: LockedFields,
  lockedValues: {
    description?: string;
    servingDescription?: string;
    servings?: number;
    totalWeightGrams?: number | null;
    servingGrams?: number | null;
    novaGroup?: NovaGroup;
    fruitVeg?: boolean;
    per100g?: Partial<Record<NutrientField, number | null>>;
  }
): MergedResult {
  if (contributing.length === 0) throw new Error('mergeResponses requires at least one contributing response');

  // --- Step 2: normalise, per field, across all contributing responses ---
  const fieldValues: Record<NutrientField, number[]> = {
    calories: [],
    protein: [],
    fat: [],
    carbohydrates: [],
    fibre: []
  };
  for (const c of contributing) {
    for (const field of NUTRIENT_FIELDS) {
      if (locks.per100g[field]) continue; // Step 3: locked fields take no part in the merge
      const v = normalizeFieldToPer100g(c.data, field);
      if (v !== null) fieldValues[field].push(v);
    }
  }

  // --- Step 4: aggregate each field independently ---
  const per100g: Record<NutrientField, number | null> = { calories: null, protein: null, fat: null, carbohydrates: null, fibre: null };
  const perFieldContributorCount: Record<NutrientField, number> = { calories: 0, protein: 0, fat: 0, carbohydrates: 0, fibre: 0 };
  for (const field of NUTRIENT_FIELDS) {
    if (locks.per100g[field]) {
      per100g[field] = lockedValues.per100g?.[field] ?? null;
      continue;
    }
    const values = fieldValues[field];
    perFieldContributorCount[field] = values.length;
    per100g[field] = values.length > 0 ? aggregate(values) : null;
  }

  // servingGrams / totalWeightGrams / servings — same aggregation rule, separately from nutrients
  const servingGrams = locks.servingGrams
    ? lockedValues.servingGrams ?? null
    : (() => {
        const values = contributing.map((c) => c.data.servingGrams).filter((v): v is number => v !== null);
        return values.length > 0 ? aggregate(values) : null;
      })();

  const totalWeightGrams = locks.totalWeightGrams
    ? lockedValues.totalWeightGrams ?? null
    : (() => {
        const values = contributing.map((c) => c.data.totalWeightGrams).filter((v): v is number => v !== null);
        return values.length > 0 ? aggregate(values) : null;
      })();

  const servings = locks.servings
    ? lockedValues.servings ?? 1
    : (() => {
        const values = contributing.map((c) => c.data.servings).filter((v): v is number => v !== null);
        return values.length > 0 ? aggregate(values) : 1;
      })();

  // --- Step 5: derive per-serving from the consensus, never from models' own per-serving figures ---
  const perServing: Record<NutrientField, number | null> = { calories: null, protein: null, fat: null, carbohydrates: null, fibre: null };
  for (const field of NUTRIENT_FIELDS) {
    perServing[field] = per100g[field] !== null && servingGrams !== null ? (per100g[field]! * servingGrams) / 100 : null;
  }

  // --- Step 6: non-numeric fields ---
  const novaGroup: NovaGroup = locks.novaGroup
    ? lockedValues.novaGroup ?? null
    : (() => {
        const counts = new Map<number, { count: number; firstIndex: number }>();
        contributing.forEach((c, i) => {
          if (c.data.novaGroup === null) return;
          const existing = counts.get(c.data.novaGroup);
          if (existing) existing.count++;
          else counts.set(c.data.novaGroup, { count: 1, firstIndex: i });
        });
        if (counts.size === 0) return null;
        let best: [number, { count: number; firstIndex: number }] | null = null;
        for (const entry of counts.entries()) {
          if (!best || entry[1].count > best[1].count || (entry[1].count === best[1].count && entry[1].firstIndex < best[1].firstIndex)) {
            best = entry;
          }
        }
        return best![0] as NovaGroup;
      })();

  const fruitVeg = locks.fruitVeg
    ? lockedValues.fruitVeg ?? false
    : (() => {
        let trueCount = 0;
        let falseCount = 0;
        let firstTrueIdx = Infinity;
        let firstFalseIdx = Infinity;
        contributing.forEach((c, i) => {
          if (c.data.fruitVeg) {
            trueCount++;
            firstTrueIdx = Math.min(firstTrueIdx, i);
          } else {
            falseCount++;
            firstFalseIdx = Math.min(firstFalseIdx, i);
          }
        });
        if (trueCount === falseCount) return firstTrueIdx < firstFalseIdx;
        return trueCount > falseCount;
      })();

  // Representative model: contributing response whose per100g calories sits closest to consensus.
  let representativeModelId: string | null = null;
  if (per100g.calories !== null) {
    let bestDist = Infinity;
    for (const c of contributing) {
      const v = normalizeFieldToPer100g(c.data, 'calories');
      if (v === null) continue;
      const dist = Math.abs(v - per100g.calories);
      if (dist < bestDist) {
        bestDist = dist;
        representativeModelId = c.modelId;
      }
    }
  }
  if (representativeModelId === null) representativeModelId = contributing[0].modelId;
  const representative = contributing.find((c) => c.modelId === representativeModelId) ?? contributing[0];

  const description = locks.description ? lockedValues.description ?? representative.data.description : representative.data.description;
  const servingDescription = locks.servingDescription
    ? lockedValues.servingDescription ?? representative.data.servingDescription
    : representative.data.servingDescription;

  const assumptions = contributing
    .filter((c) => c.data.assumptions.trim().length > 0)
    .map((c) => `${c.modelName}: ${c.data.assumptions.trim()}`)
    .join('\n');

  // --- Step 7: quality checks ---
  let spreadWarning: { min: number; max: number } | null = null;
  let confidenceDowngrade = 0;
  if (!locks.per100g.calories && fieldValues.calories.length >= 2) {
    const min = Math.min(...fieldValues.calories);
    const max = Math.max(...fieldValues.calories);
    const median = aggregate(fieldValues.calories);
    if (median > 0 && (max - min) / median > 0.3) {
      spreadWarning = { min, max };
      confidenceDowngrade = 1;
    }
  }

  const confidenceRank = Math.max(0, Math.min(...contributing.map((c) => CONFIDENCE_RANK[c.data.confidence])) - confidenceDowngrade);
  const confidence = RANK_CONFIDENCE[confidenceRank];

  let consistencyWarning = false;
  const { protein, carbohydrates, fat, fibre, calories } = perServing;
  if (protein !== null && carbohydrates !== null && fat !== null && calories !== null && calories !== 0) {
    const atwater = protein * 4 + carbohydrates * 4 + fat * 9 + (fibre ?? 0) * 2;
    if (Math.abs(atwater - calories) / calories > 0.15) consistencyWarning = true;
  }

  return {
    description,
    servingDescription,
    servings,
    totalWeightGrams,
    servingGrams,
    per100g,
    perServing,
    novaGroup,
    fruitVeg,
    confidence,
    assumptions,
    contributingCount: contributing.length,
    perFieldContributorCount,
    spreadWarning,
    consistencyWarning,
    representativeModelId
  };
}

export function totalCost(contributing: ContributingResponse[]): number | null {
  const costs = contributing.map((c) => c.usage.costUsd).filter((c): c is number => c !== null);
  if (costs.length === 0) return null;
  return costs.reduce((a, b) => a + b, 0);
}
