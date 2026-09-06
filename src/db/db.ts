import Dexie, { type EntityTable } from 'dexie';
import type { FoodItem, FoodInstance, Goal, Meal, Settings } from './types';
import { DEFAULT_MEALS, DEFAULT_SETTINGS } from './types';

export class NutritionDB extends Dexie {
  foodItems!: EntityTable<FoodItem, 'id'>;
  foodInstances!: EntityTable<FoodInstance, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  meals!: EntityTable<Meal, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('nutrition-tracker');

    this.version(1).stores({
      foodItems: 'id, description, barcode, updatedAt, lastUsedAt',
      foodInstances: 'id, timestamp, foodItemId',
      goals: 'id',
      meals: 'id, sortOrder',
      settings: 'id'
    });
  }
}

export const db = new NutritionDB();

let seeded = false;

/** Populates default meals and settings on first run. Idempotent and safe to call repeatedly. */
export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  await db.transaction('rw', db.meals, db.settings, async () => {
    const mealCount = await db.meals.count();
    if (mealCount === 0) {
      const now = Date.now();
      await db.meals.bulkAdd(
        DEFAULT_MEALS.map((m) => ({
          ...m,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now
        }))
      );
    }

    const existingSettings = await db.settings.get('singleton');
    if (!existingSettings) {
      await db.settings.put({ ...DEFAULT_SETTINGS });
    } else {
      // Backfill settings seeded by an older version of the app, but only fields that still
      // look untouched — so a deliberate customization is never silently overwritten.
      const patch: Partial<Settings> = {};
      if (existingSettings.models.length === 0 && existingSettings.estimateModelOrder.length === 0 && !existingSettings.labelModel) {
        patch.models = DEFAULT_SETTINGS.models;
        patch.estimateModelOrder = DEFAULT_SETTINGS.estimateModelOrder;
        patch.labelModel = DEFAULT_SETTINGS.labelModel;
      }
      const isOldDefaultColumns =
        existingSettings.columns.length === 4 &&
        ['calories', 'protein', 'carbohydrates', 'fat'].every((c, i) => existingSettings.columns[i] === c);
      if (isOldDefaultColumns) {
        patch.columns = DEFAULT_SETTINGS.columns;
      }
      if (Object.keys(patch).length > 0) {
        await db.settings.update('singleton', { ...patch, updatedAt: Date.now() });
      }
    }
  });
  seeded = true;
}

/** Requests persistent storage so IndexedDB isn't evicted under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
