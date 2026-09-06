import type { FoodInstance, Meal } from '../db/types';

export interface Totals {
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
  fibre: number;
}

export function computeTotals(instances: FoodInstance[]): Totals {
  return instances.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein: acc.protein + (i.protein ?? 0),
      fat: acc.fat + (i.fat ?? 0),
      carbohydrates: acc.carbohydrates + (i.carbohydrates ?? 0),
      fibre: acc.fibre + (i.fibre ?? 0)
    }),
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0, fibre: 0 }
  );
}

export interface MealGroup {
  mealName: string | null;
  items: FoodInstance[];
  totals: Totals;
}

/** Groups instances under meal headings in meal order; items with no meal go in a trailing "Other" group. */
export function groupByMeal(instances: FoodInstance[], meals: Meal[]): MealGroup[] {
  const orderedMealNames = [...meals].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.name);
  const byMeal = new Map<string | null, FoodInstance[]>();

  for (const instance of instances) {
    const key = instance.meal && orderedMealNames.includes(instance.meal) ? instance.meal : instance.meal ?? null;
    const bucket = byMeal.get(key);
    if (bucket) bucket.push(instance);
    else byMeal.set(key, [instance]);
  }

  const groups: MealGroup[] = [];
  for (const name of orderedMealNames) {
    const items = byMeal.get(name);
    if (items) {
      groups.push({ mealName: name, items: [...items].sort((a, b) => a.timestamp - b.timestamp), totals: computeTotals(items) });
      byMeal.delete(name);
    }
  }

  // Anything left: null meal, or an orphaned meal name no longer in the meal list — both trail as "Other".
  const otherItems = [...byMeal.values()].flat();
  if (otherItems.length > 0) {
    groups.push({ mealName: null, items: otherItems.sort((a, b) => a.timestamp - b.timestamp), totals: computeTotals(otherItems) });
  }

  return groups;
}
