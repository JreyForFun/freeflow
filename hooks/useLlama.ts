/**
 * useLlama — React hook that wraps LlamaService for use in components.
 *
 * Exposes download state, load state, and a sendMessage function that
 * streams tokens into a callback as the model generates them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as llamaService from '@/services/llamaService';
import type { Event } from '@/db/events';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  streaming?: boolean; // true while token stream is in progress
}

interface UseLlamaReturn {
  // Download state
  isDownloaded: boolean;
  isDownloading: boolean;
  downloadProgress: number; // 0–100
  downloadError: string | null;

  // Model state
  isLoaded: boolean;
  isThinking: boolean;

  // Chat
  messages: ChatMessage[];

  // Actions
  startDownload: () => void;
  cancelDownload: () => void;
  deleteModel: () => Promise<void>;
  sendMessage: (text: string, events: Event[]) => Promise<void>;
  clearMessages: () => void;
}

// Max turns kept in the sliding history window sent to the model.
// Older turns are dropped to prevent overflowing the 2048-token context.
const MAX_HISTORY_TURNS = 10;

const GREETING_TEXT = "Hi! I'm your offline scheduling assistant. Ask me anything about your day.";

const INITIAL_GREETING: ChatMessage = {
  role: 'ai',
  text: GREETING_TEXT,
};

export function useLlama(): UseLlamaReturn {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);

  // Keep a ref to the full conversation history.
  // Seeded with the greeting so the model knows it already introduced itself.
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; text: string }>>(
    [{ role: 'assistant', text: GREETING_TEXT }]
  );
  // Ref that mirrors isLoaded — never stale inside callbacks
  const isLoadedRef = useRef(false);

  // Check download status on mount
  useEffect(() => {
    llamaService.isModelDownloaded().then(setIsDownloaded);
  }, []);

  // ── Download ──────────────────────────────────────────────────────────────
  const startDownload = useCallback(() => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress(0);

    llamaService.downloadModel(
      (pct) => setDownloadProgress(pct),
      () => {
        setIsDownloading(false);
        setIsDownloaded(true);
        setDownloadProgress(100);
      },
      (err) => {
        setIsDownloading(false);
        setDownloadError(err.message);
      },
    );
  }, []);

  const cancelDownload = useCallback(async () => {
    await llamaService.cancelDownload();
    setIsDownloading(false);
    setDownloadProgress(0);
  }, []);

  const deleteModel = useCallback(async () => {
    await llamaService.deleteModel();
    setIsDownloaded(false);
    isLoadedRef.current = false;
    setIsLoaded(false);
    setDownloadProgress(0);
    // Reset conversation so stale history isn't fed into a freshly loaded model
    historyRef.current = [{ role: 'assistant', text: GREETING_TEXT }];
    setMessages([INITIAL_GREETING]);
  }, []);

  // ── Load model on first chat (lazy) ────────────────────────────────────
  const ensureLoaded = useCallback(async () => {
    if (isLoadedRef.current) return; // always-current ref, never stale
    await llamaService.loadModel();
    isLoadedRef.current = true;
    setIsLoaded(true);
  }, []); // no deps — ref is always current

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, events: Event[]) => {
      if (!text.trim() || isThinking) return;

      // Append user message
      const userMsg: ChatMessage = { role: 'user', text: text.trim() };
      setMessages((prev) => [...prev, userMsg]);

      // Add to history for context
      historyRef.current.push({ role: 'user', text: text.trim() });

      // Create a placeholder streaming AI bubble
      const aiPlaceholder: ChatMessage = { role: 'ai', text: '', streaming: true };
      setMessages((prev) => [...prev, aiPlaceholder]);

      setIsThinking(true);

      try {
        await ensureLoaded();

        let accumulated = '';

        // ── Sliding window: keep only the last MAX_HISTORY_TURNS turns ──────
        // Each turn = 1 user + 1 assistant message = 2 entries.
        // We always keep the greeting (index 0) + last N*2 entries after it.
        const greeting = historyRef.current[0];
        const tail = historyRef.current.slice(1);
        const windowedTail = tail.slice(-MAX_HISTORY_TURNS * 2);
        const windowedHistory = greeting ? [greeting, ...windowedTail] : windowedTail;

        await llamaService.chat(windowedHistory, events, (token) => {
          accumulated += token;
          // Update the last message in place as tokens stream in
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'ai',
              text: accumulated,
              streaming: true,
            };
            return updated;
          });
        });

        // Mark streaming as done
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'ai',
            text: accumulated,
            streaming: false,
          };
          return updated;
        });

        // Add assistant reply to history
        historyRef.current.push({ role: 'assistant', text: accumulated });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Something went wrong.';
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'ai',
            text: `⚠️ ${errMsg}`,
            streaming: false,
          };
          return updated;
        });
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, ensureLoaded],
  );

  const clearMessages = useCallback(() => {
    // Re-seed history with greeting so model never re-greets after clear
    historyRef.current = [{ role: 'assistant', text: GREETING_TEXT }];
    setMessages([INITIAL_GREETING]);
  }, []);

  return {
    isDownloaded,
    isDownloading,
    downloadProgress,
    downloadError,
    isLoaded,
    isThinking,
    messages,
    startDownload,
    cancelDownload,
    deleteModel,
    sendMessage,
    clearMessages,
  };
}
