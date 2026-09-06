import { db } from '../db/db';
import type { FoodItem } from '../db/types';

const WINDOW_HOURS = 4;
const LOOKBACK_DAYS = 7;

/**
 * Foods logged around this time of day recently: the same four-hour window (±2h) over each
 * of the previous seven days. Up to five distinct Food Items, most frequent first, ties
 * broken by most recent use.
 */
export async function getTimeBasedSuggestions(now: Date): Promise<FoodItem[]> {
  const halfWindowMs = ((WINDOW_HOURS / 2) * 60 * 60 * 1000) | 0;
  const counts = new Map<string, { count: number; mostRecent: number }>();

  for (let dayOffset = 0; dayOffset < LOOKBACK_DAYS; dayOffset++) {
    const dayAnchor = new Date(now);
    dayAnchor.setDate(dayAnchor.getDate() - dayOffset);
    const center = dayAnchor.getTime();
    const start = center - halfWindowMs;
    const end = center + halfWindowMs;

    const instances = await db.foodInstances.where('timestamp').between(start, end, true, true).toArray();
    for (const instance of instances) {
      if (!instance.foodItemId) continue;
      const existing = counts.get(instance.foodItemId);
      if (existing) {
        existing.count++;
        existing.mostRecent = Math.max(existing.mostRecent, instance.timestamp);
      } else {
        counts.set(instance.foodItemId, { count: 1, mostRecent: instance.timestamp });
      }
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].mostRecent - a[1].mostRecent);

  const results: FoodItem[] = [];
  for (const [foodItemId] of ranked) {
    if (results.length >= 5) break;
    const item = await db.foodItems.get(foodItemId);
    if (item) results.push(item);
  }
  return results;
}

function normalise(s: string): string {
  return s.toLowerCase();
}

/** Simple ordered-subsequence fuzzy match: every char of `query` appears in order within `text`. */
function fuzzyMatches(query: string, text: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

/** Case-insensitive substring match first, then fuzzy, on Food Item description. */
export function searchFoodItems(query: string, items: FoodItem[]): FoodItem[] {
  const q = normalise(query.trim());
  if (!q) return [];

  const substringMatches = items.filter((i) => normalise(i.description).includes(q));
  const substringIds = new Set(substringMatches.map((i) => i.id));
  const fuzzyMatchesList = items.filter((i) => !substringIds.has(i.id) && fuzzyMatches(q, normalise(i.description)));

  return [...substringMatches, ...fuzzyMatchesList];
}
