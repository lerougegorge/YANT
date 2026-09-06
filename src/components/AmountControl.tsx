import { Minus, Plus } from 'lucide-react';
import type { AmountUnit } from '../db/types';

export function AmountControl({
  amount,
  amountUnit,
  servingGrams,
  weightUnits,
  onChange
}: {
  amount: number;
  amountUnit: AmountUnit;
  servingGrams: number | null;
  weightUnits: 'metric' | 'oz';
  onChange: (amount: number, unit: AmountUnit) => void;
}) {
  const step = amountUnit === 'servings' ? 0.5 : weightUnits === 'oz' ? 5 : 10;
  const gramsAvailable = servingGrams !== null && servingGrams > 0;
  const massLabel = weightUnits === 'oz' ? 'oz' : 'g';

  function bump(delta: number) {
    const next = Math.max(0, Math.round((amount + delta) * 100) / 100);
    onChange(next, amountUnit);
  }

  return (
    <div className="flex items-stretch gap-2">
      <button
        className="tap-target rounded-lg border flex items-center justify-center"
        style={{ borderColor: 'var(--border)' }}
        onClick={() => bump(-step)}
        aria-label="Decrease amount"
        type="button"
      >
        <Minus size={16} strokeWidth={1.75} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        className="w-20 text-center rounded-lg border bg-transparent tap-target"
        style={{ borderColor: 'var(--border)' }}
        value={amount}
        onChange={(e) => {
          const v = e.target.value.replace(',', '.');
          const n = Number(v);
          if (v === '' || Number.isNaN(n)) return;
          onChange(n, amountUnit);
        }}
      />
      <button
        className="tap-target rounded-lg border flex items-center justify-center"
        style={{ borderColor: 'var(--border)' }}
        onClick={() => bump(step)}
        aria-label="Increase amount"
        type="button"
      >
        <Plus size={16} strokeWidth={1.75} />
      </button>
      <div className="flex rounded-lg border overflow-hidden ml-1" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          className="px-3 tap-target text-sm"
          style={{
            background: amountUnit === 'servings' ? 'var(--color-brand-600, #16a34a)' : 'transparent',
            color: amountUnit === 'servings' ? 'white' : 'var(--fg)'
          }}
          onClick={() => onChange(amount, 'servings')}
        >
          servings
        </button>
        <button
          type="button"
          disabled={!gramsAvailable}
          className="px-3 tap-target text-sm disabled:opacity-40"
          style={{
            background: amountUnit === 'grams' ? 'var(--color-brand-600, #16a34a)' : 'transparent',
            color: amountUnit === 'grams' ? 'white' : 'var(--fg)'
          }}
          onClick={() => gramsAvailable && onChange(amount, 'grams')}
          title={gramsAvailable ? undefined : 'Set a serving weight to use this'}
        >
          {massLabel}
        </button>
      </div>
    </div>
  );
}
