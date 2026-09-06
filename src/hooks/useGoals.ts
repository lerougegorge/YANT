import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Goal } from '../db/types';

export function useGoals(): Goal[] {
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  return (goals ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function useEnabledGoals(): Goal[] {
  return useGoals().filter((g) => g.enabled);
}
