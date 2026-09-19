import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScanBarcode, X } from 'lucide-react';
import { db } from '../db/db';
import { ScreenHeader } from '../components/ScreenHeader';
import { FoodItemForm, emptyFoodFormState, toPer100g, type FoodFormState } from '../components/FoodItemForm';
import { useSettings } from '../hooks/useSettings';
import { useSheets } from '../components/SheetContext';
import { useToast } from '../components/Toast';
import { runBarcodeLadder } from '../lib/barcodeLadder';
import { hasNativeBarcodeDetector, scanVideoStream, startCameraStream, decodeBarcodeFromFile, vibrateOnScan } from '../lib/barcodeScan';
import type { OffFoodItemDraft } from '../lib/openfoodfacts';

// Note: Open Food Facts text search (e.g. "search for X" by name) is not implemented yet — its
// recommended API (search.openfoodfacts.org) doesn't send the CORS header a static, backend-free
// PWA needs to call it directly from the browser, and the older name-search endpoint on the
// CORS-enabled host is unreliable for anonymous callers. Barcode lookup is unaffected — the
// product-by-barcode endpoint already in use here does send the right CORS header.

export function NewFoodSearchScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { day?: number; query?: string } | null;
  const day = navState?.day;
  const settings = useSettings();
  const { openLogSheet } = useSheets();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [sourceLine, setSourceLine] = useState<{ label: string; url?: string } | null>(null);
  const [lastSource, setLastSource] = useState<'manual' | 'openfoodfacts'>('manual');

  // There's no working Open Food Facts text search yet (see the note above the component), so a
  // query carried from the Add screen currently just seeds the manual-entry description below,
  // rather than searching anything.
  const [form, setForm] = useState<FoodFormState>(() => ({ ...emptyFoodFormState(), description: navState?.query ?? '' }));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    let stopStream: (() => void) | null = null;
    let mediaStream: MediaStream | null = null;
    (async () => {
      if (!videoRef.current) return;
      try {
        mediaStream = await startCameraStream(videoRef.current);
        stopStream = scanVideoStream(
          videoRef.current,
          (value) => {
            vibrateOnScan();
            setScanning(false);
            setBarcode(value);
            void runLadder(value);
          },
          () => {}
        );
      } catch {
        setScanning(false);
        toast.show('Camera unavailable — use a photo instead');
      }
    })();
    return () => {
      stopStream?.();
      mediaStream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  function applyOffDraft(draft: OffFoodItemDraft) {
    setForm({
      description: draft.description,
      servingDescription: draft.servingDescription ?? '1 serving',
      servingGrams: draft.servingGrams,
      perServing: {
        calories: draft.caloriesPerServing,
        protein: draft.proteinPerServing,
        fibre: draft.fibrePerServing,
        carbohydrates: draft.carbohydratesPerServing,
        fat: draft.fatPerServing
      },
      per100gDisplay: {
        calories: draft.caloriesPer100g,
        protein: draft.proteinPer100g,
        fibre: draft.fibrePer100g,
        carbohydrates: draft.carbohydratesPer100g,
        fat: draft.fatPer100g
      },
      units: { calories: '100g', protein: '100g', fibre: '100g', carbohydrates: '100g', fat: '100g' },
      novaGroup: draft.novaGroup,
      fruitVeg: draft.fruitVeg
    });
    setSourceLine({ label: 'From Open Food Facts', url: draft.productUrl });
    setLastSource('openfoodfacts');
  }

  async function runLadder(code: string) {
    const result = await runBarcodeLadder(code, settings.offEnabled);
    if (result.rung === 'local') {
      openLogSheet(result.item, day);
      navigate(-1);
      return;
    }
    if (result.rung === 'openfoodfacts') {
      applyOffDraft(result.draft);
    }
    // miss: leave form for manual entry
  }

  async function handleStillPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    let code: string | null = null;
    if (hasNativeBarcodeDetector()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Detector = (window as any).BarcodeDetector;
        const bitmap = await createImageBitmap(file);
        const results = await new Detector().detect(bitmap);
        code = results[0]?.rawValue ?? null;
      } catch {
        code = null;
      }
    }
    if (!code) code = await decodeBarcodeFromFile(file).catch(() => null);
    if (code) {
      vibrateOnScan();
      setBarcode(code);
      await runLadder(code);
    } else {
      toast.show('Could not read a barcode from that photo');
    }
  }

  async function handleSave(andLog: boolean) {
    setSaving(true);
    try {
      const trimmedBarcode = barcode.trim();
      if (trimmedBarcode) {
        const existing = await db.foodItems.where('barcode').equals(trimmedBarcode).first();
        if (existing) {
          toast.show('A Food Item with this barcode already exists');
          navigate(`/foods/${existing.id}`);
          return;
        }
      }
      const now = Date.now();
      const id = crypto.randomUUID();
      await db.foodItems.add({
        id,
        createdAt: now,
        updatedAt: now,
        description: form.description.trim() || 'Unnamed product',
        servingDescription: form.servingDescription.trim() || '1 serving',
        caloriesPerServing: form.perServing.calories ?? 0,
        proteinPerServing: form.perServing.protein,
        fatPerServing: form.perServing.fat,
        carbohydratesPerServing: form.perServing.carbohydrates,
        fibrePerServing: form.perServing.fibre,
        caloriesPer100g: toPer100g(form.per100gDisplay.calories, form.units.calories),
        proteinPer100g: toPer100g(form.per100gDisplay.protein, form.units.protein),
        fatPer100g: toPer100g(form.per100gDisplay.fat, form.units.fat),
        carbohydratesPer100g: toPer100g(form.per100gDisplay.carbohydrates, form.units.carbohydrates),
        fibrePer100g: toPer100g(form.per100gDisplay.fibre, form.units.fibre),
        novaGroup: form.novaGroup,
        fruitVeg: form.fruitVeg,
        barcode: trimmedBarcode || null,
        servingGrams: form.servingGrams,
        servings: null,
        notes: null,
        source: lastSource,
        useCount: 0,
        lastUsedAt: null
      });
      if (andLog) {
        const item = await db.foodItems.get(id);
        if (item) openLogSheet(item, day);
      } else {
        toast.show('Saved');
      }
      navigate(-1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Search" back="back" />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {scanning ? (
          <div className="relative rounded-lg overflow-hidden" style={{ background: 'black' }}>
            <video ref={videoRef} className="w-full aspect-video object-cover" muted playsInline />
            <div className="absolute inset-8 border-2 rounded-lg" style={{ borderColor: '#22c55e' }} />
            <button className="absolute top-2 right-2 text-white tap-target flex items-center justify-center" onClick={() => setScanning(false)}>
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <button
            className="w-full flex items-center justify-center gap-2 rounded-lg py-3 tap-target text-sm font-medium"
            style={{ border: '1px solid var(--border)' }}
            onClick={() => (hasNativeBarcodeDetector() ? setScanning(true) : fileInputRef.current?.click())}
          >
            <ScanBarcode size={18} strokeWidth={1.75} />
            Scan barcode
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleStillPhoto} />

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: 'var(--fg-muted)' }}>Barcode</span>
          <input
            className="rounded-lg border bg-transparent px-3 tap-target placeholder:italic"
            style={{ borderColor: 'var(--border)' }}
            placeholder="Please start by scanning a barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onBlur={() => barcode.trim() && runLadder(barcode.trim())}
          />
        </label>

        {sourceLine && (
          <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {sourceLine.label}
            {sourceLine.url && (
              <>
                {' · '}
                <a href={sourceLine.url} target="_blank" rel="noreferrer" className="underline">
                  View product
                </a>
              </>
            )}
          </div>
        )}

        <FoodItemForm
          state={form}
          onChange={setForm}
          calorieUnitLabel={settings.calorieUnits}
          advancedOpen={advancedOpen}
          onAdvancedOpenChange={setAdvancedOpen}
        />
      </div>
      <div className="p-4 safe-bottom flex flex-col gap-2">
        <button
          className="w-full rounded-lg py-3 font-semibold text-white tap-target disabled:opacity-50"
          style={{ background: '#16a34a' }}
          disabled={saving}
          onClick={() => handleSave(true)}
        >
          Save & Log
        </button>
        <button className="w-full rounded-lg py-2.5 tap-target disabled:opacity-50" style={{ border: '1px solid var(--border)' }} disabled={saving} onClick={() => handleSave(false)}>
          Save only
        </button>
      </div>
    </div>
  );
}
