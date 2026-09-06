// Canonical units throughout: energy in kcal, all nutrient masses in grams,
// per-100g figures always per 100 grams. Display-layer conversions only (kJ, oz).

export type NovaGroup = 1 | 2 | 3 | 4 | null;

export type FoodSource = 'manual' | 'ai-text' | 'ai-photo' | 'ai-label' | 'openfoodfacts';

export type AmountUnit = 'servings' | 'grams';

export interface Macros {
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
  fibre: number | null;
}

export interface WithMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
}

/** A durable, multi-use record of a food. The user's own library. */
export interface FoodItem extends WithMeta {
  description: string;
  servingDescription: string;
  caloriesPerServing: number;

  proteinPerServing: number | null;
  fatPerServing: number | null;
  carbohydratesPerServing: number | null;
  fibrePerServing: number | null;

  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  fatPer100g: number | null;
  carbohydratesPer100g: number | null;
  fibrePer100g: number | null;

  novaGroup: NovaGroup;
  fruitVeg: boolean | null;
  barcode: string | null;
  servingGrams: number | null;
  servings: number | null;
  notes: string | null;
  source: FoodSource;

  useCount: number;
  lastUsedAt: number | null;
}

/** Food logged at a particular time. Fully self-contained — never dereferences a FoodItem. */
export interface FoodInstance extends WithMeta {
  timestamp: number;
  meal: string | null;
  description: string;
  calories: number;
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
  fibre: number | null;
  fruitVeg: boolean | null;
  novaGroup: NovaGroup;
  foodItemId: string | null;
  amount: number;
  amountUnit: AmountUnit;
  servingDescription: string | null;
  source: FoodSource;
}

export type GoalMeasurement =
  | 'calories'
  | 'protein'
  | 'fat'
  | 'carbohydrates'
  | 'fibre'
  | 'nova4Percent'
  | 'nova1Percent'
  | 'fiveADay';

export type GoalOperator = '>=' | '<=';

export interface Goal extends WithMeta {
  measurement: GoalMeasurement;
  operator: GoalOperator;
  value: number;
  enabled: boolean;
  sortOrder: number;
}

export interface Meal extends WithMeta {
  name: string;
  defaultStart: string | null; // "HH:mm"
  defaultEnd: string | null; // "HH:mm"
  sortOrder: number;
}

export type ColumnKey = 'calories' | 'caloriesKJ' | 'protein' | 'fibre' | 'carbohydrates' | 'fat';

export interface ModelInfo {
  id: string;
  name: string;
  supportsImages: boolean;
  supportsStructuredOutput: boolean;
  promptPrice: number; // per-token price (USD) as returned by OpenRouter
  completionPrice: number;
  lastFetchedAt: number;
}

export interface Settings {
  id: 'singleton';
  weightUnits: 'metric' | 'oz';
  calorieUnits: 'cal' | 'kJ';
  columns: ColumnKey[];
  models: ModelInfo[];
  estimateModelOrder: string[]; // model ids, first = initial estimate
  labelModel: string | null;
  openRouterKey: string;
  offEnabled: boolean;
  theme: 'system' | 'light' | 'dark';
  schemaVersion: number;
  updatedAt: number;
}

export const DEFAULT_MEALS: Omit<Meal, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Breakfast', defaultStart: '05:00', defaultEnd: '11:00', sortOrder: 0 },
  { name: 'Lunch', defaultStart: '11:00', defaultEnd: '14:00', sortOrder: 1 },
  { name: 'Dinner', defaultStart: '15:00', defaultEnd: '20:00', sortOrder: 2 },
  { name: 'Snacks', defaultStart: null, defaultEnd: null, sortOrder: 3 }
];

export const SCHEMA_VERSION = 1;

// Seeded so the app is immediately useful without first having to fetch the full catalog —
// "Refresh model list" later replaces this wholesale with live data (keeping these selections
// as long as the ids still exist), so stale pricing here just gets corrected on first refresh.
const DEFAULT_ESTIMATE_MODELS: ModelInfo[] = [
  {
    id: 'openai/gpt-5.6-luna',
    name: 'OpenAI: GPT-5.6 Luna',
    supportsImages: true,
    supportsStructuredOutput: true,
    promptPrice: 0.0000002,
    completionPrice: 0.0000012,
    lastFetchedAt: 0
  },
  {
    id: 'google/gemini-3.5-flash-lite',
    name: 'Google: Gemini 3.5 Flash Lite',
    supportsImages: true,
    supportsStructuredOutput: true,
    promptPrice: 0.0000003,
    completionPrice: 0.0000025,
    lastFetchedAt: 0
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Anthropic: Claude Haiku 4.5',
    supportsImages: true,
    supportsStructuredOutput: true,
    promptPrice: 0.000001,
    completionPrice: 0.000005,
    lastFetchedAt: 0
  },
  {
    id: 'google/gemini-3.8-flash',
    name: 'Google: Gemini 3.8 Flash',
    supportsImages: true,
    supportsStructuredOutput: true,
    promptPrice: 0.00000075,
    completionPrice: 0.00000375,
    lastFetchedAt: 0
  }
];

export const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  weightUnits: 'metric',
  calorieUnits: 'cal',
  columns: ['calories', 'protein', 'carbohydrates', 'fat'],
  models: DEFAULT_ESTIMATE_MODELS,
  estimateModelOrder: ['openai/gpt-5.6-luna', 'google/gemini-3.5-flash-lite', 'anthropic/claude-haiku-4.5'],
  labelModel: 'google/gemini-3.8-flash',
  openRouterKey: '',
  offEnabled: true,
  theme: 'system',
  schemaVersion: SCHEMA_VERSION,
  updatedAt: Date.now()
};
