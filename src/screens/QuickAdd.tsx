import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { db } from '../db/db';
import type { NovaGroup } from '../db/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { NumberField } from '../components/NumberField';
import { NovaSegmented } from '../components/NovaSegmented';
import { MealSelect } from '../components/MealSelect';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { useDefaultMeal } from '../hooks/useDefaultMeal';
import { kcalFromDisplay } from '../lib/units';
import { useToast } from '../components/Toast';

export function QuickAddScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const meals = useMeals();
  const settings = useSettings();
  const toast = useToast();

  const prefill = (location.state as { description?: string } | null)?.description ?? '';
  const nowDate = useMemo(() => new Date(), []);

  const [description, setDescription] = useState(prefill);
  const [calories, setCalories] = useState<number | null>(null);
  const [caloriesUnit, setCaloriesUnit] = useState<'cal' | 'kJ'>(settings.calorieUnits);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [carbohydrates, setCarbohydrates] = useState<number | null>(null);
  const [fibre, setFibre] = useState<number | null>(null);
  const [fruitVeg, setFruitVeg] = useState(false);
  const [novaGroup, setNovaGroup] = useState<NovaGroup>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [meal, setMeal] = useDefaultMeal(meals, nowDate);
  const [saving, setSaving] = useState(false);

  async function handleLog() {
    setSaving(true);
    try {
      const now = Date.now();
      await db.foodInstances.add({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        timestamp: now,
        meal,
        description: description.trim() || 'Quick Add',
        calories: calories !== null ? kcalFromDisplay(calories, caloriesUnit) : 0,
        protein,
        fat,
        carbohydrates,
        fibre,
        fruitVeg,
        novaGroup,
        foodItemId: null,
        amount: 1,
        amountUnit: 'servings',
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
      </div>
      <div className="p-4 safe-bottom">
        <button
          className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
          style={{ background: '#16a34a' }}
          disabled={saving}
          onClick={handleLog}
        >
          Log
        </button>
      </div>
    </div>
  );
}
