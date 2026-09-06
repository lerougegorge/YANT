import { useRef, useState } from 'react';
import { Copy, Save, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import type { ColumnKey, FoodInstance } from '../db/types';
import { formatNutrient, kcalToDisplay } from '../lib/units';
import { useSheets } from './SheetContext';
import { useToast } from './Toast';

const REVEAL_WIDTH = 76;
const SWIPE_THRESHOLD = 36;
const LONG_PRESS_MS = 500;
const TAP_MAX_MOVEMENT = 8;
const TAP_MAX_DURATION = 400;

function columnValue(instance: FoodInstance, column: ColumnKey): string {
  switch (column) {
    case 'calories':
      return String(Math.round(instance.calories));
    case 'caloriesKJ':
      return String(Math.round(kcalToDisplay(instance.calories, 'kJ') ?? 0));
    case 'protein':
      return formatNutrient(instance.protein).replace(' g', '');
    case 'fibre':
      return formatNutrient(instance.fibre).replace(' g', '');
    case 'carbohydrates':
      return formatNutrient(instance.carbohydrates).replace(' g', '');
    case 'fat':
      return formatNutrient(instance.fat).replace(' g', '');
  }
}

export function InstanceRow({ instance, columns }: { instance: FoodInstance; columns: ColumnKey[] }) {
  const { openEditInstance } = useSheets();
  const toast = useToast();

  const [dragX, setDragX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingHorizontally = useRef(false);

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    draggingHorizontally.current = false;
    longPressTimer.current = setTimeout(() => {
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) > TAP_MAX_MOVEMENT || Math.abs(dy) > TAP_MAX_MOVEMENT) clearLongPress();
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4) {
      draggingHorizontally.current = true;
      const base = revealed ? -REVEAL_WIDTH : 0;
      const next = Math.min(0, Math.max(-REVEAL_WIDTH - 20, base + dx));
      setDragX(next);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    clearLongPress();
    const s = start.current;
    start.current = null;
    if (draggingHorizontally.current) {
      if (dragX < -SWIPE_THRESHOLD) {
        setDragX(-REVEAL_WIDTH);
        setRevealed(true);
      } else {
        setDragX(0);
        setRevealed(false);
      }
      return;
    }
    if (!s) return;
    const dt = Date.now() - s.t;
    const moved = Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y);
    if (dt < TAP_MAX_DURATION && moved < TAP_MAX_MOVEMENT) {
      if (revealed) {
        setDragX(0);
        setRevealed(false);
      } else {
        openEditInstance(instance);
      }
    }
  }

  async function handleDelete() {
    const snapshot = { ...instance };
    await db.foodInstances.delete(instance.id);
    setDragX(0);
    setRevealed(false);
    toast.show('Deleted', {
      label: 'Undo',
      onClick: async () => {
        await db.foodInstances.add(snapshot);
      }
    });
  }

  async function handleDuplicate() {
    setMenuOpen(false);
    const now = Date.now();
    await db.foodInstances.add({ ...instance, id: crypto.randomUUID(), timestamp: now, createdAt: now, updatedAt: now });
    toast.show('Duplicated to now');
  }

  async function handleSaveAsFoodItem() {
    setMenuOpen(false);
    const now = Date.now();
    await db.foodItems.add({
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      description: instance.description,
      servingDescription: instance.servingDescription ?? '1 serving',
      caloriesPerServing: instance.amount > 0 ? instance.calories / instance.amount : instance.calories,
      proteinPerServing: instance.protein !== null && instance.amount > 0 ? instance.protein / instance.amount : instance.protein,
      fatPerServing: instance.fat !== null && instance.amount > 0 ? instance.fat / instance.amount : instance.fat,
      carbohydratesPerServing: instance.carbohydrates !== null && instance.amount > 0 ? instance.carbohydrates / instance.amount : instance.carbohydrates,
      fibrePerServing: instance.fibre !== null && instance.amount > 0 ? instance.fibre / instance.amount : instance.fibre,
      caloriesPer100g: null,
      proteinPer100g: null,
      fatPer100g: null,
      carbohydratesPer100g: null,
      fibrePer100g: null,
      novaGroup: instance.novaGroup,
      fruitVeg: instance.fruitVeg,
      barcode: null,
      servingGrams: instance.amountUnit === 'grams' ? instance.amount : null,
      servings: null,
      notes: null,
      source: instance.source,
      useCount: 0,
      lastUsedAt: null
    });
    toast.show('Saved as Food Item');
  }

  const canSaveAsFoodItem = !instance.foodItemId;

  return (
    <div className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        className="absolute right-0 top-0 h-full flex flex-col items-center justify-center gap-0.5 text-white text-xs font-medium tap-target"
        style={{ width: REVEAL_WIDTH, background: '#dc2626' }}
        onClick={handleDelete}
      >
        <Trash2 size={18} strokeWidth={1.75} />
        Delete
      </button>
      <div
        className="flex items-center gap-2 px-3 py-2.5 relative"
        style={{ background: 'var(--bg-elevated)', transform: `translateX(${dragX}px)`, transition: start.current ? 'none' : 'transform 150ms ease' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          clearLongPress();
          setDragX(revealed ? -REVEAL_WIDTH : 0);
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{instance.description}</div>
        </div>
        {columns.map((c) => (
          <div key={c} className="text-sm w-10 text-right shrink-0 tabular-nums">
            {columnValue(instance, c)}
          </div>
        ))}
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div
            className="absolute right-3 top-full mt-1 z-40 rounded-lg shadow-lg overflow-hidden text-sm"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <button className="flex items-center gap-2 w-full text-left px-4 py-2.5 tap-target" onClick={handleDuplicate}>
              <Copy size={16} strokeWidth={1.75} />
              Duplicate to now
            </button>
            {canSaveAsFoodItem && (
              <button className="flex items-center gap-2 w-full text-left px-4 py-2.5 tap-target" onClick={handleSaveAsFoodItem}>
                <Save size={16} strokeWidth={1.75} />
                Save as Food Item
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
