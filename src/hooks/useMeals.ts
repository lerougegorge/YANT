import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Meal } from '../db/types';

export function useMeals(): Meal[] {
  const meals = useLiveQuery(() => db.meals.orderBy('sortOrder').toArray(), []);
  return meals ?? [];
}
