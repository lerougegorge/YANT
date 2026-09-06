import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ScanBarcode, Sparkles, Zap } from 'lucide-react';
import { db } from '../db/db';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSheets } from '../components/SheetContext';
import { getTimeBasedSuggestions, searchFoodItems } from '../lib/suggestions';
import { formatCalories } from '../lib/units';
import { useSettings } from '../hooks/useSettings';

export function AddScreen() {
  const navigate = useNavigate();
  const { openLogSheet } = useSheets();
  const settings = useSettings();
  const [query, setQuery] = useState('');

  const now = useMemo(() => new Date(), []);
  const recentSuggestions = useLiveQuery(() => getTimeBasedSuggestions(now), [now]) ?? [];
  const allItems = useLiveQuery(() => db.foodItems.toArray(), []) ?? [];

  const trimmed = query.trim();
  const searchResults = trimmed ? searchFoodItems(trimmed, allItems) : [];
  const suggestions = trimmed ? searchResults : recentSuggestions;
  const noMatch = trimmed.length > 0 && searchResults.length === 0;

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Add food" back="back" />

      <div className="p-3">
        <input
          autoFocus
          type="text"
          placeholder="What did you eat?"
          className="w-full rounded-lg border px-3 py-3 bg-transparent text-base tap-target"
          style={{ borderColor: 'var(--border)' }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {!trimmed && suggestions.length > 0 && (
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
            Recent around this time
          </div>
        )}
        <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
          {suggestions.map((item) => (
            <button
              key={item.id}
              className="flex items-center justify-between py-3 text-left tap-target"
              onClick={() => openLogSheet(item)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{item.description}</div>
                <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
                  {item.servingDescription}
                </div>
              </div>
              <div className="text-sm shrink-0 pl-2">{formatCalories(item.caloriesPerServing, settings.calorieUnits)}</div>
            </button>
          ))}
          {noMatch && (
            <button
              className="flex items-center py-3 text-left tap-target"
              onClick={() => navigate('/add/quick', { state: { description: trimmed } })}
            >
              <span className="text-sm">
                Quick add "<span className="font-medium">{trimmed}</span>"
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3 safe-bottom">
        <button
          className="flex flex-col items-center gap-1 rounded-xl py-3 tap-target"
          style={{ border: '1px solid var(--border)' }}
          onClick={() => navigate('/add/ai', { state: { description: trimmed } })}
        >
          <Sparkles size={22} strokeWidth={1.75} />
          <span className="text-xs font-medium">AI</span>
        </button>
        <button
          className="flex flex-col items-center gap-1 rounded-xl py-3 tap-target"
          style={{ border: '1px solid var(--border)' }}
          onClick={() => navigate('/add/quick', { state: { description: trimmed } })}
        >
          <Zap size={22} strokeWidth={1.75} />
          <span className="text-xs font-medium">Quick Add</span>
        </button>
        <button
          className="flex flex-col items-center gap-1 rounded-xl py-3 tap-target"
          style={{ border: '1px solid var(--border)' }}
          onClick={() => navigate('/add/barcode')}
        >
          <ScanBarcode size={22} strokeWidth={1.75} />
          <span className="text-xs font-medium">Barcode</span>
        </button>
      </div>
    </div>
  );
}
