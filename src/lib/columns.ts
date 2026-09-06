import type { ColumnKey } from '../db/types';

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  calories: 'Cal',
  caloriesKJ: 'kJ',
  protein: 'Prot',
  fibre: 'Fibre',
  carbohydrates: 'Carb',
  fat: 'Fat'
};

export const COLUMN_ORDER: ColumnKey[] = ['calories', 'caloriesKJ', 'protein', 'fibre', 'carbohydrates', 'fat'];

/** Caps the visible columns to at most 3 on narrow screens, dropping from the right in Preferences order. */
export function visibleColumns(enabled: ColumnKey[], narrow: boolean): ColumnKey[] {
  if (!narrow) return enabled;
  return enabled.slice(0, 3);
}
