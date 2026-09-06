import { ChevronRight } from 'lucide-react';
import type { NovaGroup } from '../db/types';
import { NumberField } from './NumberField';
import { NovaSegmented } from './NovaSegmented';

const GRAMS_PER_OZ = 28.3495;
export const FIELD_ORDER = ['calories', 'protein', 'fibre', 'carbohydrates', 'fat'] as const;
export type Field = (typeof FIELD_ORDER)[number];
export type Unit100 = '100g' | 'oz';
export const FIELD_LABELS: Record<Field, string> = {
  calories: 'Calories',
  protein: 'Protein',
  fibre: 'Fibre',
  carbohydrates: 'Carbohydrates',
  fat: 'Fat'
};

export function toPer100g(value: number | null, unit: Unit100): number | null {
  if (value === null) return null;
  return unit === 'oz' ? (value * 100) / GRAMS_PER_OZ : value;
}

export interface FoodFormState {
  description: string;
  servingDescription: string;
  perServing: Record<Field, number | null>;
  per100gDisplay: Record<Field, number | null>;
  units: Record<Field, Unit100>;
  novaGroup: NovaGroup;
  fruitVeg: boolean;
  servingGrams: number | null;
}

export function emptyFoodFormState(): FoodFormState {
  return {
    description: '',
    servingDescription: '1 serving',
    perServing: { calories: null, protein: null, fibre: null, carbohydrates: null, fat: null },
    per100gDisplay: { calories: null, protein: null, fibre: null, carbohydrates: null, fat: null },
    units: { calories: '100g', protein: '100g', fibre: '100g', carbohydrates: '100g', fat: '100g' },
    novaGroup: null,
    fruitVeg: false,
    servingGrams: null
  };
}

export function FoodItemForm({
  state,
  onChange,
  calorieUnitLabel,
  advancedOpen,
  onAdvancedOpenChange
}: {
  state: FoodFormState;
  onChange: (next: FoodFormState) => void;
  calorieUnitLabel: string;
  advancedOpen: boolean;
  onAdvancedOpenChange: (v: boolean) => void;
}) {
  function setUnitCascading(field: Field, unit: Unit100) {
    const idx = FIELD_ORDER.indexOf(field);
    const nextUnits = { ...state.units };
    for (let i = idx; i < FIELD_ORDER.length; i++) nextUnits[FIELD_ORDER[i]] = unit;
    onChange({ ...state, units: nextUnits });
  }

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span style={{ color: 'var(--fg-muted)' }}>Description</span>
        <input
          className="rounded-lg border bg-transparent px-3 tap-target"
          style={{ borderColor: 'var(--border)' }}
          value={state.description}
          onChange={(e) => onChange({ ...state, description: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span style={{ color: 'var(--fg-muted)' }}>Serving description</span>
        <input
          className="rounded-lg border bg-transparent px-3 tap-target"
          style={{ borderColor: 'var(--border)' }}
          value={state.servingDescription}
          onChange={(e) => onChange({ ...state, servingDescription: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={`Calories per serving (${calorieUnitLabel})`}
          value={state.perServing.calories}
          onChange={(v) => onChange({ ...state, perServing: { ...state.perServing, calories: v } })}
        />
        <NumberField
          label="Protein per serving (g)"
          value={state.perServing.protein}
          onChange={(v) => onChange({ ...state, perServing: { ...state.perServing, protein: v } })}
        />
        <NumberField
          label="Fibre per serving (g)"
          value={state.perServing.fibre}
          onChange={(v) => onChange({ ...state, perServing: { ...state.perServing, fibre: v } })}
        />
        <NumberField
          label="Fat per serving (g)"
          value={state.perServing.fat}
          onChange={(v) => onChange({ ...state, perServing: { ...state.perServing, fat: v } })}
        />
        <NumberField
          label="Carbohydrates per serving (g)"
          value={state.perServing.carbohydrates}
          onChange={(v) => onChange({ ...state, perServing: { ...state.perServing, carbohydrates: v } })}
        />
        <NumberField label="Serving weight (g)" value={state.servingGrams} onChange={(v) => onChange({ ...state, servingGrams: v })} />
      </div>

      <button className="flex items-center gap-1 text-sm font-medium text-left" style={{ color: '#16a34a' }} onClick={() => onAdvancedOpenChange(!advancedOpen)}>
        <ChevronRight size={16} strokeWidth={1.75} style={{ transform: advancedOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
        Advanced inputs
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-4 rounded-lg p-3" style={{ border: '1px solid var(--border)' }}>
          {FIELD_ORDER.map((field) => (
            <div key={field} className="flex items-end gap-2">
              <div className="flex-1">
                <NumberField
                  label={FIELD_LABELS[field]}
                  value={state.per100gDisplay[field]}
                  onChange={(v) => onChange({ ...state, per100gDisplay: { ...state.per100gDisplay, [field]: v } })}
                />
              </div>
              <select
                className="rounded-lg border bg-transparent px-2 py-2 text-sm tap-target"
                style={{ borderColor: 'var(--border)' }}
                value={state.units[field]}
                onChange={(e) => setUnitCascading(field, e.target.value as Unit100)}
              >
                <option value="100g">per 100g</option>
                <option value="oz">per oz</option>
              </select>
            </div>
          ))}
          <div>
            <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
              Processing group
            </div>
            <NovaSegmented value={state.novaGroup} onChange={(v) => onChange({ ...state, novaGroup: v })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="tap-target"
              checked={state.fruitVeg}
              onChange={(e) => onChange({ ...state, fruitVeg: e.target.checked })}
            />
            Counts toward Five a Day
          </label>
        </div>
      )}
    </>
  );
}
