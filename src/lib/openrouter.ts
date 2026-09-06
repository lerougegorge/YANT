import { z } from 'zod';
import type { ModelInfo } from '../db/types';
import { aiFoodJsonSchema, aiFoodResponseSchema, type AiFoodResponse } from './aiSchema';
import {
  FOOD_ESTIMATE_SYSTEM_PROMPT,
  LABEL_TRANSCRIPTION_SYSTEM_PROMPT,
  LABEL_USER_TEXT,
  PHOTO_ONLY_USER_TEXT
} from './prompts';

const API_BASE = 'https://openrouter.ai/api/v1';
const CALL_TIMEOUT_MS = 60_000;

export type AiFailureReason =
  | 'no-response'
  | 'timeout'
  | 'rate-limited'
  | 'bad-key'
  | 'no-credit'
  | 'unparseable'
  | 'network'
  | 'unknown';

export class AiCallError extends Error {
  reason: AiFailureReason;
  constructor(message: string, reason: AiFailureReason) {
    super(message);
    this.reason = reason;
    this.name = 'AiCallError';
  }
}

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://localhost',
    'X-Title': 'Nutrition Tracker'
  };
}

export interface CallUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export interface AiCallResult {
  data: AiFoodResponse;
  usage: CallUsage;
  modelId: string;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AiCallError('The device is offline.', 'network');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AiCallError('The request timed out.', 'timeout');
    }
    throw new AiCallError('Network error contacting OpenRouter.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

async function postChatCompletion(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  supportsStructuredOutput: boolean;
  retryWithoutTemperature?: boolean;
}): Promise<{ raw: string; usage: CallUsage }> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userContent }
    ],
    // Generous enough to survive a reasoning model spending part of this budget on hidden
    // "thinking" tokens before it ever writes the JSON body (see `reasoning` below).
    max_tokens: 1500
  };
  if (!params.retryWithoutTemperature) body.temperature = 0.2;
  if (!params.retryWithoutTemperature) {
    // This is estimation/transcription with a small fixed-shape answer, not a task that
    // benefits from extended chain-of-thought — and on a reasoning model, unrestricted
    // reasoning can consume the entire token budget and leave nothing for the actual
    // response. Ask for minimal reasoning; ordinary chat models simply ignore this field.
    body.reasoning = { effort: 'low' };
  }
  if (params.supportsStructuredOutput) {
    body.response_format = { type: 'json_schema', json_schema: aiFoodJsonSchema };
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: headers(params.apiKey),
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (err instanceof AiCallError) throw err;
    throw new AiCallError('Network error contacting OpenRouter.', 'network');
  }

  if (res.status === 401) throw new AiCallError('OpenRouter key was rejected.', 'bad-key');
  if (res.status === 402) throw new AiCallError('Out of OpenRouter credit.', 'no-credit');
  if (res.status === 429) throw new AiCallError('Rate limited by OpenRouter.', 'rate-limited');
  if (!res.ok) {
    // One automatic retry only, and only for a parameter the model rejected outright.
    if (!params.retryWithoutTemperature && res.status === 400) {
      return postChatCompletion({ ...params, retryWithoutTemperature: true });
    }
    throw new AiCallError(`OpenRouter returned ${res.status}.`, 'no-response');
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AiCallError('Response could not be read.', 'unparseable');
  }

  const envelope = z
    .object({
      choices: z
        .array(
          z.object({
            message: z.object({ content: z.string().nullable() })
          })
        )
        .min(1),
      usage: z
        .object({
          prompt_tokens: z.number().optional(),
          completion_tokens: z.number().optional(),
          cost: z.number().optional()
        })
        .optional()
    })
    .safeParse(json);

  if (!envelope.success) throw new AiCallError('Response could not be read.', 'unparseable');
  const content = envelope.data.choices[0]?.message.content;
  if (!content) throw new AiCallError('The model returned no content.', 'no-response');

  return {
    raw: content,
    usage: {
      promptTokens: envelope.data.usage?.prompt_tokens ?? 0,
      completionTokens: envelope.data.usage?.completion_tokens ?? 0,
      costUsd: envelope.data.usage?.cost ?? null
    }
  };
}

function parseAiFoodResponse(raw: string): AiFoodResponse {
  const stripped = stripCodeFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new AiCallError('Response could not be read.', 'unparseable');
  }
  const result = aiFoodResponseSchema.safeParse(parsed);
  if (!result.success) throw new AiCallError('Response could not be read.', 'unparseable');
  return result.data;
}

export async function callFoodEstimate(params: {
  apiKey: string;
  model: ModelInfo;
  description: string;
  imageBase64: string | null; // data URL, e.g. "data:image/jpeg;base64,..."
}): Promise<AiCallResult> {
  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
  if (params.imageBase64) {
    userContent.push({ type: 'image_url', image_url: { url: params.imageBase64 } });
    userContent.push({ type: 'text', text: params.description.trim() || PHOTO_ONLY_USER_TEXT });
  } else {
    userContent.push({ type: 'text', text: params.description });
  }

  const { raw, usage } = await postChatCompletion({
    apiKey: params.apiKey,
    model: params.model.id,
    systemPrompt: FOOD_ESTIMATE_SYSTEM_PROMPT,
    userContent,
    supportsStructuredOutput: params.model.supportsStructuredOutput
  });

  return { data: parseAiFoodResponse(raw), usage, modelId: params.model.id };
}

export async function callLabelTranscription(params: {
  apiKey: string;
  model: ModelInfo;
  imageBase64: string;
  productDescription?: string;
}): Promise<AiCallResult> {
  const text = params.productDescription
    ? `${LABEL_USER_TEXT} The product is described as: ${params.productDescription}.`
    : LABEL_USER_TEXT;

  const { raw, usage } = await postChatCompletion({
    apiKey: params.apiKey,
    model: params.model.id,
    systemPrompt: LABEL_TRANSCRIPTION_SYSTEM_PROMPT,
    userContent: [
      { type: 'image_url', image_url: { url: params.imageBase64 } },
      { type: 'text', text }
    ],
    supportsStructuredOutput: params.model.supportsStructuredOutput
  });

  return { data: parseAiFoodResponse(raw), usage, modelId: params.model.id };
}

export async function fetchModelList(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetchWithTimeout(`${API_BASE}/models`, { headers: headers(apiKey) });
  if (!res.ok) throw new AiCallError(`Could not fetch model list (${res.status}).`, 'no-response');
  const json = await res.json();

  const schema = z.object({
    data: z.array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        architecture: z.object({ input_modalities: z.array(z.string()).optional() }).optional(),
        pricing: z.object({ prompt: z.union([z.string(), z.number()]).optional(), completion: z.union([z.string(), z.number()]).optional() }).optional(),
        supported_parameters: z.array(z.string()).optional()
      })
    )
  });
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AiCallError('Model list response could not be read.', 'unparseable');

  const now = Date.now();
  return parsed.data.data.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    supportsImages: !!m.architecture?.input_modalities?.includes('image'),
    supportsStructuredOutput: !!m.supported_parameters?.includes('response_format'),
    promptPrice: Number(m.pricing?.prompt ?? 0),
    completionPrice: Number(m.pricing?.completion ?? 0),
    lastFetchedAt: now
  }));
}

export async function testApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/key`, { headers: headers(apiKey) });
    if (res.status === 401) return { ok: false, message: 'Key was rejected.' };
    if (!res.ok) return { ok: false, message: `Unexpected response (${res.status}).` };
    const json = await res.json();
    const label = json?.data?.label ? ` (${json.data.label})` : '';
    const limit = json?.data?.limit;
    return { ok: true, message: `Key is valid${label}.${limit != null ? ` Limit: $${limit}.` : ''}` };
  } catch (err) {
    if (err instanceof AiCallError) return { ok: false, message: err.message };
    return { ok: false, message: 'Could not reach OpenRouter.' };
  }
}

/** Rough pre-call cost estimate from the model's per-token pricing (no response yet, so tokens are approximate). */
export function estimateCallCost(model: ModelInfo, hasImage: boolean): number {
  const estimatedPromptTokens = hasImage ? 1100 : 400;
  const estimatedCompletionTokens = 400;
  return model.promptPrice * estimatedPromptTokens + model.completionPrice * estimatedCompletionTokens;
}

/** Downscales an image client-side to max 1024px on the longest edge, JPEG q=0.8, in memory only. */
export async function downscaleImageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1024;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL('image/jpeg', 0.8);
}
