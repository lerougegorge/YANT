import { db } from '../db/db';
import { SCHEMA_VERSION } from '../db/types';
import { exportFileSchema, type ExportFile } from './importSchema';

export async function buildExport(includeKey: boolean): Promise<ExportFile> {
  const [foodItems, foodInstances, goals, meals, settingsRow] = await Promise.all([
    db.foodItems.toArray(),
    db.foodInstances.toArray(),
    db.goals.toArray(),
    db.meals.toArray(),
    db.settings.get('singleton')
  ]);

  const settings = settingsRow ? [{ ...settingsRow, openRouterKey: includeKey ? settingsRow.openRouterKey : '' }] : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    foodItems,
    foodInstances,
    goals,
    meals,
    settings
  };
}

export function exportFilename(): string {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `nutrition-export-${iso}.json`;
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function buildInstancesCsv(): Promise<string> {
  const instances = await db.foodInstances.orderBy('timestamp').toArray();
  const header = [
    'timestamp',
    'description',
    'meal',
    'calories',
    'protein',
    'fat',
    'carbohydrates',
    'fibre',
    'amount',
    'amountUnit',
    'servingDescription',
    'novaGroup',
    'fruitVeg',
    'source'
  ];
  const rows = instances.map((i) =>
    [
      new Date(i.timestamp).toISOString(),
      i.description,
      i.meal ?? '',
      String(i.calories),
      i.protein !== null ? String(i.protein) : '',
      i.fat !== null ? String(i.fat) : '',
      i.carbohydrates !== null ? String(i.carbohydrates) : '',
      i.fibre !== null ? String(i.fibre) : '',
      String(i.amount),
      i.amountUnit,
      i.servingDescription ?? '',
      i.novaGroup !== null ? String(i.novaGroup) : '',
      i.fruitVeg !== null ? String(i.fruitVeg) : '',
      i.source
    ]
      .map((v) => csvEscape(v))
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ParsedImport {
  file: ExportFile;
  counts: { foodItems: number; foodInstances: number; goals: number; meals: number };
}

export function parseImportFile(json: unknown): ParsedImport {
  const result = exportFileSchema.safeParse(json);
  if (!result.success) throw new Error('This file is not a valid export (schema mismatch).');
  const file = result.data;
  return {
    file,
    counts: {
      foodItems: file.foodItems.length,
      foodInstances: file.foodInstances.length,
      goals: file.goals.length,
      meals: file.meals.length
    }
  };
}

export interface MergeSummary {
  foodItemsAdded: number;
  foodInstancesAdded: number;
  goalsAdded: number;
  mealsAdded: number;
}

export async function importMerge(file: ExportFile): Promise<MergeSummary> {
  const summary: MergeSummary = { foodItemsAdded: 0, foodInstancesAdded: 0, goalsAdded: 0, mealsAdded: 0 };

  await db.transaction('rw', db.foodItems, db.foodInstances, db.goals, db.meals, async () => {
    for (const item of file.foodItems) {
      const exists = await db.foodItems.get(item.id);
      if (!exists) {
        await db.foodItems.add(item);
        summary.foodItemsAdded++;
      }
    }
    for (const instance of file.foodInstances) {
      const exists = await db.foodInstances.get(instance.id);
      if (!exists) {
        await db.foodInstances.add(instance);
        summary.foodInstancesAdded++;
      }
    }
    for (const goal of file.goals) {
      const exists = await db.goals.get(goal.id);
      if (!exists) {
        await db.goals.add(goal);
        summary.goalsAdded++;
      }
    }
    for (const meal of file.meals) {
      const exists = await db.meals.get(meal.id);
      if (!exists) {
        await db.meals.add(meal);
        summary.mealsAdded++;
      }
    }
  });

  return summary;
}

export async function importReplace(file: ExportFile): Promise<void> {
  await db.transaction('rw', db.foodItems, db.foodInstances, db.goals, db.meals, db.settings, async () => {
    await Promise.all([
      db.foodItems.clear(),
      db.foodInstances.clear(),
      db.goals.clear(),
      db.meals.clear()
    ]);
    await db.foodItems.bulkAdd(file.foodItems);
    await db.foodInstances.bulkAdd(file.foodInstances);
    await db.goals.bulkAdd(file.goals);
    await db.meals.bulkAdd(file.meals);
    if (file.settings[0]) {
      const existing = await db.settings.get('singleton');
      const incoming = file.settings[0];
      // Never clobber a present key with a blank one from an export that excluded it.
      const openRouterKey = incoming.openRouterKey || existing?.openRouterKey || '';
      await db.settings.put({ ...incoming, openRouterKey });
    }
  });
}
