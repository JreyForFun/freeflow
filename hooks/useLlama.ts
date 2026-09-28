/**
 * useLlama — React hook wrapping LlamaService for multi-model AI chat.
 *
 * Key features:
 *  - Module-level singletons for messages + history: chat memory survives navigation
 *  - Per-model download state (each model downloads independently)
 *  - Active model ID persisted to SQLite settings table
 *  - switchModel(): unloads previous, loads new, inserts UI notice, persists pref
 *  - sendMessage() accepts AppContext (schedule + burnout data for system prompt)
 *  - deleteModel() guard: auto-selects another model if the active one is deleted
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as llamaService from '@/services/llamaService';
import type { ModelDef, AppContext } from '@/services/llamaService';
import { getDb } from '@/db/client';

// ── Re-exports so callers only import from one place ─────────────────────────
export type { ModelDef, AppContext } from '@/services/llamaService';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'ai' | 'notice'; // 'notice' = UI-only switch notification
  text: string;
  streaming?: boolean;
}

export interface ModelState {
  isDownloaded: boolean;
  isDownloading: boolean;
  downloadProgress: number;   // 0–100
  downloadError: string | null;
}

export interface UseLlamaReturn {
  // Chat
  messages: ChatMessage[];
  isThinking: boolean;
  isLoaded: boolean;

  // Multi-model
  models: ModelDef[];
  activeModelId: string;
  isSwitching: boolean;
  modelStates: Record<string, ModelState>;

  // Actions
  sendMessage: (text: string, appCtx: AppContext) => Promise<void>;
  clearMessages: () => void;
  switchModel: (modelId: string) => Promise<void>;
  startDownload: (modelId: string) => void;
  cancelDownload: (modelId: string) => void;
  deleteModel: (modelId: string) => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SETTINGS_KEY = 'active_model_id';
const DEFAULT_MODEL_ID = 'smollm2-360m';
const MAX_HISTORY_TURNS = 10; // sliding window: older turns dropped to fit 2048-token ctx

const GREETING_TEXT =
  "Hi! I'm freeflow AI. Ask me about your schedule, focus tips, burnout risk, or anything else.";
const INITIAL_GREETING: ChatMessage = { role: 'ai', text: GREETING_TEXT };

// ── Module-level singletons ───────────────────────────────────────────────────
// Persist across component unmount/remount (navigation away and back).
// The lazy useState initialiser below reads these on every fresh mount.
let _persistedMessages: ChatMessage[] = [INITIAL_GREETING];
let _persistedHistory: Array<{ role: 'user' | 'assistant'; text: string }> = [
  { role: 'assistant', text: GREETING_TEXT },
];

// ── SQLite preference helpers ─────────────────────────────────────────────────
function loadActiveModelPref(): string {
  try {
    const row = getDb().getFirstSync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [SETTINGS_KEY],
    );
    const id = row?.value ?? DEFAULT_MODEL_ID;
    // Validate the stored ID is still in the registry (guards against old IDs)
    return llamaService.MODEL_REGISTRY.some((m) => m.id === id) ? id : DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

function saveActiveModelPref(modelId: string): void {
  try {
    getDb().runSync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [SETTINGS_KEY, modelId],
    );
  } catch {
    // Non-fatal — preference just won't survive a cold start
  }
}

// ── Initial per-model state ───────────────────────────────────────────────────
function buildInitialModelStates(): Record<string, ModelState> {
  const out: Record<string, ModelState> = {};
  for (const m of llamaService.MODEL_REGISTRY) {
    out[m.id] = { isDownloaded: false, isDownloading: false, downloadProgress: 0, downloadError: null };
  }
  return out;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useLlama(): UseLlamaReturn {
  // Lazy initialisers read singletons/prefs once on mount
  const [messages, _setMessages] = useState<ChatMessage[]>(() => _persistedMessages);
  const [isThinking, setIsThinking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [activeModelId, setActiveModelId] = useState<string>(() => loadActiveModelPref());
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>(buildInitialModelStates);

  // Never-stale ref for isLoaded so async callbacks don't close over stale state
  const isLoadedRef = useRef(false);

  // ── setMessages wrapper — syncs state update back to singleton ────────────
  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      _setMessages((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        _persistedMessages = next; // keep singleton in sync
        return next;
      });
    },
    [],
  );

  // ── Patch a single model's state ──────────────────────────────────────────
  const patchModel = useCallback((modelId: string, patch: Partial<ModelState>) => {
    setModelStates((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], ...patch },
    }));
  }, []);

  // ── On mount: check which models are already downloaded ───────────────────
  useEffect(() => {
    (async () => {
      for (const m of llamaService.MODEL_REGISTRY) {
        const downloaded = await llamaService.isModelDownloaded(m.id);
        patchModel(m.id, { isDownloaded: downloaded });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── On mount / activeModelId change: sync isLoaded if already in memory ──
  useEffect(() => {
    // If the model is still in the native context (e.g. user navigated away and back)
    // reflect that in the UI immediately so the send button isn't disabled.
    const loadedId = llamaService.getActiveModelId();
    if (loadedId && loadedId === activeModelId) {
      isLoadedRef.current = true;
      setIsLoaded(true);
    }
  }, [activeModelId]);

  // ── Ensure the requested model is loaded (lazy, idempotent) ──────────────
  const ensureLoaded = useCallback(async (modelId: string) => {
    if (isLoadedRef.current && llamaService.getActiveModelId() === modelId) return;
    await llamaService.loadModel(modelId);
    isLoadedRef.current = true;
    setIsLoaded(true);
  }, []);

  // ── Download actions ──────────────────────────────────────────────────────
  const startDownload = useCallback(
    (modelId: string) => {
      patchModel(modelId, { isDownloading: true, downloadError: null, downloadProgress: 0 });

      llamaService.downloadModel(
        modelId,
        (pct) => patchModel(modelId, { downloadProgress: pct }),
        () => patchModel(modelId, { isDownloading: false, isDownloaded: true, downloadProgress: 100 }),
        (err) => patchModel(modelId, { isDownloading: false, downloadError: err.message }),
      );
    },
    [patchModel],
  );

  const cancelDownload = useCallback(
    async (modelId: string) => {
      await llamaService.cancelDownload(modelId);
      patchModel(modelId, { isDownloading: false, downloadProgress: 0 });
    },
    [patchModel],
  );

  // ── Delete model ──────────────────────────────────────────────────────────
  const deleteModel = useCallback(
    async (modelId: string) => {
      await llamaService.deleteModel(modelId); // unloads from memory if active
      patchModel(modelId, { isDownloaded: false, downloadProgress: 0 });

      // If we just deleted the active model, auto-select another downloaded one
      if (modelId === activeModelId) {
        isLoadedRef.current = false;
        setIsLoaded(false);

        const fallback = llamaService.MODEL_REGISTRY.find(
          (m) => m.id !== modelId && modelStates[m.id]?.isDownloaded,
        );
        const newId = fallback?.id ?? DEFAULT_MODEL_ID;
        setActiveModelId(newId);
        saveActiveModelPref(newId);
      }
    },
    [activeModelId, modelStates, patchModel],
  );

  // ── Switch model ──────────────────────────────────────────────────────────
  const switchModel = useCallback(
    async (modelId: string) => {
      if (modelId === activeModelId) return;
      if (!modelStates[modelId]?.isDownloaded) return; // must be downloaded first

      setIsSwitching(true);
      isLoadedRef.current = false;

      try {
        await llamaService.loadModel(modelId); // auto-unloads previous
        isLoadedRef.current = true;
        setIsLoaded(true);
        setActiveModelId(modelId);
        saveActiveModelPref(modelId);

        // Insert a UI-only notice bubble (NOT in _persistedHistory — model won't see it)
        const modelName =
          llamaService.MODEL_REGISTRY.find((m) => m.id === modelId)?.name ?? modelId;
        const notice: ChatMessage = {
          role: 'notice',
          text: `Switched to ${modelName}. Your conversation history is preserved.`,
        };
        setMessages((prev) => [...prev, notice]);
      } finally {
        setIsSwitching(false);
      }
    },
    [activeModelId, modelStates, setMessages],
  );

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, appCtx: AppContext) => {
      if (!text.trim() || isThinking) return;

      // Append user message to UI + history
      setMessages((prev) => [...prev, { role: 'user', text: text.trim() }]);
      _persistedHistory.push({ role: 'user', text: text.trim() });

      // Placeholder streaming bubble
      setMessages((prev) => [...prev, { role: 'ai', text: '', streaming: true }]);
      setIsThinking(true);

      try {
        await ensureLoaded(activeModelId);

        let accumulated = '';

        // Sliding window: always keep the greeting + the last N*2 turns
        const [greeting, ...tail] = _persistedHistory;
        const windowedHistory = greeting
          ? [greeting, ...tail.slice(-MAX_HISTORY_TURNS * 2)]
          : tail.slice(-MAX_HISTORY_TURNS * 2);

        await llamaService.chat(activeModelId, windowedHistory, appCtx, (token) => {
          accumulated += token;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'ai', text: accumulated, streaming: true };
            return updated;
          });
        });

        // Mark streaming done
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'ai', text: accumulated, streaming: false };
          return updated;
        });

        _persistedHistory.push({ role: 'assistant', text: accumulated });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Something went wrong.';
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'ai', text: `⚠️ ${errMsg}`, streaming: false };
          return updated;
        });
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, activeModelId, ensureLoaded, setMessages],
  );

  // ── Clear messages ────────────────────────────────────────────────────────
  const clearMessages = useCallback(() => {
    // Replace the singleton array so a fresh history starts
    _persistedHistory = [{ role: 'assistant', text: GREETING_TEXT }];
    _persistedMessages = [INITIAL_GREETING];
    _setMessages([INITIAL_GREETING]); // bypass wrapper to avoid double-assign
  }, []);

  return {
    messages,
    isThinking,
    isLoaded,
    models: llamaService.MODEL_REGISTRY,
    activeModelId,
    isSwitching,
    modelStates,
    sendMessage,
    clearMessages,
    switchModel,
    startDownload,
    cancelDownload,
    deleteModel,
  };
}
