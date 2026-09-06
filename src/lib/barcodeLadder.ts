import { db } from '../db/db';
import type { FoodItem } from '../db/types';
import { lookupOpenFoodFacts, type OffFoodItemDraft } from './openfoodfacts';

export type BarcodeLookupResult =
  | { rung: 'local'; item: FoodItem }
  | { rung: 'openfoodfacts'; draft: OffFoodItemDraft }
  | { rung: 'miss' };

/** Runs the cheapest-first lookup ladder: local Food Items, then Open Food Facts. */
export async function runBarcodeLadder(barcode: string, offEnabled: boolean): Promise<BarcodeLookupResult> {
  const local = await db.foodItems.where('barcode').equals(barcode).first();
  if (local) return { rung: 'local', item: local };

  if (offEnabled) {
    try {
      const draft = await lookupOpenFoodFacts(barcode);
      if (draft) return { rung: 'openfoodfacts', draft };
    } catch {
      // Falls through to the label-photo / manual-entry rungs, same as a miss.
    }
  }

  return { rung: 'miss' };
}
