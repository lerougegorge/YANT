import type { Meal } from '../db/types';

export function MealSelect({
  meals,
  value,
  onChange
}: {
  meals: Meal[];
  value: string | null;
  onChange: (meal: string | null) => void;
}) {
  const orphaned = value !== null && !meals.some((m) => m.name === value);

  return (
    <select
      className="w-full rounded-lg border bg-transparent px-3 tap-target"
      style={{ borderColor: 'var(--border)' }}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">No meal</option>
      {orphaned && (
        <option value={value!} style={{ color: 'var(--fg-muted)' }}>
          {value} (removed)
        </option>
      )}
      {[...meals]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
    </select>
  );
}
