import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  getEventsForDateRange,
  getCompletedEventCountPerDay,
  getScheduledMinutesPerDay,
} from '@/db/events';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Dialog } from '@/components/ui/Dialog';
import {
  HeadlineMd, BodyMd, LabelMd, LabelSm,
} from '@/components/ui/Typography';
import { spacing, radius } from '@/theme/tokens';
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

// ── GitHub-style heatmap ──────────────────────────────────────────────────────
// Levels 0–4: empty → light → medium → strong → full primary
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
  const start = subtractDays(today, 69); // 10 weeks
  const dates = allDatesBetween(start, today);

  // Build week columns (7 rows Mon–Sun)
  const weeks: string[][] = [];
  let week: string[] = [];
  // Pad so first week starts on Monday
  const firstDow = (new Date(start).getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) week.push('');
  for (const d of dates) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(''); weeks.push(week); }

  // Month labels — show month name at its first week column
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

  const DAY_LABELS = ['M', '', 'W', '', 'F', '', ''];

  // GitHub-style solid fill colors — no borders, only filled cells
  const CELL_SIZE = 11;
  const CELL_GAP = 3;

  const HEAT_COLORS = [
    colors.surfaceContainerHighest,          // 0 – empty
    `${colors.primary}28`,                   // 1 – very light
    `${colors.primary}55`,                   // 2 – light
    `${colors.primary}90`,                   // 3 – medium
    colors.primary,                          // 4 – full
  ];

  return (
    <View style={{ width: '100%' }}>
      {/* Month row */}
      <View style={[heatStyles.monthRow, { marginLeft: 18 }]}>
        {monthLabels.map((m, i) => (
          <LabelSm
            key={i}
            style={{
              position: 'absolute',
              fontSize: 9,
              left: m.col * (CELL_SIZE + CELL_GAP),
              color: colors.onSurfaceVariant,
            }}
          >
            {m.label}
          </LabelSm>
        ))}
      </View>

      <View style={{ flexDirection: 'row' }}>
        {/* Day labels */}
        <View style={heatStyles.dayLabels}>
          {DAY_LABELS.map((l, i) => (
            <LabelSm
              key={i}
              style={{ fontSize: 8, height: CELL_SIZE, lineHeight: CELL_SIZE, color: colors.onSurfaceVariant }}
            >
              {l}
            </LabelSm>
          ))}
        </View>

        {/* Scrollable grid — fills card width */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={heatStyles.grid}>
            {weeks.map((wk, wi) => (
              <View key={wi} style={heatStyles.col}>
                {wk.map((d, di) => {
                  const isToday = d === today;
                  const level = d ? heatLevel(countByDate[d] ?? 0) : -1;
                  return (
                    <View
                      key={di}
                      style={[
                        heatStyles.cell,
                        {
                          backgroundColor: d ? HEAT_COLORS[level as 0|1|2|3|4] : 'transparent',
                        },
                        // GitHub today ring: thin colored border ON TOP of filled cell
                        isToday && {
                          borderWidth: 1.5,
                          borderColor: colors.onSurface,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Legend */}
      <View style={heatStyles.legend}>
        <LabelSm style={{ fontSize: 9, color: colors.onSurfaceVariant }}>Less</LabelSm>
        {HEAT_COLORS.map((c, i) => (
          <View key={i} style={[heatStyles.cell, { backgroundColor: c }]} />
        ))}
        <LabelSm style={{ fontSize: 9, color: colors.onSurfaceVariant }}>More</LabelSm>
      </View>
    </View>
  );
}

const heatStyles = StyleSheet.create({
  monthRow: { flexDirection: 'row', height: 14, marginBottom: 4 },
  dayLabels: { width: 14, gap: 3, marginRight: 3 },
  grid: { flexDirection: 'row', gap: 3 },
  col: { gap: 3 },
  cell: { width: 11, height: 11, borderRadius: 2 },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: spacing.sm,
  },
});

// ── Streak — consecutive days with ANY scheduled event ────────────────────────
function computeStreak(eventDates: Set<string>): { current: number; longest: number } {
  const today = todayISO();

  let cur = 0;
  let d = today;
  if (!eventDates.has(d)) d = subtractDays(d, 1);
  while (eventDates.has(d)) { cur++; d = subtractDays(d, 1); }

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

// ── Burnout risk — improved thresholds & context ──────────────────────────────
type Risk = 'Low' | 'Moderate' | 'High';

interface BurnoutResult {
  risk: Risk;
  avgHours: number;
  daysWithData: number;
  recommendations: string[];
}

function computeBurnout(minutesPerDay: { date: string; minutes: number }[]): BurnoutResult {
  if (minutesPerDay.length === 0) {
    return {
      risk: 'Low', avgHours: 0, daysWithData: 0,
      recommendations: ['Start scheduling your day to build momentum.'],
    };
  }

  const total = minutesPerDay.reduce((s, d) => s + d.minutes, 0);
  const daysWithData = minutesPerDay.length;
  // Average over the full 7-day window, not just days with data
  const avgHours = total / 60 / 7;

  if (avgHours > 7) return {
    risk: 'High', avgHours, daysWithData,
    recommendations: [
      'Schedule 15-min breaks every 90 minutes of focused work.',
      'Keep at least one morning per week completely event-free.',
      'Defer non-urgent tasks to next week — protect your recovery.',
    ],
  };
  if (avgHours > 5) return {
    risk: 'Moderate', avgHours, daysWithData,
    recommendations: [
      'Add a midday recovery block (walk, lunch, or rest).',
      'Protect the last hour of each day from new commitments.',
    ],
  };
  return {
    risk: 'Low', avgHours, daysWithData,
    recommendations: ['Workload looks healthy. Maintain this rhythm.'],
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const router = useRouter();
  const today = todayISO();
  const tenWeeksAgo = subtractDays(today, 69);
  const weekAgo = subtractDays(today, 6);

  // A1 — Streak: any day with a scheduled event
  const eventDates = useMemo(() => {
    const rows = getEventsForDateRange(tenWeeksAgo, today);
    return new Set(rows.map(e => e.date));
  }, [today, tenWeeksAgo]);

  const streakResult = useMemo(() => computeStreak(eventDates), [eventDates]);
  const streak = streakResult.current;
  const longestStreak = streakResult.longest;

  // Heatmap: completed events per day
  const completedCounts = useMemo(() => {
    const rows = getCompletedEventCountPerDay(tenWeeksAgo, today);
    return Object.fromEntries(rows.map(r => [r.date, r.count]));
  }, [today, tenWeeksAgo]);

  // A2 — Burnout
  const burnout = useMemo(() => {
    const mins = getScheduledMinutesPerDay(weekAgo, today);
    return computeBurnout(mins);
  }, [weekAgo, today]);

  // Download dialog
  const [downloadDialog, setDownloadDialog] = useState(false);
  const llama = useLlama();
  const { isDownloaded, isDownloading, startDownload } = llama;

  // Navigate to full-screen chat
  const handleFABPress = useCallback(() => {
    if (!isDownloaded && !isDownloading) {
      setDownloadDialog(true);
    } else if (isDownloaded) {
      router.push('/chat' as any);
    }
    // If downloading, do nothing (show progress on FAB)
  }, [isDownloaded, isDownloading, router]);

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
        {/* ── Workload Heatmap + Streak card ──────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.cardHeader}>
            <View>
              <LabelMd color={colors.onSurface}>Workload Consistency</LabelMd>
              <LabelSm color={colors.onSurfaceVariant}>Completed events per day · 10 weeks</LabelSm>
            </View>
            {/* Streak badge */}
            <View style={[styles.streakBadge, {
              backgroundColor: streak > 0 ? `${colors.primary}15` : colors.surfaceContainerHigh,
              borderColor: streak > 0 ? `${colors.primary}40` : colors.outlineVariant,
            }]}>
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

        {/* ── Burnout Risk card ────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.burnoutHeader}>
            <MaterialCommunityIcons
              name={RISK_ICON[burnout.risk] as any}
              size={18}
              color={RISK_COLOR[burnout.risk]}
            />
            <LabelMd color={colors.onSurface}>Burnout Risk</LabelMd>
            <View style={[styles.riskChip, {
              backgroundColor: `${RISK_COLOR[burnout.risk]}18`,
              borderColor: `${RISK_COLOR[burnout.risk]}40`,
            }]}>
              <LabelSm style={{ color: RISK_COLOR[burnout.risk] }}>{burnout.risk}</LabelSm>
            </View>
          </View>

          <LabelSm color={colors.onSurfaceVariant} style={styles.avgLine}>
            Avg {burnout.avgHours.toFixed(1)} h/day · {burnout.daysWithData} day{burnout.daysWithData !== 1 ? 's' : ''} of data this week
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

      {/* ── AI pill button ──────────────────────────────────────────────────── */}
      <View style={[styles.fabContainer, { bottom: 90 + insets.bottom }]}>
        <TouchableOpacity
          style={[
            styles.fabPill,
            { backgroundColor: isDownloading ? colors.primaryContainer : colors.primary },
          ]}
          onPress={handleFABPress}
          activeOpacity={0.85}
        >
          {/* Progress bar inside pill during download */}
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
            name={isDownloading ? 'download' : isDownloaded ? 'robot' : 'robot-outline'}
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
            },
          },
        ]}
        onDismiss={() => setDownloadDialog(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  // FAB pill
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
});
