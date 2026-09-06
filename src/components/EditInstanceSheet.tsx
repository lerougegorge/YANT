import { useState } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import type { FoodInstance } from '../db/types';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { BottomSheet } from './BottomSheet';
import { AmountControl } from './AmountControl';
import { MealSelect } from './MealSelect';
import { NumberField } from './NumberField';
import { useToast } from './Toast';

export function EditInstanceSheet({ instance, onClose }: { instance: FoodInstance; onClose: () => void }) {
  const meals = useMeals();
  const settings = useSettings();
  const toast = useToast();

  const [description, setDescription] = useState(instance.description);
  const [meal, setMeal] = useState<string | null>(instance.meal);
  const [amount, setAmount] = useState(instance.amount);
  const [amountUnit, setAmountUnit] = useState(instance.amountUnit);
  const [calories, setCalories] = useState<number | null>(instance.calories);
  const [protein, setProtein] = useState<number | null>(instance.protein);
  const [fat, setFat] = useState<number | null>(instance.fat);
  const [carbohydrates, setCarbohydrates] = useState<number | null>(instance.carbohydrates);
  const [fibre, setFibre] = useState<number | null>(instance.fibre);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function scaleValues(nextAmount: number) {
    const ratio = instance.amount !== 0 ? nextAmount / amount : 1;
    if (!Number.isFinite(ratio)) return;
    setCalories((c) => (c === null ? null : c * ratio));
    setProtein((p) => (p === null ? null : p * ratio));
    setFat((f) => (f === null ? null : f * ratio));
    setCarbohydrates((c) => (c === null ? null : c * ratio));
    setFibre((f) => (f === null ? null : f * ratio));
    setAmount(nextAmount);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const now = Date.now();
      await db.foodInstances.update(instance.id, {
        description,
        meal,
        amount,
        amountUnit,
        calories: calories ?? 0,
        protein,
        fat,
        carbohydrates,
        fibre,
        updatedAt: now
      });
      toast.show('Saved');
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const snapshot = { ...instance };
    await db.foodInstances.delete(instance.id);
    onClose();
    toast.show('Deleted', {
      label: 'Undo',
      onClick: () => db.foodInstances.add(snapshot)
    });
  }

  return (
    <BottomSheet
      title="Edit entry"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
            style={{ background: '#16a34a' }}
            disabled={saving}
            onClick={handleSave}
          >
            Save
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-semibold tap-target"
            style={{ border: '1.5px solid #dc2626', color: '#dc2626' }}
            onClick={handleDelete}
          >
            <Trash2 size={16} strokeWidth={1.75} />
            Delete
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: 'var(--fg-muted)' }}>Description</span>
          <input
            className="rounded-lg border bg-transparent px-3 tap-target"
            style={{ borderColor: 'var(--border)' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Amount
          </div>
          <AmountControl
            amount={amount}
            amountUnit={amountUnit}
            servingGrams={amountUnit === 'grams' ? 1 : null}
            weightUnits={settings.weightUnits}
            onChange={(a) => scaleValues(a)}
          />
        </div>

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Meal
          </div>
          <MealSelect meals={meals} value={meal} onChange={setMeal} />
        </div>

        <NumberField label={`Calories (${settings.calorieUnits})`} value={calories} onChange={setCalories} />

        <button
          className="flex items-center gap-1 text-sm font-medium text-left"
          style={{ color: '#16a34a' }}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <ChevronRight size={16} strokeWidth={1.75} style={{ transform: advancedOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          Advanced
        </button>

        {advancedOpen && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Protein (g)" value={protein} onChange={setProtein} />
            <NumberField label="Carbohydrates (g)" value={carbohydrates} onChange={setCarbohydrates} />
            <NumberField label="Fat (g)" value={fat} onChange={setFat} />
            <NumberField label="Fibre (g)" value={fibre} onChange={setFibre} />
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
