import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  getEventsForDateRange,
  getCompletedEventCountPerDay,
  getEventsByDate,
  getScheduledMinutesPerDay,
} from '@/db/events';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Dialog } from '@/components/ui/Dialog';
import {
  HeadlineMd, BodyMd, LabelMd, LabelSm,
} from '@/components/ui/Typography';
import { colors as staticColors, spacing, radius, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeContext';
import { useLlama } from '@/hooks/useLlama';

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function subtractDays(from: string, n: number): string {
  const d = new Date(from); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function addDays(from: string, n: number): string {
  const d = new Date(from); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function allDatesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = start;
  while (cur <= end) { dates.push(cur); cur = addDays(cur, 1); }
  return dates;
}

// ── GitHub-style heatmap (A1) ─────────────────────────────────────────────────
// Color levels: 0 = empty, 1-4 = progressively darker primary shades
function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3)  return 2;
  if (count <= 5)  return 3;
  return 4;
}

function WorkloadHeatmap({
  countByDate,
}: {
  countByDate: Record<string, number>;
}) {
  const colors = useThemeColors();
  const today = todayISO();
  const start = subtractDays(today, 69);
  const dates = allDatesBetween(start, today);

  // Build week columns (7 rows, Mon–Sun)
  const weeks: string[][] = [];
  let week: string[] = [];
  const firstDow = (new Date(start).getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) week.push('');
  for (const d of dates) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(''); weeks.push(week); }

  // Month labels
  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((wk, i) => {
    const first = wk.find(d => d !== '');
    if (first) {
      const d = new Date(first);
      if (d.getDate() <= 7) {
        monthLabels.push({ label: d.toLocaleString('default', { month: 'short' }), col: i });
      }
    }
  });

  // Day labels Mon/Wed/Fri
  const DAY_LABELS = ['M', '', 'W', '', 'F', '', ''];

  // Heat colors mapped from primary
  const HEAT = [
    `${colors.surfaceContainerHighest}`,
    `${colors.primary}28`,
    `${colors.primary}55`,
    `${colors.primary}90`,
    colors.primary,
  ];

  return (
    <View>
      {/* Month row */}
      <View style={heatStyles.monthRow}>
        {monthLabels.map((m, i) => (
          <LabelSm key={i} style={{ position: 'absolute', fontSize: 9, left: m.col * 14 + m.col * 3, color: colors.onSurfaceVariant }}>
            {m.label}
          </LabelSm>
        ))}
      </View>

      <View style={{ flexDirection: 'row' }}>
        {/* Day labels */}
        <View style={heatStyles.dayLabels}>
          {DAY_LABELS.map((l, i) => (
            <LabelSm key={i} style={{ fontSize: 8, height: 14, lineHeight: 14, color: colors.onSurfaceVariant }}>{l}</LabelSm>
          ))}
        </View>

        {/* Grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={heatStyles.grid}>
            {weeks.map((wk, wi) => (
              <View key={wi} style={heatStyles.col}>
                {wk.map((d, di) => (
                  <View
                    key={di}
                    style={[
                      heatStyles.cell,
                      {
                        backgroundColor: d
                          ? HEAT[heatLevel(countByDate[d] ?? 0)]
                          : 'transparent',
                        borderWidth: d === today ? 1.5 : 0,
                        borderColor: colors.primary,
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Legend */}
      <View style={heatStyles.legend}>
        <LabelSm style={{ fontSize: 9, color: colors.onSurfaceVariant }}>Less</LabelSm>
        {HEAT.map((c, i) => (
          <View key={i} style={[heatStyles.cell, { backgroundColor: c }]} />
        ))}
        <LabelSm style={{ fontSize: 9, color: colors.onSurfaceVariant }}>More</LabelSm>
      </View>
    </View>
  );
}

const heatStyles = StyleSheet.create({
  monthRow: { flexDirection: 'row', height: 14, marginBottom: 4, marginLeft: 18 },
  dayLabels: { width: 14, gap: 3, marginRight: 3 },
  grid: { flexDirection: 'row', gap: 3 },
  col: { gap: 3 },
  cell: { width: 11, height: 11, borderRadius: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: spacing.sm },
});

// ── Streak (A1) — counts consecutive days with ANY scheduled event ─────────────
function computeStreak(eventDates: Set<string>): { current: number; longest: number } {
  const today = todayISO();

  // Current streak: consecutive days ending today (or yesterday if today empty)
  let cur = 0;
  let d = today;
  if (!eventDates.has(d)) d = subtractDays(d, 1);
  while (eventDates.has(d)) { cur++; d = subtractDays(d, 1); }

  // Longest streak across all known dates
  let longest = 0;
  let run = 0;
  const sorted = Array.from(eventDates).sort();
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { run = 1; }
    else {
      const prev = sorted[i - 1];
      const expectedNext = addDays(prev, 1);
      run = sorted[i] === expectedNext ? run + 1 : 1;
    }
    if (run > longest) longest = run;
  }

  return { current: cur, longest };
}

// ── Burnout risk (A2) — with actionable recommendations ──────────────────────
type Risk = 'Low' | 'Moderate' | 'High';

interface BurnoutResult {
  risk: Risk;
  avgHours: number;
  recommendations: string[];
}

function computeBurnout(minutesPerDay: { date: string; minutes: number }[]): BurnoutResult {
  if (minutesPerDay.length === 0) {
    return {
      risk: 'Low', avgHours: 0,
      recommendations: ['Start scheduling your day to build momentum.'],
    };
  }
  const total = minutesPerDay.reduce((s, d) => s + d.minutes, 0);
  const avgHours = total / 60 / Math.max(minutesPerDay.length, 1);

  if (avgHours > 8) return {
    risk: 'High', avgHours,
    recommendations: [
      'Block 15-min breaks between every 90-min work session.',
      'Reserve one morning per week completely event-free.',
      'Defer non-urgent tasks to next week.',
    ],
  };
  if (avgHours > 6) return {
    risk: 'Moderate', avgHours,
    recommendations: [
      'Add a midday recovery block (walk, lunch, rest).',
      'Protect your last hour of the day from new meetings.',
    ],
  };
  return {
    risk: 'Low', avgHours,
    recommendations: ['Workload looks healthy. Keep the current rhythm.'],
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const today = todayISO();
  const tenWeeksAgo = subtractDays(today, 69);
  const weekAgo = subtractDays(today, 6);
  const flatListRef = useRef<FlatList>(null);

  // A1 — Streak: count days with ANY event (scheduled, not just completed)
  const eventDates = useMemo(() => {
    const rows = getEventsForDateRange(tenWeeksAgo, today);
    return new Set(rows.map(e => e.date));
  }, [today, tenWeeksAgo]);

  const streakResult = useMemo(() => computeStreak(eventDates), [eventDates]);
  const streak = streakResult.current;
  const longestStreak = streakResult.longest;

  // Heatmap still uses completed events per day for visual density
  const completedCounts = useMemo(() => {
    const rows = getCompletedEventCountPerDay(tenWeeksAgo, today);
    return Object.fromEntries(rows.map(r => [r.date, r.count]));
  }, [today, tenWeeksAgo]);

  // A2 — Burnout with recommendations
  const burnout = useMemo(() => {
    const mins = getScheduledMinutesPerDay(weekAgo, today);
    return computeBurnout(mins);
  }, [weekAgo, today]);

  const todayEvents = useMemo(() => getEventsByDate(today), [today]);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [input, setInput] = useState('');
  const [downloadDialog, setDownloadDialog] = useState(false);
  const llama = useLlama();

  const { isDownloaded, isDownloading, isThinking, startDownload, sendMessage: llamaSend } = llama;

  useEffect(() => {
    if (chatOpen && llama.messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [llama.messages, chatOpen]);

  // A3 — FAB: show dialog instead of Alert
  const handleFABPress = useCallback(() => {
    if (!isDownloaded && !isDownloading) {
      setDownloadDialog(true);
    } else {
      setChatOpen(true);
    }
  }, [isDownloaded, isDownloading]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isThinking) return;
    const text = input.trim();
    setInput('');
    llamaSend(text, todayEvents);
  }, [input, isThinking, llamaSend, todayEvents]);

  const RISK_COLOR: Record<Risk, string> = {
    Low: colors.secondary,
    Moderate: colors.tertiary,
    High: colors.error,
  };
  const RISK_ICON: Record<Risk, string> = {
    Low: 'leaf',
    Moderate: 'alert-circle-outline',
    High: 'fire',
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader subtitle="AI & Insights" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Workload Heatmap + Streak card ─────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.cardHeader}>
            <View>
              <LabelMd color={colors.onSurface}>Workload Consistency</LabelMd>
              <LabelSm color={colors.onSurfaceVariant}>Completed events per day</LabelSm>
            </View>
            {/* Streak badge */}
            <View style={[styles.streakBadge, { backgroundColor: streak > 0 ? `${colors.primary}15` : colors.surfaceContainerHigh, borderColor: streak > 0 ? `${colors.primary}40` : colors.outlineVariant }]}>
              <MaterialCommunityIcons
                name={streak > 0 ? 'fire' : 'fire-off'}
                size={20}
                color={streak > 0 ? colors.primary : colors.outline}
              />
              <View>
                <LabelSm style={[styles.streakNum, { color: streak > 0 ? colors.primary : colors.outline }]}>
                  {streak}
                </LabelSm>
                <LabelSm style={{ fontSize: 8, color: colors.onSurfaceVariant, letterSpacing: 0.5 }}>
                  DAY{streak !== 1 ? 'S' : ''}
                </LabelSm>
              </View>
            </View>
          </View>
          <WorkloadHeatmap countByDate={completedCounts} />
          <View style={styles.heatFooter}>
            <LabelSm color={colors.onSurfaceVariant} style={{ fontSize: 9 }}>10 wks ago</LabelSm>
            <LabelSm color={colors.onSurfaceVariant} style={{ fontSize: 9 }}>Today</LabelSm>
          </View>
          {/* Zero-state text / longest streak */}
          {streak === 0 ? (
            <LabelSm color={colors.onSurfaceVariant} style={{ marginTop: spacing.sm }}>
              No active streak — schedule events to start one.
            </LabelSm>
          ) : (
            <LabelSm color={colors.onSurfaceVariant} style={{ marginTop: spacing.sm }}>
              🔥 {streak}-day streak · Longest: {longestStreak} day{longestStreak !== 1 ? 's' : ''}
            </LabelSm>
          )}
        </View>

        {/* ── Burnout Risk card (A2) ──────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.burnoutHeader}>
            <MaterialCommunityIcons
              name={RISK_ICON[burnout.risk] as any}
              size={18}
              color={RISK_COLOR[burnout.risk]}
            />
            <LabelMd color={colors.onSurface}>Burnout Risk</LabelMd>
            <View style={[styles.riskChip, { backgroundColor: `${RISK_COLOR[burnout.risk]}18`, borderColor: `${RISK_COLOR[burnout.risk]}40` }]}>
              <LabelSm style={{ color: RISK_COLOR[burnout.risk] }}>{burnout.risk}</LabelSm>
            </View>
          </View>

          <LabelSm color={colors.onSurfaceVariant} style={styles.avgLine}>
            Avg {burnout.avgHours.toFixed(1)} h/day this week
          </LabelSm>

          <View style={[styles.recoBox, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
            {burnout.recommendations.map((rec, i) => (
              <View key={i} style={styles.recoRow}>
                <MaterialCommunityIcons name="circle-small" size={16} color={colors.primary} />
                <BodyMd color={colors.onSurface} style={{ flex: 1, fontSize: 14 }}>{rec}</BodyMd>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── A3 AI pill button ──────────────────────────────────────────────── */}
      <View style={[styles.fabContainer, { bottom: 90 + insets.bottom }]}>
        <TouchableOpacity
          style={[
            styles.fabPill,
            { backgroundColor: isDownloading ? colors.primaryContainer : colors.primary },
          ]}
          onPress={handleFABPress}
          activeOpacity={0.85}
        >
          {/* Inline progress bar that fills the pill during download */}
          {isDownloading && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  width: `${llama.downloadProgress}%` as any,
                  backgroundColor: `${colors.primary}55`,
                  borderRadius: radius.full,
                },
              ]}
            />
          )}
          <MaterialCommunityIcons
            name={isDownloading ? 'download' : isDownloaded ? 'auto-fix' : 'brain'}
            size={20}
            color={isDownloading ? colors.onPrimaryContainer : colors.onPrimary}
          />
          <LabelMd
            color={isDownloading ? colors.onPrimaryContainer : colors.onPrimary}
            style={{ letterSpacing: 0.2 }}
          >
            {isDownloading
              ? `Downloading ${llama.downloadProgress}%`
              : isDownloaded
                ? 'Ask freeflow AI'
                : 'Download AI Model (200MB)'}
          </LabelMd>
        </TouchableOpacity>
      </View>

      {/* ── Chat Bottom Sheet (replaces Modal) ─────────────────────────────── */}
      <BottomSheet visible={chatOpen} onClose={() => setChatOpen(false)} maxHeightRatio={0.88}>
        <View style={styles.chatHeader}>
          <View>
            <LabelMd color={colors.onSurface}>Ask AI</LabelMd>
            <LabelSm color={llama.isLoaded ? colors.secondary : colors.onSurfaceVariant}>
              {llama.isLoaded
                ? 'SmolLM2 · ready'
                : isDownloading
                  ? `Downloading… ${llama.downloadProgress}%`
                  : 'SmolLM2 · offline'}
            </LabelSm>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity onPress={llama.clearMessages} style={[styles.iconBtn, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialCommunityIcons name="delete-sweep-outline" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setChatOpen(false)} style={[styles.iconBtn, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialCommunityIcons name="close" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Download progress bar */}
        {isDownloading && (
          <View style={[styles.progressWrap, { backgroundColor: `${colors.primaryContainer}55` }]}>
            <View style={[styles.progressFill, { width: `${llama.downloadProgress}%` as any, backgroundColor: colors.primary }]} />
          </View>
        )}

        {/* Error banner */}
        {llama.downloadError ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.errorContainer}88`, borderColor: colors.error }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.error} />
            <LabelSm color={colors.error} style={{ flex: 1 }}>
              {llama.downloadError}
            </LabelSm>
            <TouchableOpacity onPress={llama.startDownload}>
              <LabelSm color={colors.primary}>Retry</LabelSm>
            </TouchableOpacity>
          </View>
        ) : null}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            ref={flatListRef}
            data={llama.messages}
            keyExtractor={(_, i) => String(i)}
            style={styles.msgList}
            contentContainerStyle={{ gap: spacing.sm, padding: spacing.sm }}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <MaterialCommunityIcons name="auto-fix" size={32} color={`${colors.outline}88`} />
                <LabelSm color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
                  Ask me about your schedule,{'\n'}focus strategies, or anything else.
                </LabelSm>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[
                styles.bubble,
                item.role === 'user'
                  ? [styles.bubbleUser, { backgroundColor: colors.primary }]
                  : [styles.bubbleAI, { backgroundColor: colors.surfaceContainerHigh }],
              ]}>
                <BodyMd
                  color={item.role === 'user' ? colors.onPrimary : colors.onSurface}
                  style={{ fontSize: 15, lineHeight: 22 }}
                >
                  {item.text}{item.streaming ? '▍' : ''}
                </BodyMd>
              </View>
            )}
          />

          {isThinking && !llama.messages[llama.messages.length - 1]?.streaming && (
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <LabelSm color={colors.onSurfaceVariant}>Thinking…</LabelSm>
            </View>
          )}

          <View style={[styles.inputRow, { borderTopColor: colors.outlineVariant }]}>
            <TextInput
              style={[styles.input, { color: colors.onSurface, backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}
              placeholder={!isDownloaded ? 'Model not downloaded yet…' : 'Ask about your schedule…'}
              placeholderTextColor={`${colors.onSurfaceVariant}99`}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline
              editable={isDownloaded && !isThinking}
            />
            <TouchableOpacity
              onPress={handleSend}
              style={[styles.sendBtn, { backgroundColor: colors.primary }, (!isDownloaded || isThinking) && { opacity: 0.38 }]}
              disabled={!isDownloaded || isThinking}
            >
              <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>

      {/* Download confirmation dialog */}
      <Dialog
        visible={downloadDialog}
        title="Download AI Model?"
        message="SmolLM2 360M (~200 MB) will be downloaded over Wi-Fi and stored on your device. This is a one-time download."
        actions={[
          { label: 'Cancel', onPress: () => setDownloadDialog(false) },
          {
            label: 'Download', primary: true,
            onPress: () => {
              setDownloadDialog(false);
              startDownload();
              setChatOpen(true);
            },
          },
        ]}
        onDismiss={() => setDownloadDialog(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const { colors } = { colors: staticColors };

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.marginMobile, paddingTop: spacing.lg },

  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  streakNum: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  heatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },

  burnoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  riskChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  avgLine: { marginBottom: spacing.md, fontSize: 12 },
  recoBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  recoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },

  // A3 FAB pill
  fabContainer: {
    position: 'absolute',
    right: spacing.marginMobile,
    alignItems: 'flex-end',
  },
  fabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    elevation: 6,
    overflow: 'hidden',
  },

  // Chat sheet
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  iconBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  progressWrap: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: { height: 3, borderRadius: 2 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  msgList: { maxHeight: 340 },
  emptyChat: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    opacity: 0.7,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAI:   { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    ...typography.bodyMd,
  },
  sendBtn: {
    padding: 10,
    borderRadius: radius.full,
  },
});
