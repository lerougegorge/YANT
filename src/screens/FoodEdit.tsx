import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ScreenHeader } from '../components/ScreenHeader';
import { FoodItemForm, emptyFoodFormState, toPer100g, type FoodFormState } from '../components/FoodItemForm';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';

export function FoodEditScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const settings = useSettings();
  const toast = useToast();

  const item = useLiveQuery(() => (id ? db.foodItems.get(id) : undefined), [id]);

  const [form, setForm] = useState<FoodFormState>(emptyFoodFormState());
  const [barcode, setBarcode] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!item || loaded) return;
    setForm({
      description: item.description,
      servingDescription: item.servingDescription,
      servingGrams: item.servingGrams,
      perServing: {
        calories: item.caloriesPerServing,
        protein: item.proteinPerServing,
        fibre: item.fibrePerServing,
        carbohydrates: item.carbohydratesPerServing,
        fat: item.fatPerServing
      },
      per100gDisplay: {
        calories: item.caloriesPer100g,
        protein: item.proteinPer100g,
        fibre: item.fibrePer100g,
        carbohydrates: item.carbohydratesPer100g,
        fat: item.fatPer100g
      },
      units: { calories: '100g', protein: '100g', fibre: '100g', carbohydrates: '100g', fat: '100g' },
      novaGroup: item.novaGroup,
      fruitVeg: item.fruitVeg ?? false
    });
    setBarcode(item.barcode ?? '');
    setLoaded(true);
  }, [item, loaded]);

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    try {
      const trimmedBarcode = barcode.trim();
      if (trimmedBarcode && trimmedBarcode !== item.barcode) {
        const existing = await db.foodItems.where('barcode').equals(trimmedBarcode).first();
        if (existing && existing.id !== item.id) {
          toast.show('Another Food Item already uses this barcode');
          setSaving(false);
          return;
        }
      }
      await db.foodItems.update(item.id, {
        description: form.description.trim() || item.description,
        servingDescription: form.servingDescription.trim() || '1 serving',
        caloriesPerServing: form.perServing.calories ?? 0,
        proteinPerServing: form.perServing.protein,
        fatPerServing: form.perServing.fat,
        carbohydratesPerServing: form.perServing.carbohydrates,
        fibrePerServing: form.perServing.fibre,
        caloriesPer100g: toPer100g(form.per100gDisplay.calories, form.units.calories),
        proteinPer100g: toPer100g(form.per100gDisplay.protein, form.units.protein),
        fatPer100g: toPer100g(form.per100gDisplay.fat, form.units.fat),
        carbohydratesPer100g: toPer100g(form.per100gDisplay.carbohydrates, form.units.carbohydrates),
        fibrePer100g: toPer100g(form.per100gDisplay.fibre, form.units.fibre),
        novaGroup: form.novaGroup,
        fruitVeg: form.fruitVeg,
        barcode: trimmedBarcode || null,
        servingGrams: form.servingGrams,
        updatedAt: Date.now()
      });
      toast.show('Saved');
      navigate(-1);
    } finally {
      setSaving(false);
    }
  }

  if (!item) {
    return (
      <div className="flex flex-col min-h-full">
        <ScreenHeader title="Edit food" back="back" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Edit food" back="back" />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: 'var(--fg-muted)' }}>Barcode</span>
          <input
            className="rounded-lg border bg-transparent px-3 tap-target"
            style={{ borderColor: 'var(--border)' }}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
        </label>
        <FoodItemForm
          state={form}
          onChange={setForm}
          calorieUnitLabel={settings.calorieUnits}
          advancedOpen={advancedOpen}
          onAdvancedOpenChange={setAdvancedOpen}
        />
        {item.notes && (
          <div className="text-xs rounded-lg p-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="font-medium mb-0.5" style={{ color: 'var(--fg-muted)' }}>
              Notes
            </div>
            {item.notes}
          </div>
        )}
      </div>
      <div className="p-4 safe-bottom">
        <button
          className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
          style={{ background: '#16a34a' }}
          disabled={saving}
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}
