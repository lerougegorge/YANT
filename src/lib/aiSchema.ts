import { z } from 'zod';

// A nullable number as returned by the model. Providers are occasionally sloppy about type —
// Gemini has been observed returning an enum-like numeric field as a numeral string — so accept
// a numeric string and coerce it rather than failing the whole response over one soft field.
const nullableNumber = z.preprocess((v) => {
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}, z.number().nullable());

const nutrientBlock = z.object({
  calories: nullableNumber,
  protein: nullableNumber,
  fat: nullableNumber,
  carbohydrates: nullableNumber,
  fibre: nullableNumber
});

/** Shared shape for both the Food Estimate and Label Transcription calls. */
export const aiFoodResponseSchema = z.object({
  description: z.string(),
  servingDescription: z.string(),
  servings: nullableNumber.default(1),
  totalWeightGrams: nullableNumber,
  servingGrams: nullableNumber,
  per100g: nutrientBlock,
  perServing: nutrientBlock,
  novaGroup: z.preprocess(
    (v) => (typeof v === 'string' && !Number.isNaN(Number(v)) ? Number(v) : v),
    z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable()
  ),
  fruitVeg: z.boolean().nullable().default(false),
  confidence: z.enum(['low', 'medium', 'high']),
  assumptions: z.string()
});

export type AiFoodResponse = z.infer<typeof aiFoodResponseSchema>;

export const NUTRIENT_FIELDS = ['calories', 'protein', 'fat', 'carbohydrates', 'fibre'] as const;
export type NutrientField = (typeof NUTRIENT_FIELDS)[number];

// A nullable-number JSON Schema node. Deliberately `anyOf: [number, null]` rather than the
// terser `type: ["number", "null"]` — OpenRouter's schema translation for at least one major
// provider (Google Gemini) silently produces an empty/degenerate response for the latter form
// while handling `anyOf` correctly. Confirmed by direct testing against the live API.
const nullableNumberSchema = { anyOf: [{ type: 'number' }, { type: 'null' }] } as const;

/** The JSON Schema handed to OpenRouter's response_format for models that support structured output. */
export const aiFoodJsonSchema = {
  name: 'food_nutrition_estimate',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      description: { type: 'string' },
      servingDescription: { type: 'string' },
      servings: { type: 'number' },
      totalWeightGrams: nullableNumberSchema,
      servingGrams: nullableNumberSchema,
      per100g: {
        type: 'object',
        additionalProperties: false,
        properties: {
          calories: nullableNumberSchema,
          protein: nullableNumberSchema,
          fat: nullableNumberSchema,
          carbohydrates: nullableNumberSchema,
          fibre: nullableNumberSchema
        },
        required: ['calories', 'protein', 'fat', 'carbohydrates', 'fibre']
      },
      perServing: {
        type: 'object',
        additionalProperties: false,
        properties: {
          calories: nullableNumberSchema,
          protein: nullableNumberSchema,
          fat: nullableNumberSchema,
          carbohydrates: nullableNumberSchema,
          fibre: nullableNumberSchema
        },
        required: ['calories', 'protein', 'fat', 'carbohydrates', 'fibre']
      },
      novaGroup: { anyOf: [{ type: 'number', enum: [1, 2, 3, 4] }, { type: 'null' }] },
      fruitVeg: { type: 'boolean' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      assumptions: { type: 'string' }
    },
    required: [
      'description',
      'servingDescription',
      'servings',
      'totalWeightGrams',
      'servingGrams',
      'per100g',
      'perServing',
      'novaGroup',
      'fruitVeg',
      'confidence',
      'assumptions'
    ]
  }
} as const;
