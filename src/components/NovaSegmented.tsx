import type { NovaGroup } from '../db/types';

const OPTIONS: { value: NovaGroup; label: string }[] = [
  { value: null, label: 'Unknown' },
  { value: 1, label: 'Whole food' },
  { value: 2, label: 'Ingredient' },
  { value: 3, label: 'Processed' },
  { value: 4, label: 'Ultra-processed' }
];

export function NovaSegmented({ value, onChange }: { value: NovaGroup; onChange: (v: NovaGroup) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Processing group">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            className="px-2.5 py-1.5 rounded-full text-xs font-medium border tap-target"
            style={{
              borderColor: active ? 'transparent' : 'var(--border)',
              background: active ? '#16a34a' : 'transparent',
              color: active ? 'white' : 'var(--fg)'
            }}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
