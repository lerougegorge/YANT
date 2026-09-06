import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { DEFAULT_SETTINGS, type Settings } from '../db/types';

/** Live Settings singleton. Falls back to defaults until the seed write lands. */
export function useSettings(): Settings {
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);
  return settings ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await db.settings.get('singleton');
  await db.settings.put({ ...(current ?? DEFAULT_SETTINGS), ...patch, updatedAt: Date.now() });
}
