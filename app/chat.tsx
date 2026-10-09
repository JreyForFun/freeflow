/**
 * app/chat.tsx — Full-screen AI chat
 *
 * Features:
 *  - Model chip in header → opens model picker BottomSheet
 *  - Two model cards (SmolLM2-360M + Qwen2.5-1.5B) with per-state UI
 *  - Rich AppContext injected into every sendMessage call (schedule + burnout)
 *  - 'notice' bubble: UI-only system message after model switch
 *  - canSend guards: !isThinking, !isSwitching, activeModel downloaded
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  getEventsByDate,
  getTodayEventStats,
  getScheduledMinutesPerDay,
  getLongestContinuousBlockMinutes,
} from '@/db/events';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { BodyMd, LabelMd, LabelSm } from '@/components/ui/Typography';
import { spacing, radius, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeContext';
import { useLlama } from '@/hooks/useLlama';
import type { ModelDef, ModelState, AppContext } from '@/hooks/useLlama';

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function subtractDays(from: string, n: number): string {
  const d = new Date(from + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Build the full AppContext from the local DB for the system prompt. */
function buildAppContext(today: string): AppContext {
  const weekAgo = subtractDays(today, 6);
  const todayEvents = getEventsByDate(today);
  const todayStats = getTodayEventStats(today);
  const weekMins = getScheduledMinutesPerDay(weekAgo, today);

  let avgActiveHours = 0;
  let heavyDays = 0;
  let maxBlockMinutes = 0;

  if (weekMins.length > 0) {
    const total = weekMins.reduce((s, d) => s + d.minutes, 0);
    avgActiveHours = total / 60 / weekMins.length;
    heavyDays = weekMins.filter((d) => d.minutes > 300).length;
    maxBlockMinutes = weekMins.reduce(
      (m, d) => Math.max(m, getLongestContinuousBlockMinutes(d.date)),
      0,
    );
  }

  const risk: 'Low' | 'Moderate' | 'High' =
    avgActiveHours > 6 || heavyDays >= 4 || maxBlockMinutes >= 210
      ? 'High'
      : avgActiveHours > 3.5 || heavyDays >= 2 || maxBlockMinutes >= 105
        ? 'Moderate'
        : 'Low';

  return {
    todayEvents,
    todayStats,
    burnout: { risk, avgActiveHours, heavyDays, maxBlockMinutes },
  };
}

// ── ModelCard ─────────────────────────────────────────────────────────────────
interface ModelCardProps {
  def: ModelDef;
  state: ModelState;
  isActive: boolean;
  isSwitching: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onSwitch: () => void;
}

function ModelCard({
  def, state, isActive, isSwitching, onDownload, onCancel, onSwitch,
}: ModelCardProps) {
  const colors = useThemeColors();

  const cardBg = isActive
    ? `${colors.primaryContainer}40`
    : colors.surfaceContainerLow;
  const borderColor = isActive ? `${colors.primary}60` : `${colors.outlineVariant}60`;

  return (
    <View style={[cardStyles.card, { backgroundColor: cardBg, borderColor }]}>
      {/* Title row */}
      <View style={cardStyles.titleRow}>
        <MaterialCommunityIcons name="robot-outline" size={18} color={colors.primary} />
        <LabelMd color={colors.onSurface} style={{ flex: 1, marginLeft: 8 }}>
          {def.name}
        </LabelMd>
        <View style={[cardStyles.tag, { backgroundColor: `${colors.primary}20` }]}>
          <LabelSm style={{ fontSize: 10, color: colors.primary }}>{def.tag}</LabelSm>
        </View>
      </View>

      {/* Description */}
      <LabelSm style={{ color: colors.onSurfaceVariant, marginTop: 4, marginLeft: 26 }}>
        {def.description} · {def.sizeLabel}
      </LabelSm>

      {/* State-based action row */}
      <View style={{ marginTop: 12, marginLeft: 26 }}>
        {/* ── Active ── */}
        {isActive && !isSwitching && (
          <View style={cardStyles.activeRow}>
            <MaterialCommunityIcons name="check-circle" size={14} color={colors.primary} />
            <LabelSm style={{ color: colors.primary, marginLeft: 4, fontWeight: '600' }}>
              Active
            </LabelSm>
          </View>
        )}

        {/* ── Switching in progress ── */}
        {isActive && isSwitching && (
          <View style={cardStyles.activeRow}>
            <ActivityIndicator size={14} color={colors.primary} />
            <LabelSm style={{ color: colors.primary, marginLeft: 6 }}>Loading model…</LabelSm>
          </View>
        )}

        {/* ── Downloaded, not active ── */}
        {state.isDownloaded && !isActive && (
          <TouchableOpacity
            style={[cardStyles.btn, { backgroundColor: colors.primary }]}
            onPress={onSwitch}
            disabled={isSwitching}
            activeOpacity={0.8}
          >
            <LabelSm style={{ color: colors.onPrimary, fontWeight: '600' }}>
              Switch to this model
            </LabelSm>
          </TouchableOpacity>
        )}

        {/* ── Downloading ── */}
        {state.isDownloading && (
          <View>
            <View style={[cardStyles.progressTrack, { backgroundColor: `${colors.outlineVariant}40` }]}>
              <View
                style={[
                  cardStyles.progressFill,
                  { width: `${state.downloadProgress}%` as any, backgroundColor: colors.primary },
                ]}
              />
            </View>
            <View style={cardStyles.downloadingRow}>
              <LabelSm style={{ color: colors.primary, fontSize: 11 }}>
                {state.downloadProgress}%
              </LabelSm>
              <TouchableOpacity onPress={onCancel}>
                <LabelSm style={{ color: colors.error, fontSize: 11 }}>Cancel</LabelSm>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Not downloaded ── */}
        {!state.isDownloaded && !state.isDownloading && (
          <TouchableOpacity
            style={[cardStyles.btn, { backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outlineVariant }]}
            onPress={onDownload}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="download-outline" size={14} color={colors.onSurface} />
            <LabelSm style={{ color: colors.onSurface, marginLeft: 4 }}>
              Download {def.sizeLabel}
            </LabelSm>
          </TouchableOpacity>
        )}

        {/* ── Download error ── */}
        {state.downloadError && (
          <LabelSm style={{ color: colors.error, marginTop: 4, fontSize: 11 }}>
            ⚠ {state.downloadError}
          </LabelSm>
        )}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.default,
    alignSelf: 'flex-start',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
  },
  downloadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});

// ── ChatScreen ────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [input, setInput] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);

  const llama = useLlama();
  const {
    messages, isThinking, isLoaded, isSwitching,
    activeModelId, modelStates, models,
    sendMessage: llamaSend, clearMessages,
    startDownload, cancelDownload, switchModel,
  } = llama;

  const today = useMemo(() => todayISO(), []);

  // Convenience: state for the currently-active model
  const activeState = modelStates[activeModelId] ?? {
    isDownloaded: false, isDownloading: false, downloadProgress: 0, downloadError: null,
  };
  const activeModelDef = models.find((m) => m.id === activeModelId);
  const canSend =
    input.trim().length > 0 &&
    !isThinking &&
    !isSwitching &&
    activeState.isDownloaded;

  // Auto-scroll to latest message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!canSend) return;
    const text = input.trim();
    setInput('');
    const appCtx = buildAppContext(today);
    llamaSend(text, appCtx);
  }, [canSend, input, today, llamaSend]);

  // ── Switch model (closes picker on success) ───────────────────────────────
  const handleSwitch = useCallback(async (modelId: string) => {
    await switchModel(modelId);
    setPickerVisible(false);
  }, [switchModel]);

  // ── Render bubble ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: typeof messages[0] }) => {
    // Notice bubble — UI-only, centered, faint
    if (item.role === 'notice') {
      return (
        <View style={[bubbleStyles.notice]}>
          <LabelSm style={{ fontSize: 11, color: colors.onSurfaceVariant, opacity: 0.7, textAlign: 'center' }}>
            ℹ︎ {item.text}
          </LabelSm>
        </View>
      );
    }

    return (
      <View
        style={[
          bubbleStyles.bubble,
          item.role === 'user'
            ? [bubbleStyles.bubbleUser, { backgroundColor: colors.primary }]
            : [bubbleStyles.bubbleAI, { backgroundColor: colors.surfaceContainerHigh }],
        ]}
      >
        <BodyMd
          color={item.role === 'user' ? colors.onPrimary : colors.onSurface}
          style={{ fontSize: 15, lineHeight: 22 }}
        >
          {item.text}{item.streaming ? '▍' : ''}
        </BodyMd>
      </View>
    );
  }, [colors]);

  // ── Chip label ────────────────────────────────────────────────────────────
  const chipLabel = isSwitching
    ? 'Loading…'
    : activeModelDef
      ? `${activeModelDef.name} · ${activeModelDef.tag}`
      : 'No model ▾';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.surfaceContainerLowest,
            borderBottomColor: colors.outlineVariant,
          },
        ]}
      >
        {/* Back */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerBtn, { backgroundColor: colors.surfaceContainerHigh }]}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.onSurface} />
        </TouchableOpacity>

        {/* Center */}
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="robot" size={17} color={colors.primary} />
          <LabelMd color={colors.onSurface} style={{ marginLeft: 5 }}>freeflow AI</LabelMd>
        </View>

        {/* Right: model chip + clear */}
        <View style={styles.headerRight}>
          {/* Model chip */}
          <TouchableOpacity
            id="model-chip-btn"
            style={[
              styles.modelChip,
              {
                backgroundColor: colors.surfaceContainerHigh,
                borderColor: `${colors.outlineVariant}80`,
              },
            ]}
            onPress={() => setPickerVisible(true)}
            disabled={isSwitching}
            hitSlop={4}
          >
            {isSwitching ? (
              <ActivityIndicator size={11} color={colors.primary} />
            ) : (
              <MaterialCommunityIcons name="robot-outline" size={11} color={colors.primary} />
            )}
            <LabelSm
              style={{ fontSize: 10, color: colors.onSurface, marginHorizontal: 3, maxWidth: 90 }}
              numberOfLines={1}
            >
              {chipLabel}
            </LabelSm>
            <MaterialCommunityIcons name="chevron-down" size={11} color={colors.onSurfaceVariant} />
          </TouchableOpacity>

          {/* Clear */}
          <TouchableOpacity
            id="clear-chat-btn"
            onPress={clearMessages}
            style={[styles.headerBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="delete-sweep-outline" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Active model download progress bar ── */}
      {activeState.isDownloading && (
        <View style={[styles.progressWrap, { backgroundColor: `${colors.primaryContainer}55` }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${activeState.downloadProgress}%` as any, backgroundColor: colors.primary },
            ]}
          />
        </View>
      )}

      {/* ── Error banner for active model ── */}
      {activeState.downloadError ? (
        <View style={[styles.errorBanner, { backgroundColor: `${colors.errorContainer}88`, borderColor: colors.error }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.error} />
          <LabelSm color={colors.error} style={{ flex: 1 }}>{activeState.downloadError}</LabelSm>
          <TouchableOpacity onPress={() => startDownload(activeModelId)}>
            <LabelSm color={colors.primary}>Retry</LabelSm>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Chat area ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          style={styles.msgList}
          contentContainerStyle={{
            gap: spacing.sm,
            padding: spacing.md,
            paddingBottom: spacing.xl,
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <MaterialCommunityIcons name="robot-outline" size={48} color={`${colors.outline}88`} />
              <LabelMd color={colors.onSurfaceVariant} style={{ textAlign: 'center', marginTop: spacing.sm }}>
                Ask me about your schedule,{'\n'}focus tips, burnout risk, or anything.
              </LabelMd>
              {!activeState.isDownloaded && !activeState.isDownloading && (
                <LabelSm
                  color={colors.primary}
                  style={{ textAlign: 'center', marginTop: spacing.sm, opacity: 0.8 }}
                >
                  Tap the model chip ↑ to download a model first.
                </LabelSm>
              )}
            </View>
          }
          renderItem={renderItem}
        />

        {/* Thinking indicator */}
        {isThinking && !messages[messages.length - 1]?.streaming && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <LabelSm color={colors.onSurfaceVariant}>Thinking…</LabelSm>
          </View>
        )}

        {/* ── Input row ── */}
        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: colors.outlineVariant,
              backgroundColor: colors.surfaceContainerLowest,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                color: colors.onSurface,
                backgroundColor: colors.surfaceContainerHigh,
                borderColor: colors.outlineVariant,
              },
            ]}
            placeholder={
              !activeState.isDownloaded
                ? 'Tap the chip above to download a model…'
                : isSwitching
                  ? 'Loading model…'
                  : 'Ask about your schedule…'
            }
            placeholderTextColor={`${colors.onSurfaceVariant}99`}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline
            editable={activeState.isDownloaded && !isThinking && !isSwitching}
          />
          <TouchableOpacity
            id="send-btn"
            onPress={handleSend}
            style={[
              styles.sendBtn,
              { backgroundColor: colors.primary },
              !canSend && { opacity: 0.38 },
            ]}
            disabled={!canSend}
          >
            <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Model Picker BottomSheet ── */}
      <BottomSheet visible={pickerVisible} onClose={() => setPickerVisible(false)}>
        <View style={{ paddingBottom: spacing.sm }}>
          {/* Picker header */}
          <View style={styles.pickerHeader}>
            <LabelMd color={colors.onSurface} style={{ fontWeight: '700' }}>Choose AI Model</LabelMd>
            <LabelSm color={colors.onSurfaceVariant} style={{ marginTop: 2 }}>
              Only one model is loaded at a time
            </LabelSm>
          </View>

          {/* Model cards */}
          {models.map((def) => (
            <ModelCard
              key={def.id}
              def={def}
              state={modelStates[def.id] ?? { isDownloaded: false, isDownloading: false, downloadProgress: 0, downloadError: null }}
              isActive={def.id === activeModelId}
              isSwitching={isSwitching && def.id === activeModelId}
              onDownload={() => startDownload(def.id)}
              onCancel={() => cancelDownload(def.id)}
              onSwitch={() => handleSwitch(def.id)}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const bubbleStyles = StyleSheet.create({
  bubble:     { maxWidth: '82%', borderRadius: radius.lg, padding: spacing.sm },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAI:   { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  notice: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  headerBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 2,
  },

  // Progress
  progressWrap: { height: 3, overflow: 'hidden' },
  progressFill: { height: 3 },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },

  // Chat
  msgList: { flex: 1 },
  emptyChat: {
    alignItems: 'center',
    paddingTop: 60,
    opacity: 0.8,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    ...typography.bodyMd,
  },
  sendBtn: {
    padding: 10,
    borderRadius: radius.full,
    marginBottom: 2,
  },

  // Picker
  pickerHeader: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
  },
});
