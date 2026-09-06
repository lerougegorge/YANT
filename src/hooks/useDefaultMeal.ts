import { useEffect, useRef, useState } from 'react';
import type { Meal } from '../db/types';
import { resolveMealForTime } from '../lib/meals';

/**
 * Defaults the meal selection from the current time once meals have loaded (useLiveQuery
 * resolves asynchronously, so a useState initialiser alone would see an empty list on first
 * render). Stops applying the default the moment the user picks something themselves.
 */
export function useDefaultMeal(meals: Meal[], at: Date): [string | null, (v: string | null) => void] {
  const [meal, setMealState] = useState<string | null>(null);
  const touched = useRef(false);
  const applied = useRef(false);

  useEffect(() => {
    if (touched.current || applied.current) return;
    if (meals.length === 0) return;
    applied.current = true;
    setMealState(resolveMealForTime(meals, at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals]);

  function setMeal(v: string | null) {
    touched.current = true;
    setMealState(v);
  }

  return [meal, setMeal];
}
