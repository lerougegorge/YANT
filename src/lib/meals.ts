import { db } from '../db/db';
import type { Meal } from '../db/types';

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseHHmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Picks the first meal (in sort order) whose default range contains `at`. A range whose end
 * is before its start wraps past midnight. Meals with no times are never auto-selected.
 * Returns null when nothing matches, leaving the choice to the user.
 */
export function resolveMealForTime(meals: Meal[], at: Date): string | null {
  const nowMin = minutesSinceMidnight(at);
  const sorted = [...meals].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const meal of sorted) {
    if (!meal.defaultStart || !meal.defaultEnd) continue;
    const start = parseHHmm(meal.defaultStart);
    const end = parseHHmm(meal.defaultEnd);
    if (start <= end) {
      if (nowMin >= start && nowMin < end) return meal.name;
    } else {
      // wraps past midnight
      if (nowMin >= start || nowMin < end) return meal.name;
    }
  }
  return null;
}

export async function countInstancesForMeal(name: string): Promise<number> {
  return db.foodInstances.where('meal').equals(name).count();
}

/** Bulk-renames a meal across past entries. History is otherwise immune to later edits. */
export async function renameMealInInstances(oldName: string, newName: string): Promise<number> {
  return db.foodInstances.where('meal').equals(oldName).modify({ meal: newName });
}
