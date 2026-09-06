import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, UtensilsCrossed } from 'lucide-react';
import { db } from '../db/db';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { dayBounds, formatDayHeader, fromDateInputValue, isSameDay, addDays, toDateInputValue } from '../lib/date';
import { groupByMeal, computeTotals } from '../lib/grouping';
import { visibleColumns, COLUMN_LABELS } from '../lib/columns';
import { formatNutrient, kcalToDisplay } from '../lib/units';
import { requestPersistentStorage } from '../db/db';
import { GoalsRow } from '../components/GoalsRow';
import { InstanceRow } from '../components/InstanceRow';
import { SideMenu } from '../components/SideMenu';

function totalColumnValue(totals: ReturnType<typeof computeTotals>, column: string): string {
  switch (column) {
    case 'calories':
      return String(Math.round(totals.calories));
    case 'caloriesKJ':
      return String(Math.round(kcalToDisplay(totals.calories, 'kJ') ?? 0));
    case 'protein':
      return formatNutrient(totals.protein).replace(' g', '');
    case 'fibre':
      return formatNutrient(totals.fibre).replace(' g', '');
    case 'carbohydrates':
      return formatNutrient(totals.carbohydrates).replace(' g', '');
    case 'fat':
      return formatNutrient(totals.fat).replace(' g', '');
    default:
      return '';
  }
}

export function HomeScreen() {
  const navigate = useNavigate();
  const [date, setDate] = useState(() => new Date());
  const meals = useMeals();
  const settings = useSettings();
  const narrow = useMediaQuery('(max-width: 480px)');
  const dateInputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);

  const { start, end } = useMemo(() => dayBounds(date), [date]);
  const instances = useLiveQuery(() => db.foodInstances.where('timestamp').between(start, end).toArray(), [start, end]);

  const columns = visibleColumns(settings.columns, narrow);
  const groups = useMemo(() => groupByMeal(instances ?? [], meals), [instances, meals]);
  const dayTotals = useMemo(() => computeTotals(instances ?? []), [instances]);

  const isToday = isSameDay(date, new Date());

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 60) setDate((d) => addDays(d, dx < 0 ? 1 : -1));
  }

  useMemo(() => {
    requestPersistentStorage();
  }, []);

  return (
    <div className="flex flex-col min-h-full pb-24">
      <div className="sticky top-0 z-10 safe-top" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center justify-between px-2 py-1.5">
          <SideMenu />
          <div className="flex items-center gap-1">
            <button className="tap-target flex items-center justify-center" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day">
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
            <button className="flex flex-col items-center px-1" onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}>
              <span className="font-semibold">{formatDayHeader(date)}</span>
              {!isToday && (
                <span
                  className="text-xs mt-0.5 px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDate(new Date());
                  }}
                >
                  Today
                </span>
              )}
              <input
                ref={dateInputRef}
                type="date"
                className="sr-only"
                value={toDateInputValue(date)}
                onChange={(e) => e.target.value && setDate(fromDateInputValue(e.target.value))}
              />
            </button>
            <button className="tap-target flex items-center justify-center" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Next day">
              <ChevronRight size={20} strokeWidth={1.75} />
            </button>
          </div>
          <div className="tap-target" />
        </div>
        <GoalsRow instances={instances ?? []} />
      </div>

      {(instances ?? []).length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-medium" style={{ color: 'var(--fg-muted)' }}>
          <div className="flex-1" />
          {columns.map((c) => (
            <div key={c} className="w-10 text-right">
              {COLUMN_LABELS[c]}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {(instances ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 px-6 text-center">
            <UtensilsCrossed size={40} strokeWidth={1.5} style={{ color: 'var(--fg-muted)' }} />
            <p style={{ color: 'var(--fg-muted)' }}>Tap + to log your first food.</p>
          </div>
        ) : (
          <div>
            {groups.map((group) => (
              <div key={group.mealName ?? '__other'} className="pb-3">
                {group.items.map((instance) => (
                  <InstanceRow key={instance.id} instance={instance} columns={columns} />
                ))}
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold" style={{ color: 'var(--fg-muted)' }}>
                  <div className="flex-1 truncate">{group.mealName ?? 'Other'}</div>
                  {columns.map((c) => (
                    <div key={c} className="w-10 text-right tabular-nums">
                      {totalColumnValue(group.totals, c)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(instances ?? []).length > 0 && (
        <div
          className="sticky bottom-0 flex items-center gap-2 px-3 py-2 text-sm font-semibold safe-bottom"
          style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}
        >
          <div className="flex-1">Total</div>
          {columns.map((c) => (
            <div key={c} className="w-10 text-right tabular-nums">
              {totalColumnValue(dayTotals, c)}
            </div>
          ))}
        </div>
      )}

      <button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full text-white shadow-lg flex items-center justify-center z-30"
        style={{ background: '#16a34a' }}
        onClick={() => navigate('/add')}
        aria-label="Add food"
      >
        <Plus size={28} strokeWidth={2} />
      </button>
    </div>
  );
}
