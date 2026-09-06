import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { BarChart } from '../components/BarChart';
import { useEnabledGoals } from '../hooks/useGoals';
import { useSettings } from '../hooks/useSettings';
import { addDays, fromDateInputValue, toDateInputValue } from '../lib/date';
import {
  computeDailySeries,
  computeGoalAdherence,
  headlineStats,
  macroComposition,
  novaCalorieBreakdown,
  topFoods,
  type DayEntry
} from '../lib/analysis';
import { GOAL_MEASUREMENT_LABELS } from '../lib/goals';
import type { GoalMeasurement } from '../db/types';

type RangePreset = '7' | '30' | '90' | 'custom';

const MEASUREMENT_OPTIONS: { value: GoalMeasurement; label: string }[] = [
  { value: 'calories', label: 'Calories' },
  { value: 'protein', label: 'Protein' },
  { value: 'carbohydrates', label: 'Carbohydrates' },
  { value: 'fat', label: 'Fat' },
  { value: 'fibre', label: 'Fibre' }
];

const NOVA_COLORS: Record<string, string> = { '1': '#16a34a', '2': '#84cc16', '3': '#f59e0b', '4': '#ef4444', unknown: '#94a3b8' };
const NOVA_LABELS: Record<string, string> = { '1': 'Whole food', '2': 'Ingredients', '3': 'Processed', '4': 'Ultra-processed', unknown: 'Unknown' };

export function AnalysisScreen() {
  const settings = useSettings();
  const goals = useEnabledGoals();
  const [preset, setPreset] = useState<RangePreset>('30');
  const [customStart, setCustomStart] = useState(() => toDateInputValue(addDays(new Date(), -30)));
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));
  const [measurement, setMeasurement] = useState<GoalMeasurement>('calories');

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (preset === 'custom') return { rangeStart: fromDateInputValue(customStart), rangeEnd: fromDateInputValue(customEnd) };
    const days = Number(preset);
    return { rangeStart: addDays(new Date(), -(days - 1)), rangeEnd: new Date() };
  }, [preset, customStart, customEnd]);

  const days = useLiveQuery(() => computeDailySeries(rangeStart, rangeEnd), [rangeStart.getTime(), rangeEnd.getTime()]) ?? [];

  const headline = headlineStats(days);
  const goalForMeasurement = goals.find((g) => g.measurement === measurement);
  const composition = macroComposition(days);
  const nova = novaCalorieBreakdown(days);
  const totalNovaCalories = Object.values(nova).reduce((a, b) => a + b, 0);
  const top = topFoods(days);

  const xLabels = days.map((d) => d.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  const values = days.map((d) => (d.hasLog ? measurementValue(d, measurement) : null));

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Analysis" back="back" />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <div className="flex gap-2 text-xs overflow-x-auto">
          {(['7', '30', '90', 'custom'] as RangePreset[]).map((p) => (
            <button
              key={p}
              className="px-3 py-1.5 rounded-full border shrink-0"
              style={{ borderColor: preset === p ? 'transparent' : 'var(--border)', background: preset === p ? '#16a34a' : 'transparent', color: preset === p ? 'white' : 'var(--fg)' }}
              onClick={() => setPreset(p)}
            >
              {p === 'custom' ? 'Custom' : `${p} days`}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex gap-2 text-sm">
            <input type="date" className="rounded-lg border bg-transparent px-2 py-1 tap-target" style={{ borderColor: 'var(--border)' }} value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <input type="date" className="rounded-lg border bg-transparent px-2 py-1 tap-target" style={{ borderColor: 'var(--border)' }} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <Headline label="Avg calories/day" value={Math.round(headline.avgCalories).toString()} />
          <Headline label="Avg protein/day" value={`${Math.round(headline.avgProtein)}g`} />
          <Headline label="Days logged" value={`${headline.daysLogged}/${days.length}`} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Daily totals</span>
            <select
              className="text-xs rounded-lg border bg-transparent px-2 py-1 tap-target"
              style={{ borderColor: 'var(--border)' }}
              value={measurement}
              onChange={(e) => setMeasurement(e.target.value as GoalMeasurement)}
            >
              {MEASUREMENT_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <BarChart xLabels={xLabels} values={values} goalValue={goalForMeasurement?.value ?? null} />
        </div>

        {goals.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">Goal adherence</div>
            <div className="flex flex-col gap-2">
              {goals.map((g) => {
                const adherence = computeGoalAdherence(g, days);
                return (
                  <div key={g.id} className="flex items-center justify-between text-sm rounded-lg p-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <span>{GOAL_MEASUREMENT_LABELS[g.measurement]}</span>
                    <span style={{ color: 'var(--fg-muted)' }}>
                      {Math.round(adherence.percentMet)}% · {adherence.streak}d streak
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-sm font-medium mb-2">Composition</div>
          <div className="flex h-3 rounded-full overflow-hidden mb-1">
            <div style={{ width: `${composition.protein}%`, background: '#16a34a' }} />
            <div style={{ width: `${composition.carbohydrates}%`, background: '#3b82f6' }} />
            <div style={{ width: `${composition.fat}%`, background: '#f59e0b' }} />
          </div>
          <div className="flex gap-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
            <span>Protein {Math.round(composition.protein)}%</span>
            <span>Carbs {Math.round(composition.carbohydrates)}%</span>
            <span>Fat {Math.round(composition.fat)}%</span>
          </div>

          <div className="flex h-3 rounded-full overflow-hidden mt-3 mb-1">
            {(['1', '2', '3', '4', 'unknown'] as const).map((k) => (
              <div key={k} style={{ width: `${totalNovaCalories > 0 ? (nova[k] / totalNovaCalories) * 100 : 0}%`, background: NOVA_COLORS[k] }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
            {(['1', '2', '3', '4', 'unknown'] as const).map((k) => (
              <span key={k}>
                {NOVA_LABELS[k]} {totalNovaCalories > 0 ? Math.round((nova[k] / totalNovaCalories) * 100) : 0}%
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Five a Day</div>
          <div className="flex gap-1 flex-wrap">
            {days.map((d, i) => (
              <div
                key={i}
                title={d.date.toDateString()}
                className="h-4 w-4 rounded-sm"
                style={{ background: !d.hasLog ? 'var(--border)' : d.fruitVegCount >= 5 ? '#16a34a' : d.fruitVegCount > 0 ? '#bbf7d0' : '#fecaca' }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Top foods</div>
          <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
            {top.map((f) => (
              <div key={f.key} className="flex justify-between py-1.5 text-sm">
                <span className="truncate pr-2">{f.description}</span>
                <span style={{ color: 'var(--fg-muted)' }} className="shrink-0">
                  {Math.round(f.totalCalories)} kcal · {f.count}×
                </span>
              </div>
            ))}
            {top.length === 0 && (
              <p className="text-sm py-4" style={{ color: 'var(--fg-muted)' }}>
                Nothing logged in this range yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Headline({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </div>
    </div>
  );
}

function measurementValue(day: DayEntry, measurement: GoalMeasurement): number {
  switch (measurement) {
    case 'calories':
      return day.totals.calories;
    case 'protein':
      return day.totals.protein;
    case 'carbohydrates':
      return day.totals.carbohydrates;
    case 'fat':
      return day.totals.fat;
    case 'fibre':
      return day.totals.fibre;
    default:
      return 0;
  }
}
