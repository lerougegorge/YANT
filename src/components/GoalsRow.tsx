import type { FoodInstance } from '../db/types';
import { useEnabledGoals } from '../hooks/useGoals';
import { evaluateGoal, GOAL_MEASUREMENT_LABELS } from '../lib/goals';

function shortLabel(measurement: string): string {
  const map: Record<string, string> = {
    calories: 'Cal',
    protein: 'Protein',
    fat: 'Fat',
    carbohydrates: 'Carbs',
    fibre: 'Fibre',
    nova4Percent: 'UPF %',
    nova1Percent: 'Whole %',
    fiveADay: '5-a-day'
  };
  return map[measurement] ?? measurement;
}

export function GoalsRow({ instances }: { instances: FoodInstance[] }) {
  const goals = useEnabledGoals();
  if (goals.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      {goals.map((goal) => {
        const evalResult = evaluateGoal(goal, instances);
        if (goal.measurement === 'fiveADay') {
          const filled = Math.min(5, Math.round(evalResult.current));
          return (
            <div key={goal.id} className="flex flex-col items-center gap-1 shrink-0 px-2" title={GOAL_MEASUREMENT_LABELS[goal.measurement]}>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: i < filled ? '#16a34a' : 'var(--border)' }}
                  />
                ))}
              </div>
              <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                5-a-day
              </span>
            </div>
          );
        }

        const isBudget = goal.operator === '<=';
        const pct = goal.value > 0 ? Math.min(1, evalResult.current / goal.value) : 0;
        const warn = isBudget && !evalResult.met;

        return (
          <div key={goal.id} className="flex flex-col gap-1 shrink-0 px-2 min-w-[72px]" title={GOAL_MEASUREMENT_LABELS[goal.measurement]}>
            <div className="flex justify-between text-[10px]" style={{ color: 'var(--fg-muted)' }}>
              <span>{shortLabel(goal.measurement)}</span>
              <span style={{ color: warn ? '#dc2626' : undefined }}>
                {Math.round(evalResult.current)}
                {goal.measurement.includes('Percent') ? '%' : ''}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${pct * 100}%`, background: warn ? '#dc2626' : evalResult.met ? '#16a34a' : '#94a3b8' }}
              />
            </div>
            {evalResult.excludedPercent !== null && evalResult.excludedPercent > 10 && (
              <span className="text-[9px]" style={{ color: 'var(--fg-muted)' }}>
                {Math.round(evalResult.excludedPercent)}% unknown excluded
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
