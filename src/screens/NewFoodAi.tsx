import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Image as ImageIcon, Sparkles, Tag, X } from 'lucide-react';
import { db } from '../db/db';
import type { FoodSource, NovaGroup } from '../db/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { NumberField } from '../components/NumberField';
import { NovaSegmented } from '../components/NovaSegmented';
import { MealSelect } from '../components/MealSelect';
import { AmountControl } from '../components/AmountControl';
import { FoodItemForm, emptyFoodFormState, toPer100g, type FoodFormState } from '../components/FoodItemForm';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { useDefaultMeal } from '../hooks/useDefaultMeal';
import { useSheets } from '../components/SheetContext';
import { defaultLogTime } from '../lib/date';
import { AiCallError, callFoodEstimate, callLabelTranscription, downscaleImageToDataUrl, estimateCallCost, type CallUsage } from '../lib/openrouter';
import type { NutrientField } from '../lib/aiSchema';
import { emptyLocks, mergeResponses, totalCost, type ContributingResponse, type FailedResponse, type LockedFields } from '../lib/merge';
import { useToast } from '../components/Toast';

type AiMode = 'analyse' | 'label';

const NUTRIENT_LABELS: Record<NutrientField, string> = {
  calories: 'Calories',
  protein: 'Protein',
  fat: 'Fat',
  carbohydrates: 'Carbohydrates',
  fibre: 'Fibre'
};

const AI_MODE_OPTIONS: { value: AiMode; label: string; icon: typeof Sparkles }[] = [
  { value: 'analyse', label: 'Analyse food', icon: Sparkles },
  { value: 'label', label: 'Scan label', icon: Tag }
];

/** Analyse food vs. scan a label are different tasks (estimation vs. transcription — see the
 * AI Integration section) reached from one entry point. Photo analysis is the dominant case,
 * so this is a lightweight toggle with a sticky default, not a screen you must answer first. */
function AiModeToggle({ mode, onChange }: { mode: AiMode; onChange: (m: AiMode) => void }) {
  return (
    <div className="flex rounded-lg p-1 gap-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} role="group" aria-label="AI mode">
      {AI_MODE_OPTIONS.map((opt) => {
        const active = opt.value === mode;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium tap-target"
            style={{ background: active ? '#16a34a' : 'transparent', color: active ? 'white' : 'var(--fg)' }}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            <Icon size={15} strokeWidth={1.75} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function NewFoodAiScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const meals = useMeals();
  const settings = useSettings();
  const toast = useToast();
  const { openLogSheet } = useSheets();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const labelCameraInputRef = useRef<HTMLInputElement>(null);
  const labelLibraryInputRef = useRef<HTMLInputElement>(null);

  const navState = location.state as { description?: string; day?: number } | null;
  const prefillDescription = navState?.description ?? '';
  const day = navState?.day;

  const nowDate = useMemo(() => defaultLogTime(navState?.day !== undefined ? new Date(navState.day) : new Date()), [navState?.day]);

  // Photo analysis is the overwhelming majority of AI use; label scanning is a distinct task
  // (transcription, not estimation — see the AI Integration section of the spec) reached from
  // the same entry point. Defaulting here to 'analyse' means the common case is unchanged from
  // before this toggle existed.
  const [mode, setMode] = useState<AiMode>('analyse');

  // --- Label scan state (mode === 'label') ---
  const [labelPhase, setLabelPhase] = useState<'capture' | 'form'>('capture');
  const [labelForm, setLabelForm] = useState<FoodFormState>(emptyFoodFormState());
  const [labelAdvancedOpen, setLabelAdvancedOpen] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelMatchPrompt, setLabelMatchPrompt] = useState<{ existingId: string; andLog: boolean } | null>(null);

  async function handleLabelPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const model = settings.models.find((m) => m.id === settings.labelModel);
    if (!model) {
      toast.show('Set a label transcription model in Settings first');
      return;
    }
    setLabelLoading(true);
    setLabelError(null);
    try {
      const dataUrl = await downscaleImageToDataUrl(file);
      const result = await callLabelTranscription({
        apiKey: settings.openRouterKey,
        model,
        imageBase64: dataUrl,
        productDescription: labelForm.description || undefined
      });
      const d = result.data;
      setLabelForm((f) => ({
        ...f,
        description: d.description || f.description,
        servingDescription: d.servingDescription || f.servingDescription,
        servingGrams: d.servingGrams ?? f.servingGrams,
        perServing: {
          calories: d.perServing.calories,
          protein: d.perServing.protein,
          fibre: d.perServing.fibre,
          carbohydrates: d.perServing.carbohydrates,
          fat: d.perServing.fat
        },
        per100gDisplay: {
          calories: d.per100g.calories,
          protein: d.per100g.protein,
          fibre: d.per100g.fibre,
          carbohydrates: d.per100g.carbohydrates,
          fat: d.per100g.fat
        },
        units: { calories: '100g', protein: '100g', fibre: '100g', carbohydrates: '100g', fat: '100g' },
        novaGroup: d.novaGroup ?? f.novaGroup,
        fruitVeg: d.fruitVeg ?? f.fruitVeg
      }));
      setLabelPhase('form');
    } catch (err) {
      setLabelError(err instanceof AiCallError ? describeReason(err) : 'unknown error');
    } finally {
      setLabelLoading(false);
    }
  }

  async function handleLabelSave(andLog: boolean) {
    setLabelSaving(true);
    try {
      const trimmedDescription = labelForm.description.trim() || 'Unnamed product';
      if (!labelMatchPrompt) {
        const existing = await db.foodItems.where('description').equalsIgnoreCase(trimmedDescription).first();
        if (existing) {
          setLabelMatchPrompt({ existingId: existing.id, andLog });
          setLabelSaving(false);
          return;
        }
      }
      const andLogResolved = labelMatchPrompt ? labelMatchPrompt.andLog : andLog;
      const now = Date.now();
      const itemData = {
        description: trimmedDescription,
        servingDescription: labelForm.servingDescription.trim() || '1 serving',
        caloriesPerServing: labelForm.perServing.calories ?? 0,
        proteinPerServing: labelForm.perServing.protein,
        fatPerServing: labelForm.perServing.fat,
        carbohydratesPerServing: labelForm.perServing.carbohydrates,
        fibrePerServing: labelForm.perServing.fibre,
        caloriesPer100g: toPer100g(labelForm.per100gDisplay.calories, labelForm.units.calories),
        proteinPer100g: toPer100g(labelForm.per100gDisplay.protein, labelForm.units.protein),
        fatPer100g: toPer100g(labelForm.per100gDisplay.fat, labelForm.units.fat),
        carbohydratesPer100g: toPer100g(labelForm.per100gDisplay.carbohydrates, labelForm.units.carbohydrates),
        fibrePer100g: toPer100g(labelForm.per100gDisplay.fibre, labelForm.units.fibre),
        novaGroup: labelForm.novaGroup,
        fruitVeg: labelForm.fruitVeg,
        servingGrams: labelForm.servingGrams,
        source: 'ai-label' as FoodSource,
        updatedAt: now
      };

      let id: string;
      if (labelMatchPrompt) {
        id = labelMatchPrompt.existingId;
        await db.foodItems.update(id, itemData);
      } else {
        id = crypto.randomUUID();
        await db.foodItems.add({ id, createdAt: now, barcode: null, servings: null, notes: null, useCount: 0, lastUsedAt: null, ...itemData });
      }
      if (andLogResolved) {
        const item = await db.foodItems.get(id);
        if (item) openLogSheet(item, day);
      } else {
        toast.show('Saved');
      }
      navigate(-1);
    } finally {
      setLabelSaving(false);
    }
  }

  // --- Query phase state ---
  const [description, setDescription] = useState(prefillDescription);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableModels = useMemo(() => {
    const byId = new Map(settings.models.map((m) => [m.id, m]));
    return settings.estimateModelOrder.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
  }, [settings.models, settings.estimateModelOrder]);

  const eligibleModels = useMemo(
    () => availableModels.filter((m) => (photoDataUrl ? m.supportsImages : true)),
    [availableModels, photoDataUrl]
  );

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const effectiveModelId = selectedModelId && eligibleModels.some((m) => m.id === selectedModelId) ? selectedModelId : eligibleModels[0]?.id ?? null;
  const selectedModel = eligibleModels.find((m) => m.id === effectiveModelId) ?? null;

  // --- Results phase state ---
  const [phase, setPhase] = useState<'query' | 'results'>('query');
  const [contributing, setContributing] = useState<ContributingResponse[]>([]);
  const [failedAttempts, setFailedAttempts] = useState<FailedResponse[]>([]);
  const [locks, setLocks] = useState<LockedFields>(emptyLocks());
  const [lockedValues, setLockedValues] = useState<{
    description?: string;
    servingDescription?: string;
    servings?: number;
    totalWeightGrams?: number | null;
    servingGrams?: number | null;
    novaGroup?: NovaGroup;
    fruitVeg?: boolean;
    per100g?: Partial<Record<NutrientField, number | null>>;
  }>({});
  const [amount, setAmount] = useState(1);
  const [amountUnit, setAmountUnit] = useState<'servings' | 'grams'>('servings');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [strippedExpanded, setStrippedExpanded] = useState(false);
  const [addToFoods, setAddToFoods] = useState(true);
  const [secondOpinionError, setSecondOpinionError] = useState<string | null>(null);
  const [secondOpinionLoading, setSecondOpinionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matchPrompt, setMatchPrompt] = useState<{ existingId: string } | null>(null);
  const [meal, setMeal] = useDefaultMeal(meals, nowDate);

  const merged = useMemo(() => {
    if (contributing.length === 0) return null;
    return mergeResponses(contributing, locks, lockedValues);
  }, [contributing, locks, lockedValues]);

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const hasKey = settings.openRouterKey.trim().length > 0;

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await downscaleImageToDataUrl(file);
    setPhotoDataUrl(dataUrl);
  }

  async function handleAnalyse() {
    if (!selectedModel) {
      setErrorMessage('No eligible model is configured. Add one in Settings.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await callFoodEstimate({
        apiKey: settings.openRouterKey,
        model: selectedModel,
        description,
        imageBase64: photoDataUrl
      });
      setContributing([{ modelId: result.modelId, modelName: selectedModel.name, data: result.data, usage: result.usage }]);
      setPhase('results');
      // Amount defaults to one serving as returned.
      setAmount(1);
      setAmountUnit('servings');
    } catch (err) {
      const reason = err instanceof AiCallError ? describeReason(err) : 'unknown error';
      setErrorMessage(reason);
    } finally {
      setLoading(false);
    }
  }

  const usedModelIds = new Set([...contributing.map((c) => c.modelId), ...failedAttempts.map((f) => f.modelId)]);
  const remainingModels = availableModels.filter((m) => !usedModelIds.has(m.id) && (photoDataUrl ? m.supportsImages : true));
  const nextModel = remainingModels[0] ?? null;

  async function handleSecondOpinion(modelIdOverride?: string) {
    const model = modelIdOverride ? settings.models.find((m) => m.id === modelIdOverride) : nextModel;
    if (!model) return;
    setSecondOpinionLoading(true);
    setSecondOpinionError(null);
    try {
      const result = await callFoodEstimate({ apiKey: settings.openRouterKey, model, description, imageBase64: photoDataUrl });
      setContributing((c) => [...c, { modelId: result.modelId, modelName: model.name, data: result.data, usage: result.usage }]);
    } catch (err) {
      const reason = err instanceof AiCallError ? describeReason(err) : 'unknown error';
      setFailedAttempts((f) => [...f, { modelId: model.id, modelName: model.name, error: reason }]);
      setSecondOpinionError(reason);
    } finally {
      setSecondOpinionLoading(false);
    }
  }

  function lockPer100g(field: NutrientField, per100gValue: number) {
    setLocks((l) => ({ ...l, per100g: { ...l.per100g, [field]: true } }));
    setLockedValues((v) => ({ ...v, per100g: { ...v.per100g, [field]: per100gValue } }));
  }

  function editPrimaryField(field: NutrientField, perServingValue: number | null) {
    if (perServingValue === null || !merged) return;
    const servingGrams = merged.servingGrams ?? 100;
    lockPer100g(field, (perServingValue * 100) / servingGrams);
  }

  function editAdvancedField(field: NutrientField, per100gValue: number | null) {
    if (per100gValue === null) return;
    lockPer100g(field, per100gValue);
  }

  if (mode === 'label') {
    return (
      <div className="flex flex-col min-h-full">
        <ScreenHeader title="New Food from AI" back="back" />
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <AiModeToggle mode={mode} onChange={setMode} />

          {labelPhase === 'capture' ? (
            <>
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                Take or upload a photo of the nutrition panel. The model reads the printed values — it won't estimate anything it can't see.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="flex items-center justify-center gap-2 rounded-lg py-3 tap-target text-sm font-medium disabled:opacity-50"
                  style={{ border: '1px solid var(--border)' }}
                  disabled={labelLoading}
                  onClick={() => labelCameraInputRef.current?.click()}
                >
                  <Camera size={18} strokeWidth={1.75} />
                  {labelLoading ? 'Reading…' : 'Take photo'}
                </button>
                <button
                  className="flex items-center justify-center gap-2 rounded-lg py-3 tap-target text-sm font-medium disabled:opacity-50"
                  style={{ border: '1px solid var(--border)' }}
                  disabled={labelLoading}
                  onClick={() => labelLibraryInputRef.current?.click()}
                >
                  <ImageIcon size={18} strokeWidth={1.75} />
                  {labelLoading ? 'Reading…' : 'Upload photo'}
                </button>
              </div>
              <input ref={labelCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleLabelPhoto} />
              <input ref={labelLibraryInputRef} type="file" accept="image/*" className="hidden" onChange={handleLabelPhoto} />
              {!settings.openRouterKey && (
                <div className="rounded-lg p-3 text-sm flex items-center justify-between" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <span>No OpenRouter key set.</span>
                  <button className="font-semibold" style={{ color: '#16a34a' }} onClick={() => navigate('/settings')}>
                    Open Settings
                  </button>
                </div>
              )}
              {labelError && (
                <div className="rounded-lg p-3 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                  <div className="font-semibold">Error: unusable response</div>
                  <div>{labelError}</div>
                </div>
              )}
            </>
          ) : (
            <>
              <FoodItemForm
                state={labelForm}
                onChange={setLabelForm}
                calorieUnitLabel={settings.calorieUnits}
                advancedOpen={labelAdvancedOpen}
                onAdvancedOpenChange={setLabelAdvancedOpen}
              />
              {labelMatchPrompt && (
                <div className="rounded-lg p-3 text-sm flex flex-col gap-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <span>A Food Item with this exact description already exists. Update it instead of creating a duplicate?</span>
                  <div className="flex gap-2">
                    <button className="font-semibold" style={{ color: '#16a34a' }} onClick={() => handleLabelSave(labelMatchPrompt.andLog)}>
                      Yes, update it
                    </button>
                    <button style={{ color: 'var(--fg-muted)' }} onClick={() => setLabelMatchPrompt(null)}>
                      No, cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {labelPhase === 'form' && (
          <div className="p-4 safe-bottom flex flex-col gap-2">
            <button
              className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
              style={{ background: '#16a34a' }}
              disabled={labelSaving || !!labelMatchPrompt}
              onClick={() => handleLabelSave(true)}
            >
              Save & Log
            </button>
            <button
              className="w-full rounded-lg py-2.5 tap-target disabled:opacity-50"
              style={{ border: '1px solid var(--border)' }}
              disabled={labelSaving || !!labelMatchPrompt}
              onClick={() => handleLabelSave(false)}
            >
              Save only
            </button>
          </div>
        )}
        {labelLoading && <LoadingOverlay message="Reading nutrition label…" />}
      </div>
    );
  }

  if (!merged || phase === 'query') {
    return (
      <div className="flex flex-col min-h-full">
        <ScreenHeader title="New Food from AI" back="back" />
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <AiModeToggle mode={mode} onChange={setMode} />

          <textarea
            autoFocus
            rows={4}
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-base"
            style={{ borderColor: 'var(--border)' }}
            placeholder={'e.g. "two slices of funghi pizza, about 60g total"'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div>
            {!photoDataUrl ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="flex items-center justify-center gap-2 rounded-lg py-3 tap-target text-sm font-medium"
                  style={{ border: '1px solid var(--border)' }}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={18} strokeWidth={1.75} />
                  Take photo
                </button>
                <button
                  className="flex items-center justify-center gap-2 rounded-lg py-3 tap-target text-sm font-medium"
                  style={{ border: '1px solid var(--border)' }}
                  onClick={() => libraryInputRef.current?.click()}
                >
                  <ImageIcon size={18} strokeWidth={1.75} />
                  Upload photo
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <img src={photoDataUrl} alt="Attached food" className="h-16 w-16 rounded-lg object-cover" />
                <button className="flex items-center gap-1 text-sm" style={{ color: '#dc2626' }} onClick={() => setPhotoDataUrl(null)}>
                  <X size={16} strokeWidth={1.75} />
                  Remove photo
                </button>
              </div>
            )}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
            <input ref={libraryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          <div>
            <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
              AI model
            </div>
            <select
              className="w-full rounded-lg border bg-transparent px-3 tap-target"
              style={{ borderColor: 'var(--border)' }}
              value={effectiveModelId ?? ''}
              onChange={(e) => setSelectedModelId(e.target.value)}
            >
              {eligibleModels.length === 0 && <option value="">No eligible models — check Settings</option>}
              {eligibleModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {!hasKey && (
            <div className="rounded-lg p-3 text-sm flex items-center justify-between" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <span>No OpenRouter key set.</span>
              <button className="font-semibold" style={{ color: '#16a34a' }} onClick={() => navigate('/settings')}>
                Open Settings
              </button>
            </div>
          )}
          {offline && (
            <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              You're offline. AI analysis needs a connection.
            </div>
          )}
          {errorMessage && (
            <div className="rounded-lg p-3 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
              <div className="font-semibold">Error: unusable response</div>
              <div>{errorMessage}</div>
            </div>
          )}
        </div>
        <div className="p-4 safe-bottom">
          <button
            className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: '#16a34a' }}
            disabled={loading || offline || !hasKey || (!description.trim() && !photoDataUrl) || !selectedModel}
            onClick={handleAnalyse}
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </button>
        </div>
        {loading && <LoadingOverlay message="" />}
      </div>
    );
  }

  // --- Results phase ---
  const scaled = scaleMerged(merged, amount, amountUnit);
  const isRecipe = merged.servings > 1;
  const representative = contributing.find((c) => c.modelId === merged.representativeModelId);

  async function handleAdd() {
    setSaving(true);
    try {
      const now = Date.now();
      let foodItemId: string | null = null;

      if (addToFoods) {
        const existing = await db.foodItems.where('description').equalsIgnoreCase(merged!.description.trim()).first();
        if (existing && !matchPrompt) {
          setMatchPrompt({ existingId: existing.id });
          setSaving(false);
          return;
        }

        const itemData = {
          description: merged!.description,
          servingDescription: merged!.servingDescription,
          caloriesPerServing: merged!.perServing.calories ?? 0,
          proteinPerServing: merged!.perServing.protein,
          fatPerServing: merged!.perServing.fat,
          carbohydratesPerServing: merged!.perServing.carbohydrates,
          fibrePerServing: merged!.perServing.fibre,
          caloriesPer100g: merged!.per100g.calories,
          proteinPer100g: merged!.per100g.protein,
          fatPer100g: merged!.per100g.fat,
          carbohydratesPer100g: merged!.per100g.carbohydrates,
          fibrePer100g: merged!.per100g.fibre,
          novaGroup: merged!.novaGroup,
          fruitVeg: merged!.fruitVeg,
          servingGrams: merged!.servingGrams,
          servings: merged!.servings > 1 ? merged!.servings : null,
          notes: photoDataUrl || description.trim() ? description.trim() || null : null,
          source: (photoDataUrl ? 'ai-photo' : 'ai-text') as FoodSource,
          updatedAt: now
        };

        if (matchPrompt) {
          await db.foodItems.update(matchPrompt.existingId, itemData);
          foodItemId = matchPrompt.existingId;
        } else {
          foodItemId = crypto.randomUUID();
          await db.foodItems.add({
            id: foodItemId,
            createdAt: now,
            barcode: null,
            useCount: 0,
            lastUsedAt: null,
            ...itemData
          });
        }
      }

      await db.foodInstances.add({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        timestamp: nowDate.getTime(),
        meal,
        description: merged!.description,
        calories: scaled.calories ?? 0,
        protein: scaled.protein,
        fat: scaled.fat,
        carbohydrates: scaled.carbohydrates,
        fibre: scaled.fibre,
        fruitVeg: merged!.fruitVeg,
        novaGroup: merged!.novaGroup,
        foodItemId,
        amount,
        amountUnit,
        servingDescription: merged!.servingDescription,
        source: photoDataUrl ? 'ai-photo' : 'ai-text'
      });

      if (foodItemId && addToFoods) {
        await db.foodItems.update(foodItemId, { useCount: 1, lastUsedAt: now });
      }

      toast.show('Added');
      navigate('/');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Review estimate" back="back" />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: 'var(--fg-muted)' }}>Description</span>
          <input
            className="rounded-lg border bg-transparent px-3 tap-target"
            style={{ borderColor: 'var(--border)' }}
            value={merged.description}
            onChange={(e) => {
              setLocks((l) => ({ ...l, description: true }));
              setLockedValues((v) => ({ ...v, description: e.target.value }));
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: 'var(--fg-muted)' }}>Serving description</span>
          <input
            className="rounded-lg border bg-transparent px-3 tap-target"
            style={{ borderColor: 'var(--border)' }}
            value={merged.servingDescription}
            onChange={(e) => {
              setLocks((l) => ({ ...l, servingDescription: true }));
              setLockedValues((v) => ({ ...v, servingDescription: e.target.value }));
            }}
          />
        </label>

        {isRecipe && (
          <div className="text-sm rounded-lg p-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            Recipe: {merged.servings} servings of about {Math.round(merged.servingGrams ?? 0)}g
          </div>
        )}

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Amount
          </div>
          <AmountControl amount={amount} amountUnit={amountUnit} servingGrams={merged.servingGrams} weightUnits={settings.weightUnits} onChange={(a, u) => { setAmount(a); setAmountUnit(u); }} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumberField label={`Calories (${settings.calorieUnits})`} value={merged.perServing.calories} onChange={(v) => editPrimaryField('calories', v)} />
          <NumberField label="Protein (g)" value={merged.perServing.protein} onChange={(v) => editPrimaryField('protein', v)} />
          <NumberField label="Carbohydrates (g)" value={merged.perServing.carbohydrates} onChange={(v) => editPrimaryField('carbohydrates', v)} />
          <NumberField label="Fat (g)" value={merged.perServing.fat} onChange={(v) => editPrimaryField('fat', v)} />
          <NumberField label="Fibre (g)" value={merged.perServing.fibre} onChange={(v) => editPrimaryField('fibre', v)} />
        </div>

        {merged.spreadWarning && (
          <div className="text-xs rounded-lg p-2" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
            Models ranged {Math.round(merged.spreadWarning.min)}–{Math.round(merged.spreadWarning.max)} kcal per 100g. Adding a weight or cooking method usually narrows this.
          </div>
        )}
        {merged.consistencyWarning && (
          <div className="text-xs rounded-lg p-2" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
            Calories and macros don't quite agree — check before logging.
          </div>
        )}

        <div>
          <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
            Meal
          </div>
          <MealSelect meals={meals} value={meal} onChange={setMeal} />
        </div>

        <div className="rounded-lg p-3 flex flex-col gap-2 text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between">
            <span>Confidence: {merged.confidence}</span>
            <span style={{ color: 'var(--fg-muted)' }}>
              {merged.contributingCount === 1 ? representative?.modelName : `Combined from ${merged.contributingCount} models`}
            </span>
          </div>
          {merged.assumptions && (
            <p className="whitespace-pre-line" style={{ color: 'var(--fg-muted)' }}>
              {merged.assumptions}
            </p>
          )}
          {merged.contributingCount > 1 && (
            <button className="text-left underline" style={{ color: 'var(--fg-muted)' }} onClick={() => setStrippedExpanded((v) => !v)}>
              {strippedExpanded ? 'Hide contributing models' : 'Show contributing models'}
            </button>
          )}
          {strippedExpanded && (
            <div className="flex flex-col gap-1 text-xs">
              {contributing.map((c) => (
                <div key={c.modelId}>
                  {c.modelName}: {Math.round(c.data.per100g.calories ?? c.data.perServing.calories ?? 0)} kcal
                  {c.data.per100g.calories !== null ? '/100g' : '/serving'}, confidence {c.data.confidence}
                </div>
              ))}
              {failedAttempts.map((f) => (
                <div key={f.modelId} style={{ color: '#dc2626' }}>
                  {f.modelName}: failed ({f.error})
                </div>
              ))}
              <button
                className="text-left mt-1"
                style={{ color: '#16a34a' }}
                onClick={() => {
                  if (representative) {
                    setContributing([representative]);
                    setFailedAttempts([]);
                  }
                }}
              >
                Discard consensus, use {representative?.modelName} only
              </button>
            </div>
          )}

          {nextModel ? (
            <div className="flex items-center gap-2 mt-1">
              <button
                className="text-left font-medium disabled:opacity-50"
                style={{ color: '#16a34a' }}
                disabled={secondOpinionLoading}
                onClick={() => handleSecondOpinion()}
              >
                {secondOpinionLoading
                  ? 'Getting second opinion…'
                  : `Second opinion (~$${estimateCallCost(nextModel, !!photoDataUrl).toFixed(3)})`}
              </button>
              {remainingModels.length > 1 && (
                <select
                  className="text-xs rounded border bg-transparent px-1 py-1"
                  style={{ borderColor: 'var(--border)' }}
                  disabled={secondOpinionLoading}
                  value=""
                  onChange={(e) => e.target.value && handleSecondOpinion(e.target.value)}
                  aria-label="Choose a specific model for the second opinion"
                >
                  <option value="">{nextModel.name}</option>
                  {remainingModels
                    .filter((m) => m.id !== nextModel.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          ) : (
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              No more models to try.
            </span>
          )}
          {secondOpinionError && (
            <div className="text-xs" style={{ color: '#dc2626' }}>
              Second opinion failed: {secondOpinionError}
            </div>
          )}
          <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            Spent so far: ${(totalCost(contributing) ?? 0).toFixed(4)}
          </div>
        </div>

        <button className="flex items-center gap-1 text-sm font-medium text-left" style={{ color: '#16a34a' }} onClick={() => setAdvancedOpen((v) => !v)}>
          <ChevronRight size={16} strokeWidth={1.75} style={{ transform: advancedOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          Advanced
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-4 rounded-lg p-3" style={{ border: '1px solid var(--border)' }}>
            <div className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
              Per 100g
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(NUTRIENT_LABELS) as NutrientField[]).map((field) => (
                <NumberField
                  key={field}
                  label={NUTRIENT_LABELS[field]}
                  value={merged.per100g[field]}
                  onChange={(v) => editAdvancedField(field, v)}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Total prepared weight (g)"
                value={merged.totalWeightGrams}
                onChange={(v) => {
                  setLocks((l) => ({ ...l, totalWeightGrams: true }));
                  setLockedValues((val) => ({ ...val, totalWeightGrams: v }));
                }}
              />
              <NumberField
                label="Servings"
                value={merged.servings}
                onChange={(v) => {
                  setLocks((l) => ({ ...l, servings: true }));
                  setLockedValues((val) => ({ ...val, servings: v ?? 1 }));
                }}
              />
              <NumberField
                label="Weight per serving (g)"
                value={merged.servingGrams}
                onChange={(v) => {
                  setLocks((l) => ({ ...l, servingGrams: true }));
                  setLockedValues((val) => ({ ...val, servingGrams: v }));
                }}
              />
            </div>
            <div>
              <div className="text-sm mb-1" style={{ color: 'var(--fg-muted)' }}>
                Processing group
              </div>
              <NovaSegmented
                value={merged.novaGroup}
                onChange={(v) => {
                  setLocks((l) => ({ ...l, novaGroup: true }));
                  setLockedValues((val) => ({ ...val, novaGroup: v ?? undefined }));
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="tap-target"
                checked={merged.fruitVeg}
                onChange={(e) => {
                  setLocks((l) => ({ ...l, fruitVeg: true }));
                  setLockedValues((val) => ({ ...val, fruitVeg: e.target.checked }));
                }}
              />
              Counts toward Five a Day
            </label>
          </div>
        )}

        {matchPrompt && (
          <div className="rounded-lg p-3 text-sm flex flex-col gap-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <span>A Food Item with this exact description already exists. Update it instead of creating a duplicate?</span>
            <div className="flex gap-2">
              <button className="font-semibold" style={{ color: '#16a34a' }} onClick={handleAdd}>
                Yes, update it
              </button>
              <button style={{ color: 'var(--fg-muted)' }} onClick={() => setMatchPrompt(null)}>
                No, cancel
              </button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="tap-target" checked={addToFoods} onChange={(e) => setAddToFoods(e.target.checked)} />
          Add to Foods
        </label>
      </div>
      <div className="p-4 safe-bottom">
        <button
          className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
          style={{ background: '#16a34a' }}
          disabled={saving || !!matchPrompt}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
      {secondOpinionLoading && <LoadingOverlay message="Getting second opinion…" />}
    </div>
  );
}

function describeReason(err: AiCallError): string {
  switch (err.reason) {
    case 'no-response':
      return 'no response';
    case 'timeout':
      return 'timed out';
    case 'rate-limited':
      return 'rate limited';
    case 'bad-key':
      return 'OpenRouter key was rejected';
    case 'no-credit':
      return 'out of OpenRouter credit';
    case 'unparseable':
      return 'response could not be read';
    case 'network':
      return 'network error — check your connection';
    default:
      return err.message;
  }
}

function scaleMerged(
  merged: ReturnType<typeof mergeResponses>,
  amount: number,
  amountUnit: 'servings' | 'grams'
): { calories: number | null; protein: number | null; fat: number | null; carbohydrates: number | null; fibre: number | null } {
  const fields: NutrientField[] = ['calories', 'protein', 'fat', 'carbohydrates', 'fibre'];
  const out: Record<NutrientField, number | null> = { calories: null, protein: null, fat: null, carbohydrates: null, fibre: null };
  for (const f of fields) {
    if (amountUnit === 'servings') {
      out[f] = merged.perServing[f] !== null ? merged.perServing[f]! * amount : null;
    } else {
      out[f] = merged.per100g[f] !== null ? (merged.per100g[f]! * amount) / 100 : null;
    }
  }
  return out;
}
