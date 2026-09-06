import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { db } from '../db/db';
import type { FoodItem } from '../db/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSettings } from '../hooks/useSettings';
import { formatCalories } from '../lib/units';
import { useToast } from '../components/Toast';

type SortMode = 'alphabetical' | 'mostUsed' | 'recentlyAdded';
type FilterMode = 'all' | 'ai' | 'barcode' | 'manual';

const DELETE_WARNING_KEY = 'nutrition:foodItemDeleteWarned';

function FoodRow({ item }: { item: FoodItem }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const toast = useToast();
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);

  const isAi = item.source === 'ai-text' || item.source === 'ai-photo' || item.source === 'ai-label';

  async function handleDelete() {
    const snapshot = { ...item };
    await db.foodItems.delete(item.id);
    if (!localStorage.getItem(DELETE_WARNING_KEY)) {
      localStorage.setItem(DELETE_WARNING_KEY, '1');
      toast.show('Deleted. Past log entries for this food are unaffected.', {
        label: 'Undo',
        onClick: () => db.foodItems.add(snapshot)
      });
    } else {
      toast.show('Deleted', { label: 'Undo', onClick: () => db.foodItems.add(snapshot) });
    }
  }

  return (
    <div className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        className="absolute right-0 top-0 h-full w-20 flex flex-col items-center justify-center gap-0.5 text-white text-xs font-medium tap-target"
        style={{ background: '#dc2626' }}
        onClick={handleDelete}
      >
        <Trash2 size={18} strokeWidth={1.75} />
        Delete
      </button>
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        style={{ background: 'var(--bg-elevated)', transform: `translateX(${dragX}px)`, transition: 'transform 150ms ease' }}
        onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
        onTouchMove={(e) => {
          if (startX.current === null) return;
          const dx = e.touches[0].clientX - startX.current;
          setDragX(Math.min(0, Math.max(-80, dx)));
        }}
        onTouchEnd={() => setDragX((x) => (x < -36 ? -80 : 0))}
        onClick={() => (dragX === 0 ? navigate(`/foods/${item.id}`) : setDragX(0))}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{item.description}</span>
            {isAi && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                AI
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {formatCalories(item.caloriesPerServing, settings.calorieUnits)} · {item.servingDescription}
          </div>
        </div>
      </button>
    </div>
  );
}

export function FoodsScreen() {
  const items = useLiveQuery(() => db.foodItems.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('alphabetical');
  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'ai') list = list.filter((i) => i.source.startsWith('ai-'));
    else if (filter === 'barcode') list = list.filter((i) => i.source === 'openfoodfacts');
    else if (filter === 'manual') list = list.filter((i) => i.source === 'manual');

    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => i.description.toLowerCase().includes(q));

    const sorted = [...list];
    if (sort === 'alphabetical') sorted.sort((a, b) => a.description.localeCompare(b.description));
    else if (sort === 'mostUsed') sorted.sort((a, b) => b.useCount - a.useCount);
    else sorted.sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
  }, [items, query, sort, filter]);

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Foods" back="back" />
      <div className="p-3 flex flex-col gap-2">
        <input
          className="w-full rounded-lg border bg-transparent px-3 py-2 tap-target"
          style={{ borderColor: 'var(--border)' }}
          placeholder="Search foods"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto text-xs">
          <select className="rounded-lg border bg-transparent px-2 py-1.5 tap-target" style={{ borderColor: 'var(--border)' }} value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="alphabetical">Alphabetical</option>
            <option value="mostUsed">Most used</option>
            <option value="recentlyAdded">Recently added</option>
          </select>
          <select className="rounded-lg border bg-transparent px-2 py-1.5 tap-target" style={{ borderColor: 'var(--border)' }} value={filter} onChange={(e) => setFilter(e.target.value as FilterMode)}>
            <option value="all">All</option>
            <option value="ai">AI-estimated</option>
            <option value="barcode">From barcode</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--fg-muted)' }}>
            No foods yet.
          </p>
        ) : (
          filtered.map((item) => <FoodRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
