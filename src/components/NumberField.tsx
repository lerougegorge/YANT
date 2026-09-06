import type { ReactNode } from 'react';

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: ReactNode;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span style={{ color: 'var(--fg-muted)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          className="w-full rounded-lg border bg-transparent px-3 tap-target"
          style={{ borderColor: 'var(--border)' }}
          placeholder={placeholder ?? '—'}
          value={value === null ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.');
            if (raw.trim() === '') {
              onChange(null);
              return;
            }
            if (!/^-?\d*\.?\d*$/.test(raw)) return;
            const n = Number(raw);
            onChange(Number.isNaN(n) ? null : n);
          }}
        />
        {suffix && (
          <span className="text-sm shrink-0" style={{ color: 'var(--fg-muted)' }}>
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
