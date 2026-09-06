import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import { SCHEMA_VERSION, type ColumnKey, type Goal, type GoalMeasurement, type GoalOperator, type Meal, type ModelInfo } from '../db/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/BottomSheet';
import { useSettings, updateSettings } from '../hooks/useSettings';
import { useMeals } from '../hooks/useMeals';
import { useGoals } from '../hooks/useGoals';
import { GOAL_MEASUREMENT_LABELS } from '../lib/goals';
import { COLUMN_LABELS } from '../lib/columns';
import { fetchModelList, testApiKey } from '../lib/openrouter';
import { countInstancesForMeal, renameMealInInstances } from '../lib/meals';
import { buildExport, buildInstancesCsv, downloadCsv, downloadJson, exportFilename, importMerge, importReplace, parseImportFile } from '../lib/backup';
import { useToast } from '../components/Toast';

const ALL_COLUMNS: ColumnKey[] = ['calories', 'caloriesKJ', 'protein', 'fibre', 'carbohydrates', 'fat'];
const ALL_MEASUREMENTS: GoalMeasurement[] = ['calories', 'protein', 'fat', 'carbohydrates', 'fibre', 'nova4Percent', 'nova1Percent', 'fiveADay'];

function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function SettingsScreen() {
  const settings = useSettings();
  const meals = useMeals();
  const goals = useGoals();

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Settings" back="back" />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 pb-16">
        <Section title="Appearance">
          <Field label="Theme">
            <select className="select" value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as typeof settings.theme })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Weight units">
            <select className="select" value={settings.weightUnits} onChange={(e) => updateSettings({ weightUnits: e.target.value as typeof settings.weightUnits })}>
              <option value="metric">Metric (g)</option>
              <option value="oz">Ounces</option>
            </select>
          </Field>
          <Field label="Calorie units">
            <select className="select" value={settings.calorieUnits} onChange={(e) => updateSettings({ calorieUnits: e.target.value as typeof settings.calorieUnits })}>
              <option value="cal">Calories</option>
              <option value="kJ">Kilojoules</option>
            </select>
          </Field>
        </Section>

        <Section title="Home columns">
          <div className="flex flex-col gap-1">
            {ALL_COLUMNS.map((col) => {
              const enabled = settings.columns.includes(col);
              const idx = settings.columns.indexOf(col);
              return (
                <div key={col} className="flex items-center justify-between py-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="tap-target"
                      checked={enabled}
                      onChange={(e) => {
                        const next = e.target.checked ? [...settings.columns, col] : settings.columns.filter((c) => c !== col);
                        updateSettings({ columns: next });
                      }}
                    />
                    {COLUMN_LABELS[col]}
                  </label>
                  {enabled && (
                    <ReorderButtons
                      onUp={() => updateSettings({ columns: move(settings.columns, idx, -1) })}
                      onDown={() => updateSettings({ columns: move(settings.columns, idx, 1) })}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
            On narrow screens, only the first three enabled columns are shown.
          </p>
        </Section>

        <MealsSection meals={meals} />
        <GoalsSection goals={goals} />
        <OpenRouterSection settingsKey={settings.openRouterKey} />
        <ModelsSection />
        <Section title="Open Food Facts">
          <label className="flex items-center justify-between text-sm">
            <span>Enable barcode lookups</span>
            <input type="checkbox" className="tap-target" checked={settings.offEnabled} onChange={(e) => updateSettings({ offEnabled: e.target.checked })} />
          </label>
        </Section>

        <BackupSection />

        <Section title="About">
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            Nutrition Tracker v0.1.0 · MIT Licence
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}>
            Nutrition data for packaged goods from{' '}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline">
              Open Food Facts
            </a>
            , available under the{' '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer" className="underline">
              Open Database Licence
            </a>
            .
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}>
            What leaves this device: description text and any attached photo go to OpenRouter (and the model provider it routes to) when you run an analysis; barcodes go to Open Food Facts when you look one up. Nothing else, ever. Photos are never stored — they exist in memory only for the duration of a call.
          </p>
        </Section>

        <DangerZone />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span>{label}</span>
      {children}
    </div>
  );
}

function ReorderButtons({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex gap-1">
      <button className="tap-target flex items-center justify-center" onClick={onUp} aria-label="Move up">
        <ChevronUp size={16} strokeWidth={1.75} />
      </button>
      <button className="tap-target flex items-center justify-center" onClick={onDown} aria-label="Move down">
        <ChevronDown size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function MealsSection({ meals }: { meals: Meal[] }) {
  const [renamePrompt, setRenamePrompt] = useState<{ id: string; oldName: string; newName: string; count: number } | null>(null);
  const toast = useToast();

  async function handleRenameCommit(id: string, oldName: string, newName: string) {
    if (oldName === newName) return;
    const count = await countInstancesForMeal(oldName);
    await db.meals.update(id, { name: newName, updatedAt: Date.now() });
    if (count > 0) setRenamePrompt({ id, oldName, newName, count });
  }

  async function addMeal() {
    const now = Date.now();
    await db.meals.add({ id: crypto.randomUUID(), name: 'New meal', defaultStart: null, defaultEnd: null, sortOrder: meals.length, createdAt: now, updatedAt: now });
  }

  return (
    <Section title="Meals">
      <div className="flex flex-col gap-2">
        {[...meals]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((meal, idx) => (
            <div key={meal.id} className="flex items-center gap-2 rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
              <input
                className="flex-1 min-w-0 rounded border bg-transparent px-2 py-1 text-sm tap-target"
                style={{ borderColor: 'var(--border)' }}
                defaultValue={meal.name}
                onBlur={(e) => handleRenameCommit(meal.id, meal.name, e.target.value.trim() || meal.name)}
              />
              <input
                type="time"
                className="rounded border bg-transparent px-1 py-1 text-xs tap-target w-20"
                style={{ borderColor: 'var(--border)' }}
                value={meal.defaultStart ?? ''}
                onChange={(e) => db.meals.update(meal.id, { defaultStart: e.target.value || null, updatedAt: Date.now() })}
              />
              <input
                type="time"
                className="rounded border bg-transparent px-1 py-1 text-xs tap-target w-20"
                style={{ borderColor: 'var(--border)' }}
                value={meal.defaultEnd ?? ''}
                onChange={(e) => db.meals.update(meal.id, { defaultEnd: e.target.value || null, updatedAt: Date.now() })}
              />
              <ReorderButtons onUp={() => db.meals.update(meal.id, { sortOrder: idx - 1 })} onDown={() => db.meals.update(meal.id, { sortOrder: idx + 1 })} />
              <button
                className="tap-target flex items-center justify-center"
                style={{ color: '#dc2626' }}
                aria-label="Remove meal"
                onClick={async () => {
                  await db.meals.delete(meal.id);
                  toast.show('Meal removed');
                }}
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        <button className="text-sm font-medium text-left" style={{ color: '#16a34a' }} onClick={addMeal}>
          + Add meal
        </button>
      </div>

      {renamePrompt && (
        <div className="rounded-lg p-3 text-sm flex flex-col gap-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <span>
            Also rename this meal in {renamePrompt.count} past {renamePrompt.count === 1 ? 'entry' : 'entries'}?
          </span>
          <div className="flex gap-3">
            <button
              className="font-semibold"
              style={{ color: '#16a34a' }}
              onClick={async () => {
                await renameMealInInstances(renamePrompt.oldName, renamePrompt.newName);
                setRenamePrompt(null);
                toast.show('Past entries updated');
              }}
            >
              Yes
            </button>
            <button style={{ color: 'var(--fg-muted)' }} onClick={() => setRenamePrompt(null)}>
              No
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function GoalsSection({ goals }: { goals: Goal[] }) {
  const availableMeasurements = ALL_MEASUREMENTS.filter((m) => !goals.some((g) => g.measurement === m));

  async function addGoal(measurement: GoalMeasurement) {
    const now = Date.now();
    const isFiveADay = measurement === 'fiveADay';
    await db.goals.add({
      id: crypto.randomUUID(),
      measurement,
      operator: isFiveADay ? '>=' : measurement === 'nova4Percent' ? '<=' : '>=',
      value: isFiveADay ? 5 : 0,
      enabled: true,
      sortOrder: goals.length,
      createdAt: now,
      updatedAt: now
    });
  }

  return (
    <Section title="Goals">
      <div className="flex flex-col gap-2">
        {goals.map((goal, idx) => (
          <div key={goal.id} className="flex items-center gap-2 rounded-lg p-2 text-sm" style={{ border: '1px solid var(--border)' }}>
            <span className="flex-1 min-w-0 truncate">{GOAL_MEASUREMENT_LABELS[goal.measurement]}</span>
            {goal.measurement !== 'fiveADay' && (
              <select
                className="text-xs rounded border bg-transparent px-1 py-1 tap-target"
                style={{ borderColor: 'var(--border)' }}
                value={goal.operator}
                onChange={(e) => db.goals.update(goal.id, { operator: e.target.value as GoalOperator, updatedAt: Date.now() })}
              >
                <option value=">=">At least</option>
                <option value="<=">At most</option>
              </select>
            )}
            {goal.measurement !== 'fiveADay' && (
              <input
                type="text"
                inputMode="decimal"
                className="w-16 rounded border bg-transparent px-1 py-1 text-xs tap-target"
                style={{ borderColor: 'var(--border)' }}
                defaultValue={goal.value}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) db.goals.update(goal.id, { value: n, updatedAt: Date.now() });
                }}
              />
            )}
            <input
              type="checkbox"
              className="tap-target"
              checked={goal.enabled}
              onChange={(e) => db.goals.update(goal.id, { enabled: e.target.checked, updatedAt: Date.now() })}
            />
            <ReorderButtons onUp={() => db.goals.update(goal.id, { sortOrder: idx - 1 })} onDown={() => db.goals.update(goal.id, { sortOrder: idx + 1 })} />
            <button className="tap-target flex items-center justify-center" style={{ color: '#dc2626' }} aria-label="Remove goal" onClick={() => db.goals.delete(goal.id)}>
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        ))}
        {availableMeasurements.length > 0 && (
          <select
            className="select"
            value=""
            onChange={(e) => e.target.value && addGoal(e.target.value as GoalMeasurement)}
          >
            <option value="">+ Add goal</option>
            {availableMeasurements.map((m) => (
              <option key={m} value={m}>
                {GOAL_MEASUREMENT_LABELS[m]}
              </option>
            ))}
          </select>
        )}
      </div>
    </Section>
  );
}

function OpenRouterSection({ settingsKey }: { settingsKey: string }) {
  const [draft, setDraft] = useState(settingsKey);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const touched = useRef(false);

  // `settings` loads asynchronously from IndexedDB, so the initial render sees an empty key;
  // sync it in once it arrives, but stop the moment the user starts typing their own value.
  useEffect(() => {
    if (!touched.current) setDraft(settingsKey);
  }, [settingsKey]);

  return (
    <Section title="OpenRouter">
      <input
        type="password"
        className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm tap-target"
        style={{ borderColor: 'var(--border)' }}
        placeholder="sk-or-..."
        value={draft}
        onChange={(e) => {
          touched.current = true;
          setDraft(e.target.value);
        }}
        onBlur={() => updateSettings({ openRouterKey: draft })}
      />
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
        Stored on this device only. Anyone with access to this unlocked device can read it — set a spend limit on the key.
      </p>
      <div className="flex items-center gap-3 text-sm">
        <button
          className="font-medium disabled:opacity-50"
          style={{ color: '#16a34a' }}
          disabled={testing || !draft}
          onClick={async () => {
            setTesting(true);
            const result = await testApiKey(draft);
            setTestResult(result.message);
            setTesting(false);
          }}
        >
          {testing ? 'Testing…' : 'Test key'}
        </button>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: 'var(--fg-muted)' }}>
          Manage keys
          <ExternalLink size={13} strokeWidth={1.75} />
        </a>
      </div>
      {testResult && (
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {testResult}
        </p>
      )}
    </Section>
  );
}

function ModelsSection() {
  const settings = useSettings();
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const toast = useToast();

  const orderedEstimateModels = settings.estimateModelOrder.map((id) => settings.models.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);

  async function refresh() {
    if (!settings.openRouterKey) {
      toast.show('Set an OpenRouter key first');
      return;
    }
    setRefreshing(true);
    try {
      const models = await fetchModelList(settings.openRouterKey);
      const stillValidOrder = settings.estimateModelOrder.filter((id) => models.some((m) => m.id === id));
      await updateSettings({ models, estimateModelOrder: stillValidOrder });
      toast.show(`Fetched ${models.length} models`);
    } catch {
      toast.show('Could not fetch model list');
    } finally {
      setRefreshing(false);
    }
  }

  function removeFromOrder(id: string) {
    updateSettings({ estimateModelOrder: settings.estimateModelOrder.filter((x) => x !== id) });
  }

  return (
    <Section title="Models">
      <div className="flex items-center gap-2">
        <button className="text-sm font-medium disabled:opacity-50" style={{ color: '#16a34a' }} disabled={refreshing} onClick={refresh}>
          {refreshing ? 'Refreshing…' : 'Refresh model list'}
        </button>
      </div>

      <div className="text-xs font-medium mt-1" style={{ color: 'var(--fg-muted)' }}>
        Estimate order (first = initial estimate)
      </div>
      {orderedEstimateModels.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          No models added yet.
        </p>
      )}
      <div className="flex flex-col gap-1">
        {orderedEstimateModels.map((m, idx) => (
          <div key={m.id} className="flex items-center justify-between gap-2 text-xs py-1">
            <span className="truncate flex-1">
              {idx + 1}. {m.name}
            </span>
            <ReorderButtons
              onUp={() => updateSettings({ estimateModelOrder: move(settings.estimateModelOrder, settings.estimateModelOrder.indexOf(m.id), -1) })}
              onDown={() => updateSettings({ estimateModelOrder: move(settings.estimateModelOrder, settings.estimateModelOrder.indexOf(m.id), 1) })}
            />
            <button className="tap-target flex items-center justify-center" style={{ color: '#dc2626' }} aria-label="Remove model" onClick={() => removeFromOrder(m.id)}>
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <button className="flex items-center gap-1 text-sm font-medium text-left" style={{ color: '#16a34a' }} onClick={() => setAddOpen(true)}>
        <Plus size={16} strokeWidth={1.75} />
        Add model
      </button>

      <div className="text-xs font-medium mt-2" style={{ color: 'var(--fg-muted)' }}>
        Label transcription model
      </div>
      <select className="select" value={settings.labelModel ?? ''} onChange={(e) => updateSettings({ labelModel: e.target.value || null })}>
        <option value="">Not set</option>
        {settings.models
          .filter((m) => m.supportsImages)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>

      {addOpen && (
        <AddModelModal
          models={settings.models}
          alreadyAdded={settings.estimateModelOrder}
          onAdd={(id) => updateSettings({ estimateModelOrder: [...settings.estimateModelOrder, id] })}
          onClose={() => setAddOpen(false)}
        />
      )}
    </Section>
  );
}

function AddModelModal({
  models,
  alreadyAdded,
  onAdd,
  onClose
}: {
  models: ModelInfo[];
  alreadyAdded: string[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const toast = useToast();
  const available = models.filter((m) => !alreadyAdded.includes(m.id) && m.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <BottomSheet title="Add model" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm tap-target"
          style={{ borderColor: 'var(--border)' }}
          placeholder="Search models"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex flex-col divide-y max-h-[55vh] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
          {available.map((m) => (
            <button
              key={m.id}
              className="flex items-center justify-between gap-2 py-3 text-left text-sm tap-target"
              onClick={() => {
                onAdd(m.id);
                toast.show(`Added ${m.name}`);
              }}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{m.name}</span>
                {m.supportsImages && <ImageIcon size={14} strokeWidth={1.75} aria-label="Supports images" style={{ color: 'var(--fg-muted)' }} />}
              </span>
              <span className="text-xs shrink-0" style={{ color: 'var(--fg-muted)' }}>
                ${(m.promptPrice * 1e6).toFixed(2)}/${(m.completionPrice * 1e6).toFixed(2)} per M
              </span>
            </button>
          ))}
          {available.length === 0 && (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--fg-muted)' }}>
              {models.length === 0 ? 'No models yet — refresh the model list first.' : 'No matching models.'}
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function BackupSection() {
  const toast = useToast();
  const [includeKey, setIncludeKey] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Awaited<ReturnType<typeof parseImportFile>> | null>(null);
  const [replaceConfirmText, setReplaceConfirmText] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace' | null>(null);

  async function handleExportJson() {
    const data = await buildExport(includeKey);
    downloadJson(data, exportFilename());
    toast.show('Exported');
  }

  async function handleExportCsv() {
    const csv = await buildInstancesCsv();
    downloadCsv(csv, exportFilename().replace('.json', '.csv'));
    toast.show('Exported CSV');
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const parsed = parseImportFile(json);
      setPendingImport(parsed);
      setImportSummary(
        `${parsed.counts.foodItems} foods, ${parsed.counts.foodInstances} log entries, ${parsed.counts.goals} goals, ${parsed.counts.meals} meals.`
      );
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not read file');
    }
  }

  return (
    <Section title="Export / Import">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="tap-target" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />
        Include OpenRouter key in export
      </label>
      <div className="flex gap-3 text-sm">
        <button className="font-medium" style={{ color: '#16a34a' }} onClick={handleExportJson}>
          Export JSON
        </button>
        <button className="font-medium" style={{ color: '#16a34a' }} onClick={handleExportCsv}>
          Export CSV
        </button>
      </div>

      <label className="text-sm font-medium" style={{ color: '#16a34a' }}>
        Import file
        <input type="file" accept="application/json" className="hidden" onChange={handleFileSelected} />
      </label>

      {pendingImport && (
        <div className="rounded-lg p-3 text-sm flex flex-col gap-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <span>{importSummary}</span>
          <div className="flex gap-3">
            <button
              className="font-medium"
              style={{ color: '#16a34a' }}
              onClick={async () => {
                const summary = await importMerge(pendingImport.file);
                toast.show(`Added ${summary.foodItemsAdded} foods, ${summary.foodInstancesAdded} entries`);
                setPendingImport(null);
              }}
            >
              Merge
            </button>
            <button className="font-medium" style={{ color: '#dc2626' }} onClick={() => setMode('replace')}>
              Replace all
            </button>
            <button style={{ color: 'var(--fg-muted)' }} onClick={() => setPendingImport(null)}>
              Cancel
            </button>
          </div>

          {mode === 'replace' && (
            <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span>Type REPLACE to wipe existing data and restore from this file.</span>
              <input
                className="rounded border bg-transparent px-2 py-1 text-sm tap-target"
                style={{ borderColor: 'var(--border)' }}
                value={replaceConfirmText}
                onChange={(e) => setReplaceConfirmText(e.target.value)}
              />
              <button
                className="font-medium disabled:opacity-50 text-left"
                style={{ color: '#dc2626' }}
                disabled={replaceConfirmText !== 'REPLACE'}
                onClick={async () => {
                  await importReplace(pendingImport.file);
                  toast.show('Data replaced');
                  setPendingImport(null);
                  setMode(null);
                  setReplaceConfirmText('');
                }}
              >
                Confirm replace
              </button>
            </div>
          )}
        </div>
      )}
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
        Schema version {SCHEMA_VERSION}. Back up regularly — there is no server copy.
      </p>
    </Section>
  );
}

function DangerZone() {
  const [confirmText, setConfirmText] = useState('');
  const toast = useToast();

  async function handleDeleteAll() {
    await db.transaction('rw', db.foodItems, db.foodInstances, db.goals, db.meals, async () => {
      await Promise.all([db.foodItems.clear(), db.foodInstances.clear(), db.goals.clear(), db.meals.clear()]);
    });
    toast.show('All data deleted');
    setConfirmText('');
  }

  return (
    <Section title="Danger zone">
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
        Type DELETE to permanently remove all foods, logs, goals and meals from this device.
      </p>
      <input
        className="rounded-lg border bg-transparent px-3 py-2 text-sm tap-target"
        style={{ borderColor: 'var(--border)' }}
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
      />
      <button
        className="rounded-lg py-2 text-sm font-semibold text-white tap-target disabled:opacity-50"
        style={{ background: '#dc2626' }}
        disabled={confirmText !== 'DELETE'}
        onClick={handleDeleteAll}
      >
        Delete all data
      </button>
    </Section>
  );
}
