/**
 * LlamaService — manages the full lifecycle for multiple on-device AI models:
 *   download → persist → load → inference → unload
 *
 * Supports two models; only ONE is loaded in memory at any time.
 * Switching models automatically unloads the previous one first.
 *
 * Model registry is the single source of truth for IDs, URLs, filenames, sizes.
 */

import * as FileSystem from 'expo-file-system';
import { initLlama, releaseAllLlama } from 'llama.rn';
import type { LlamaContext } from 'llama.rn';
import type { Event } from '@/db/events';

// ── Model Registry ────────────────────────────────────────────────────────────
export interface ModelDef {
  id: string;
  name: string;        // full display name e.g. "SmolLM2 360M"
  tag: string;         // short tag shown on chip e.g. "Fast" | "Smart"
  description: string;
  url: string;
  filename: string;    // saved to FileSystem.documentDirectory/<filename>
  sizeLabel: string;   // human-readable e.g. "~200 MB"
}

export const MODEL_REGISTRY: ModelDef[] = [
  {
    id: 'smollm2-360m',
    name: 'SmolLM2 360M',
    tag: 'Fast',
    description: 'Lightweight · good for quick schedule Q&A.',
    url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf',
    filename: 'smollm2-360m-instruct-q4_k_m.gguf',
    sizeLabel: '~200 MB',
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B',
    tag: 'Smart',
    description: 'Better reasoning · handles complex questions well.',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeLabel: '~1 GB',
  },
];

// ── Exported types ────────────────────────────────────────────────────────────
export type DownloadProgressCallback = (progress: number) => void;
export type TokenCallback = (token: string) => void;

/** Rich app context injected into every system prompt so the AI knows user data. */
export interface AppContext {
  todayEvents: Event[];
  todayStats: {
    total: number;
    completed: number;
    scheduledMinutes: number;
    focusTotal: number;
    focusCompleted: number;
  };
  burnout: {
    risk: 'Low' | 'Moderate' | 'High';
    avgActiveHours: number;
    heavyDays: number;
    maxBlockMinutes: number;
  };
}

// ── Module-level singleton state ──────────────────────────────────────────────
// One LlamaContext per model; at most one will be non-null at any time.
const _contexts: Partial<Record<string, LlamaContext>> = {};

// ID of the model currently loaded into memory (null if none loaded).
let _activeModelId: string | null = null;

// Per-model download resumable handles (for pause/cancel).
const _downloadResumables: Partial<Record<string, FileSystem.DownloadResumable>> = {};

// Guard: prevents two concurrent initLlama() calls which would crash the native layer.
let _loadingPromise: Promise<void> | null = null;

// ── Path helper ───────────────────────────────────────────────────────────────
/** Returns the absolute local file path for a registered model. */
export function getModelPath(modelId: string): string {
  const def = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!def) throw new Error(`Unknown model ID: "${modelId}"`);
  return `${FileSystem.documentDirectory}${def.filename}`;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if the model GGUF file is on disk and is a real (non-partial) file.
 * We require >10 MB to rule out empty or incomplete downloads.
 */
export async function isModelDownloaded(modelId: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(getModelPath(modelId));
    if (!info.exists) return false;
    return (info as any).size > 10_000_000;
  } catch {
    return false;
  }
}

/** File size on disk in bytes (for Settings display). Returns 0 if not present. */
export async function getModelSizeOnDisk(modelId: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(getModelPath(modelId));
    if (!info.exists) return 0;
    return (info as any).size ?? 0;
  } catch {
    return 0;
  }
}

/** Returns the ID of the model currently loaded into memory (null if none). */
export function getActiveModelId(): string | null {
  return _activeModelId;
}

// ── Download ──────────────────────────────────────────────────────────────────

/**
 * Download a specific model with progress callbacks.
 * If the model is already on disk the callbacks fire immediately with 100%.
 */
export async function downloadModel(
  modelId: string,
  onProgress: DownloadProgressCallback,
  onComplete: () => void,
  onError: (err: Error) => void,
): Promise<void> {
  try {
    if (await isModelDownloaded(modelId)) {
      onProgress(100);
      onComplete();
      return;
    }

    const def = MODEL_REGISTRY.find((m) => m.id === modelId)!;
    const path = getModelPath(modelId);

    _downloadResumables[modelId] = FileSystem.createDownloadResumable(
      def.url,
      path,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        if (totalBytesExpectedToWrite > 0) {
          onProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100));
        }
      },
    );

    await _downloadResumables[modelId]!.downloadAsync();
    delete _downloadResumables[modelId];
    onProgress(100);
    onComplete();
  } catch (err) {
    delete _downloadResumables[modelId];
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/** Cancel an in-progress download and remove the partial file. */
export async function cancelDownload(modelId: string): Promise<void> {
  const resumable = _downloadResumables[modelId];
  if (resumable) {
    await resumable.pauseAsync().catch(() => {});
    delete _downloadResumables[modelId];
    await FileSystem.deleteAsync(getModelPath(modelId), { idempotent: true });
  }
}

/**
 * Delete a model from disk.
 * If the model is currently loaded in memory it is unloaded first.
 */
export async function deleteModel(modelId: string): Promise<void> {
  if (_activeModelId === modelId) {
    await unloadModel();
  }
  await FileSystem.deleteAsync(getModelPath(modelId), { idempotent: true });
}

// ── Load / Unload ─────────────────────────────────────────────────────────────

/**
 * Load a model into memory.
 * - Idempotent: calling with the already-active model ID is a no-op.
 * - If a DIFFERENT model is currently loaded, it is unloaded first.
 * - Guards against concurrent initLlama() calls with a shared promise.
 *
 * Takes 2–5 seconds on a mid-range Android device.
 */
export async function loadModel(modelId: string): Promise<void> {
  // Already loaded — nothing to do.
  if (_activeModelId === modelId && _contexts[modelId]) return;

  // Different model loaded — unload it first so only one is in memory.
  if (_activeModelId && _activeModelId !== modelId) {
    await unloadModel();
  }

  // Block concurrent loads.
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = initLlama({
    model: getModelPath(modelId),
    n_ctx: 2048,   // context window
    n_threads: 4,  // safe default for mid-range Android
    n_batch: 512,
  })
    .then((ctx) => {
      _contexts[modelId] = ctx;
      _activeModelId = modelId;
      _loadingPromise = null;
    })
    .catch((err) => {
      _loadingPromise = null;
      throw err;
    });

  return _loadingPromise;
}

/** Release all loaded model contexts and reset active model state. */
export async function unloadModel(): Promise<void> {
  if (Object.keys(_contexts).length > 0) {
    await releaseAllLlama();
    for (const key of Object.keys(_contexts)) {
      delete _contexts[key];
    }
    _activeModelId = null;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(ctx: AppContext): string {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const scheduleLines =
    ctx.todayEvents.length === 0
      ? '  (No events scheduled today)'
      : ctx.todayEvents
          .map((e) => {
            const time = e.end_time ? `${e.start_time}–${e.end_time}` : e.start_time;
            const done = e.completed ? ' [done]' : '';
            return `  • ${time} ${e.title}${done} [${e.category}]`;
          })
          .join('\n');

  const scheduledH =
    ctx.todayStats.scheduledMinutes >= 60
      ? `${(ctx.todayStats.scheduledMinutes / 60).toFixed(1)}h`
      : `${ctx.todayStats.scheduledMinutes}m`;

  const maxBlockH =
    ctx.burnout.maxBlockMinutes >= 60
      ? `${(ctx.burnout.maxBlockMinutes / 60).toFixed(1)}h`
      : `${ctx.burnout.maxBlockMinutes}m`;

  return `You are freeflow AI, a smart scheduling and wellness assistant inside the freeflow productivity app.
Current time: ${timeStr} on ${dayName}, ${dateStr}.

## Today's Schedule
${scheduleLines}

## Today's Progress
- Total events: ${ctx.todayStats.total} | Completed: ${ctx.todayStats.completed}/${ctx.todayStats.total}
- Scheduled time: ${scheduledH}
- Focus sessions: ${ctx.todayStats.focusCompleted}/${ctx.todayStats.focusTotal} done

## This Week's Workload
- Avg hours on days with events: ${ctx.burnout.avgActiveHours.toFixed(1)}h
- Heavy days (5h+ scheduled): ${ctx.burnout.heavyDays} this week
- Longest unbroken work block: ${maxBlockH}
- Burnout risk level: ${ctx.burnout.risk}

You help the user manage their time, understand burnout risk, reflect on productivity, and plan better.
Rules:
- Be warm, direct, and helpful. Use a friendly conversational tone.
- Keep answers to 1-3 sentences unless the user asks for more detail.
- You have full knowledge of the schedule data above — use it to give personalized answers.
- Do NOT say "I don't have access to your data" — you do.
- Do NOT repeat the schedule verbatim unless the user explicitly asks for it.`;
}

// ── Inference ─────────────────────────────────────────────────────────────────

/**
 * Run inference for a specific model and stream tokens via callback.
 * Automatically loads the model if it is not already in memory.
 *
 * @param modelId   The model to run inference with.
 * @param history   Full conversation history (user + assistant turns).
 * @param appCtx    Rich app context injected into the system prompt.
 * @param onToken   Called for each streamed token as it is generated.
 * @returns         The complete generated text.
 */
export async function chat(
  modelId: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  appCtx: AppContext,
  onToken: TokenCallback,
): Promise<string> {
  // Ensure the correct model is loaded (auto-switches if needed)
  if (_activeModelId !== modelId || !_contexts[modelId]) {
    await loadModel(modelId);
  }

  const ctx = _contexts[modelId];
  if (!ctx) throw new Error(`Model "${modelId}" failed to load.`);

  const systemPrompt = buildSystemPrompt(appCtx);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    })),
  ];

  let fullText = '';

  await ctx.completion(
    {
      messages,
      n_predict: 200,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      penalty_repeat: 1.15,
      penalty_last_n: 64,
      stop: [
        '</s>', '<|im_end|>', '<|endoftext|>',
        'User:', 'Human:', 'Assistant:',
        '\nUser:', '\nHuman:', '\nAssistant:',
      ],
    },
    (data) => {
      fullText += data.token;
      onToken(data.token);
    },
  );

  return fullText;
}
