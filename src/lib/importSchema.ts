import { z } from 'zod';

const nullableNumber = z.number().nullable();
const novaGroup = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable();

export const foodItemSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  description: z.string(),
  servingDescription: z.string(),
  caloriesPerServing: z.number(),
  proteinPerServing: nullableNumber,
  fatPerServing: nullableNumber,
  carbohydratesPerServing: nullableNumber,
  fibrePerServing: nullableNumber,
  caloriesPer100g: nullableNumber,
  proteinPer100g: nullableNumber,
  fatPer100g: nullableNumber,
  carbohydratesPer100g: nullableNumber,
  fibrePer100g: nullableNumber,
  novaGroup,
  fruitVeg: z.boolean().nullable(),
  barcode: z.string().nullable(),
  servingGrams: nullableNumber,
  servings: nullableNumber,
  notes: z.string().nullable(),
  source: z.enum(['manual', 'ai-text', 'ai-photo', 'ai-label', 'openfoodfacts']),
  useCount: z.number(),
  lastUsedAt: z.number().nullable()
});

export const foodInstanceSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  timestamp: z.number(),
  meal: z.string().nullable(),
  description: z.string(),
  calories: z.number(),
  protein: nullableNumber,
  fat: nullableNumber,
  carbohydrates: nullableNumber,
  fibre: nullableNumber,
  fruitVeg: z.boolean().nullable(),
  novaGroup,
  foodItemId: z.string().nullable(),
  amount: z.number(),
  amountUnit: z.enum(['servings', 'grams']),
  servingDescription: z.string().nullable(),
  source: z.enum(['manual', 'ai-text', 'ai-photo', 'ai-label', 'openfoodfacts'])
});

export const goalSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  measurement: z.enum(['calories', 'protein', 'fat', 'carbohydrates', 'fibre', 'nova4Percent', 'nova1Percent', 'fiveADay']),
  operator: z.enum(['>=', '<=']),
  value: z.number(),
  enabled: z.boolean(),
  sortOrder: z.number()
});

export const mealSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  name: z.string(),
  defaultStart: z.string().nullable(),
  defaultEnd: z.string().nullable(),
  sortOrder: z.number()
});

export const settingsSchema = z.object({
  id: z.literal('singleton'),
  weightUnits: z.enum(['metric', 'oz']),
  calorieUnits: z.enum(['cal', 'kJ']),
  columns: z.array(z.enum(['calories', 'caloriesKJ', 'protein', 'fibre', 'carbohydrates', 'fat'])),
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      supportsImages: z.boolean(),
      supportsStructuredOutput: z.boolean(),
      promptPrice: z.number(),
      completionPrice: z.number(),
      lastFetchedAt: z.number()
    })
  ),
  estimateModelOrder: z.array(z.string()),
  labelModel: z.string().nullable(),
  openRouterKey: z.string(),
  offEnabled: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  schemaVersion: z.number(),
  updatedAt: z.number()
});

export const exportFileSchema = z.object({
  schemaVersion: z.number(),
  exportedAt: z.number(),
  foodItems: z.array(foodItemSchema),
  foodInstances: z.array(foodInstanceSchema),
  goals: z.array(goalSchema),
  meals: z.array(mealSchema),
  settings: z.array(settingsSchema)
});

export type ExportFile = z.infer<typeof exportFileSchema>;
