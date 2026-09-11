/**
 * LlamaService — manages the full SmolLM2 lifecycle:
 *   download → persist → load → inference → unload
 *
 * Model: SmolLM2-360M-Instruct Q4_K_M (~200 MB)
 * Stored in: FileSystem.documentDirectory (persists across updates)
 */

import * as FileSystem from 'expo-file-system';
import { initLlama, releaseAllLlama } from 'llama.rn';
import type { LlamaContext } from 'llama.rn';
import type { Event } from '@/db/events';

// ── Constants ─────────────────────────────────────────────────────────────────
const MODEL_FILENAME = 'smollm2-360m-instruct-q4_k_m.gguf';
const MODEL_URL =
  'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf';

export const MODEL_PATH = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;

// ── Types ─────────────────────────────────────────────────────────────────────
export type DownloadProgressCallback = (progress: number) => void;
export type TokenCallback = (token: string) => void;

// ── Singleton state ────────────────────────────────────────────────────────────────────
let _context: LlamaContext | null = null;
let _downloadResumable: FileSystem.DownloadResumable | null = null;
/** Guard against concurrent initLlama() calls (would crash the native layer). */
let _loadingPromise: Promise<void> | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if the model GGUF file is already on disk. */
export async function isModelDownloaded(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (!info.exists) return false;
    return info.size > 10_000_000; // >10MB = real file, not a partial/empty
  } catch {
    return false;
  }
}

/** Returns the file size in bytes (for Settings display), or 0 if not downloaded. */
export async function getModelSizeOnDisk(): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (!info.exists) return 0;
    return info.size;
  } catch {
    return 0;
  }
}

/**
 * Download the model with progress callbacks.
 * Supports pause/resume via the DownloadResumable handle.
 */
export async function downloadModel(
  onProgress: DownloadProgressCallback,
  onComplete: () => void,
  onError: (err: Error) => void,
): Promise<void> {
  try {
    // Check already exists
    if (await isModelDownloaded()) {
      onProgress(100);
      onComplete();
      return;
    }

    _downloadResumable = FileSystem.createDownloadResumable(
      MODEL_URL,
      MODEL_PATH,
      {},
      (downloadProgress) => {
        const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
        if (totalBytesExpectedToWrite > 0) {
          const pct = Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100);
          onProgress(pct);
        }
      },
    );

    await _downloadResumable.downloadAsync();
    _downloadResumable = null;
    onProgress(100);
    onComplete();
  } catch (err) {
    _downloadResumable = null;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/** Cancel an in-progress download. */
export async function cancelDownload(): Promise<void> {
  if (_downloadResumable) {
    await _downloadResumable.pauseAsync().catch(() => {});
    _downloadResumable = null;
    // Remove partial file
    await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
  }
}

/** Delete the model from disk and release any loaded context. */
export async function deleteModel(): Promise<void> {
  await unloadModel();
  await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
}

/**
 * Load the model into memory (idempotent — reuses existing context).
 * Call this once before calling chat(). Takes 2–5 seconds on mid-range Android.
 */
export async function loadModel(): Promise<void> {
  if (_context) return; // already loaded
  if (_loadingPromise) return _loadingPromise; // in-progress: wait instead of double-init

  _loadingPromise = initLlama({
    model: MODEL_PATH,
    n_ctx: 2048,   // context window
    n_threads: 4,  // CPU threads; 4 is a safe default for mid-range Android
    n_batch: 512,
  }).then((ctx) => {
    _context = ctx;
    _loadingPromise = null;
  }).catch((err) => {
    _loadingPromise = null;
    throw err;
  });

  return _loadingPromise;
}

/** Free the native model context. Call when navigating away from AI screen. */
export async function unloadModel(): Promise<void> {
  if (_context) {
    await releaseAllLlama();
    _context = null;
  }
}

/**
 * Build the schedule-aware system prompt from today's events.
 */
function buildSystemPrompt(events: Event[]): string {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const scheduleLines = events.length === 0
    ? '  (No events scheduled today)'
    : events
        .map((e) => {
          const time = e.end_time ? `${e.start_time}–${e.end_time}` : e.start_time;
          const status = e.completed ? ' ✓' : '';
          return `  - ${time} ${e.title}${status}`;
        })
        .join('\n');

  return `You are freeflow, a minimal and thoughtful scheduling assistant.
Today is ${dayName}, ${dateStr}.

The user's schedule today:
${scheduleLines}

Respond in 1–3 sentences maximum. Be warm but concise. Do not repeat the schedule back unless asked.`;
}

/**
 * Run inference and stream tokens via callback.
 * Automatically loads the model if not already loaded.
 */
export async function chat(
  userMessages: Array<{ role: 'user' | 'assistant'; text: string }>,
  events: Event[],
  onToken: TokenCallback,
): Promise<string> {
  if (!_context) {
    await loadModel();
  }
  if (!_context) throw new Error('Model failed to load');

  const systemPrompt = buildSystemPrompt(events);

  // Build OpenAI-compatible message array
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...userMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text })),
  ];

  let fullText = '';

  await _context.completion(
    {
      messages,
      n_predict: 200,       // reduced from 256 — leaves room for history in 2048-token window
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      // Repeat penalty — critical for small models to stop echoing prior tokens
      penalty_repeat: 1.15,
      penalty_last_n: 64,
      stop: [
        '</s>', '<|im_end|>', '<|endoftext|>',
        'User:', 'Human:', 'Assistant:',   // prevent model roleplaying both sides
        '\nUser:', '\nHuman:', '\nAssistant:',
      ],
    },
    (data) => {
      const token = data.token;
      fullText += token;
      onToken(token);
    },
  );

  return fullText;
}
