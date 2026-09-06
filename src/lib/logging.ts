import { db } from '../db/db';
import type { AmountUnit, FoodInstance, FoodItem } from '../db/types';
import { scaleFromPer100g, scaleFromServing } from './units';

export interface ScaledNutrition {
  calories: number;
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
  fibre: number | null;
}

/** Computes the nutrition for `amount` servings or grams of a Food Item. */
export function computeScaledNutrition(item: FoodItem, amount: number, amountUnit: AmountUnit): ScaledNutrition {
  if (amountUnit === 'servings') {
    return {
      calories: item.caloriesPerServing * amount,
      protein: scaleFromServing(item.proteinPerServing, item.servingGrams, amount, 'servings'),
      fat: scaleFromServing(item.fatPerServing, item.servingGrams, amount, 'servings'),
      carbohydrates: scaleFromServing(item.carbohydratesPerServing, item.servingGrams, amount, 'servings'),
      fibre: scaleFromServing(item.fibrePerServing, item.servingGrams, amount, 'servings')
    };
  }

  // grams: prefer per-100g figures directly; fall back to deriving from per-serving via servingGrams
  const per100gCalories = item.caloriesPer100g ?? (item.servingGrams ? (item.caloriesPerServing * 100) / item.servingGrams : null);
  const per100gProtein = item.proteinPer100g ?? (item.servingGrams ? scaleTo100(item.proteinPerServing, item.servingGrams) : null);
  const per100gFat = item.fatPer100g ?? (item.servingGrams ? scaleTo100(item.fatPerServing, item.servingGrams) : null);
  const per100gCarbs = item.carbohydratesPer100g ?? (item.servingGrams ? scaleTo100(item.carbohydratesPerServing, item.servingGrams) : null);
  const per100gFibre = item.fibrePer100g ?? (item.servingGrams ? scaleTo100(item.fibrePerServing, item.servingGrams) : null);

  return {
    calories: per100gCalories !== null ? scaleFromPer100g(per100gCalories, amount)! : 0,
    protein: scaleFromPer100g(per100gProtein, amount),
    fat: scaleFromPer100g(per100gFat, amount),
    carbohydrates: scaleFromPer100g(per100gCarbs, amount),
    fibre: scaleFromPer100g(per100gFibre, amount)
  };
}

function scaleTo100(perServing: number | null, servingGrams: number | null): number | null {
  if (perServing === null || !servingGrams) return null;
  return (perServing * 100) / servingGrams;
}

export interface LogParams {
  meal: string | null;
  timestamp: number;
  amount: number;
  amountUnit: AmountUnit;
}

/** Logs a Food Instance from an existing Food Item and bumps its usage stats. */
export async function logFoodItem(item: FoodItem, params: LogParams): Promise<FoodInstance> {
  const nutrition = computeScaledNutrition(item, params.amount, params.amountUnit);
  const now = Date.now();
  const instance: FoodInstance = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    timestamp: params.timestamp,
    meal: params.meal,
    description: item.description,
    calories: nutrition.calories,
    protein: nutrition.protein,
    fat: nutrition.fat,
    carbohydrates: nutrition.carbohydrates,
    fibre: nutrition.fibre,
    fruitVeg: item.fruitVeg,
    novaGroup: item.novaGroup,
    foodItemId: item.id,
    amount: params.amount,
    amountUnit: params.amountUnit,
    servingDescription: item.servingDescription,
    source: item.source
  };

  await db.transaction('rw', db.foodInstances, db.foodItems, async () => {
    await db.foodInstances.add(instance);
    await db.foodItems.update(item.id, { useCount: item.useCount + 1, lastUsedAt: now });
  });

  return instance;
}
