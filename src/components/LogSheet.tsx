import { useMemo, useState } from 'react';
import type { AmountUnit, FoodItem } from '../db/types';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { useDefaultMeal } from '../hooks/useDefaultMeal';
import { computeScaledNutrition, logFoodItem } from '../lib/logging';
import { formatCalories, formatNutrient } from '../lib/units';
import { BottomSheet } from './BottomSheet';
import { AmountControl } from './AmountControl';
import { MealSelect } from './MealSelect';
import { useToast } from './Toast';

export function LogSheet({ item, onClose, onLogged }: { item: FoodItem; onClose: () => void; onLogged?: () => void }) {
  const meals = useMeals();
  const settings = useSettings();
  const toast = useToast();

  const nowDate = useMemo(() => new Date(), []);
  const [amount, setAmount] = useState(1);
  const [amountUnit, setAmountUnit] = useState<AmountUnit>('servings');
  const [meal, setMeal] = useDefaultMeal(meals, nowDate);
  const [saving, setSaving] = useState(false);

  const nutrition = useMemo(() => computeScaledNutrition(item, amount, amountUnit), [item, amount, amountUnit]);

  async function handleLog() {
    setSaving(true);
    try {
      await logFoodItem(item, { meal, timestamp: Date.now(), amount, amountUnit });
      toast.show(`Logged ${item.description}`);
      onLogged?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title="Log food"
      onClose={onClose}
      footer={
        <button
          className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
          style={{ background: '#16a34a' }}
          disabled={saving}
          onClick={handleLog}
        >
          Log
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-base font-medium">{item.description}</div>
          <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            {item.servingDescription}
          </div>
        </div>

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Amount
          </div>
          <AmountControl
            amount={amount}
            amountUnit={amountUnit}
            servingGrams={item.servingGrams}
            weightUnits={settings.weightUnits}
            onChange={(a, u) => {
              setAmount(a);
              setAmountUnit(u);
            }}
          />
        </div>

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Meal
          </div>
          <MealSelect meals={meals} value={meal} onChange={setMeal} />
        </div>

        <div className="rounded-lg p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="col-span-2 font-medium">{formatCalories(nutrition.calories, settings.calorieUnits)}</div>
          <div>Protein: {formatNutrient(nutrition.protein)}</div>
          <div>Carbs: {formatNutrient(nutrition.carbohydrates)}</div>
          <div>Fat: {formatNutrient(nutrition.fat)}</div>
          <div>Fibre: {formatNutrient(nutrition.fibre)}</div>
        </div>
      </div>
    </BottomSheet>
  );
}
