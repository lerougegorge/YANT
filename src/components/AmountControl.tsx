import { useEffect, useRef, useState } from 'react';
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
  // Finer-grained stepping below one serving, where the difference between e.g. 0.5 and 0.6
  // servings actually matters; above that, half-servings are the more useful increment.
  const step = amountUnit === 'servings' ? (amount < 1 ? 0.1 : 0.5) : weightUnits === 'oz' ? 5 : 10;
  const gramsAvailable = servingGrams !== null && servingGrams > 0;
  const massLabel = weightUnits === 'oz' ? 'oz' : 'g';

  // The text box needs its own buffer distinct from `amount`: once the user types a trailing
  // "." (e.g. entering "0.75"), Number(".") normalises straight back to "0", and if the input's
  // displayed value were derived directly from that round-tripped number, the "." the user just
  // typed would vanish before they can type the digits after it. Buffering the raw text lets
  // partial input like "0." survive until it's completed, while still reporting a real number
  // to the parent on every keystroke that parses to one.
  const [text, setText] = useState(() => String(amount));
  const lastReportedRef = useRef(amount);

  useEffect(() => {
    if (amount !== lastReportedRef.current) {
      setText(String(amount));
      lastReportedRef.current = amount;
    }
  }, [amount]);

  function report(next: number, unit: AmountUnit) {
    lastReportedRef.current = next;
    onChange(next, unit);
  }

  function bump(delta: number) {
    const next = Math.max(0, Math.round((amount + delta) * 100) / 100);
    setText(String(next));
    report(next, amountUnit);
  }

  function handleTextInput(raw: string) {
    const v = raw.replace(',', '.');
    if (!/^\d*\.?\d*$/.test(v)) return;
    setText(v);
    if (v === '' || v === '.') return;
    const n = Number(v);
    if (!Number.isNaN(n)) report(n, amountUnit);
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
        value={text}
        onChange={(e) => handleTextInput(e.target.value)}
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
