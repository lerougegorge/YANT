import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { db } from '../db/db';
import type { AmountUnit, NovaGroup } from '../db/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { NumberField } from '../components/NumberField';
import { NovaSegmented } from '../components/NovaSegmented';
import { MealSelect } from '../components/MealSelect';
import { AmountControl } from '../components/AmountControl';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { useDefaultMeal } from '../hooks/useDefaultMeal';
import { defaultLogTime } from '../lib/date';
import { kcalFromDisplay } from '../lib/units';
import { useToast } from '../components/Toast';

function dividedBy(value: number | null, divisor: number): number | null {
  if (value === null) return null;
  return value / divisor;
}

export function QuickAddScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const meals = useMeals();
  const settings = useSettings();
  const toast = useToast();

  const state = location.state as { description?: string; day?: number } | null;
  const prefill = state?.description ?? '';
  const nowDate = useMemo(() => defaultLogTime(state?.day !== undefined ? new Date(state.day) : new Date()), [state?.day]);

  const [description, setDescription] = useState(prefill);
  const [amount, setAmount] = useState(1);
  const [amountUnit, setAmountUnit] = useState<AmountUnit>('servings');
  const [calories, setCalories] = useState<number | null>(null);
  const [caloriesUnit, setCaloriesUnit] = useState<'cal' | 'kJ'>(settings.calorieUnits);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [carbohydrates, setCarbohydrates] = useState<number | null>(null);
  const [fibre, setFibre] = useState<number | null>(null);
  const [fruitVeg, setFruitVeg] = useState(false);
  const [novaGroup, setNovaGroup] = useState<NovaGroup>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addToFoods, setAddToFoods] = useState(false);
  const [meal, setMeal] = useDefaultMeal(meals, nowDate);
  const [saving, setSaving] = useState(false);
  const [matchPrompt, setMatchPrompt] = useState<{ existingId: string } | null>(null);

  async function handleLog() {
    setSaving(true);
    try {
      const now = Date.now();
      const consumedCalories = calories !== null ? kcalFromDisplay(calories, caloriesUnit) : 0;
      const trimmedDescription = description.trim() || 'Quick Add';

      let foodItemId: string | null = null;

      if (addToFoods) {
        const existing = await db.foodItems.where('description').equalsIgnoreCase(trimmedDescription).first();
        if (existing && !matchPrompt) {
          setMatchPrompt({ existingId: existing.id });
          setSaving(false);
          return;
        }

        // The figures entered above describe the amount actually eaten, not a single serving —
        // e.g. half a croissant at 200 kcal means the whole croissant is 400 kcal. Divide back
        // down to a per-serving (or, for a gram amount, a per-100g) figure for the library entry.
        const divisor = amount > 0 ? amount : 1;
        const isGrams = amountUnit === 'grams';

        const itemData = {
          description: trimmedDescription,
          servingDescription: isGrams ? `1 serving (${amount}g)` : '1 serving',
          caloriesPerServing: isGrams ? consumedCalories : consumedCalories / divisor,
          proteinPerServing: isGrams ? protein : dividedBy(protein, divisor),
          fatPerServing: isGrams ? fat : dividedBy(fat, divisor),
          carbohydratesPerServing: isGrams ? carbohydrates : dividedBy(carbohydrates, divisor),
          fibrePerServing: isGrams ? fibre : dividedBy(fibre, divisor),
          caloriesPer100g: isGrams ? (consumedCalories / divisor) * 100 : null,
          proteinPer100g: isGrams ? dividedBy(protein, divisor / 100) : null,
          fatPer100g: isGrams ? dividedBy(fat, divisor / 100) : null,
          carbohydratesPer100g: isGrams ? dividedBy(carbohydrates, divisor / 100) : null,
          fibrePer100g: isGrams ? dividedBy(fibre, divisor / 100) : null,
          novaGroup,
          fruitVeg,
          servingGrams: isGrams ? amount : null,
          servings: null,
          notes: null,
          source: 'manual' as const,
          updatedAt: now
        };

        if (matchPrompt) {
          await db.foodItems.update(matchPrompt.existingId, itemData);
          foodItemId = matchPrompt.existingId;
        } else {
          foodItemId = crypto.randomUUID();
          await db.foodItems.add({ id: foodItemId, createdAt: now, barcode: null, useCount: 1, lastUsedAt: now, ...itemData });
        }
      }

      await db.foodInstances.add({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        timestamp: nowDate.getTime(),
        meal,
        description: trimmedDescription,
        calories: consumedCalories,
        protein,
        fat,
        carbohydrates,
        fibre,
        fruitVeg,
        novaGroup,
        foodItemId,
        amount,
        amountUnit,
        servingDescription: null,
        source: 'manual'
      });
      toast.show('Logged');
      navigate('/');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Quick Add" back="back" />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: 'var(--fg-muted)' }}>Description (optional)</span>
          <input
            className="rounded-lg border bg-transparent px-3 tap-target"
            style={{ borderColor: 'var(--border)' }}
            placeholder="Quick Add"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Amount
          </div>
          <AmountControl amount={amount} amountUnit={amountUnit} servingGrams={1} weightUnits={settings.weightUnits} onChange={(a, u) => { setAmount(a); setAmountUnit(u); }} />
        </div>

        <div>
          <NumberField
            label="Calories"
            value={calories}
            onChange={setCalories}
            suffix={
              <select
                className="rounded-lg border bg-transparent px-2 tap-target text-sm"
                style={{ borderColor: 'var(--border)' }}
                value={caloriesUnit}
                onChange={(e) => setCaloriesUnit(e.target.value as 'cal' | 'kJ')}
                aria-label="Calorie unit"
              >
                <option value="cal">cal</option>
                <option value="kJ">kJ</option>
              </select>
            }
          />
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
            For the amount above, not per serving — e.g. half eaten at 200 kcal means the whole thing is 400 kcal.
          </p>
        </div>

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Meal
          </div>
          <MealSelect meals={meals} value={meal} onChange={setMeal} />
        </div>

        <button
          className="flex items-center gap-1 text-sm font-medium text-left"
          style={{ color: '#16a34a' }}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <ChevronRight size={16} strokeWidth={1.75} style={{ transform: advancedOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          Advanced
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-4 rounded-lg p-3" style={{ border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Protein (g)" value={protein} onChange={setProtein} />
              <NumberField label="Carbohydrates (g)" value={carbohydrates} onChange={setCarbohydrates} />
              <NumberField label="Fat (g)" value={fat} onChange={setFat} />
              <NumberField label="Fibre (g)" value={fibre} onChange={setFibre} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="tap-target" checked={fruitVeg} onChange={(e) => setFruitVeg(e.target.checked)} />
              Counts toward Five a Day
            </label>
            <div>
              <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
                Processing group
              </div>
              <NovaSegmented value={novaGroup} onChange={setNovaGroup} />
            </div>
          </div>
        )}

        {matchPrompt && (
          <div className="rounded-lg p-3 text-sm flex flex-col gap-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <span>A Food Item with this exact description already exists. Update it instead of creating a duplicate?</span>
            <div className="flex gap-2">
              <button className="font-semibold" style={{ color: '#16a34a' }} onClick={handleLog}>
                Yes, update it
              </button>
              <button style={{ color: 'var(--fg-muted)' }} onClick={() => setMatchPrompt(null)}>
                No, cancel
              </button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="tap-target" checked={addToFoods} onChange={(e) => setAddToFoods(e.target.checked)} />
          Add to Food Library
        </label>
      </div>
      <div className="p-4 safe-bottom">
        <button
          className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
          style={{ background: '#16a34a' }}
          disabled={saving || !!matchPrompt}
          onClick={handleLog}
        >
          Log
        </button>
      </div>
    </div>
  );
}
