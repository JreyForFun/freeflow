import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  getCompletedEventCountPerDay,
  getScheduledMinutesPerDay,
  getTodayEventStats,
  getLongestContinuousBlockMinutes,
} from '@/db/events';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Dialog } from '@/components/ui/Dialog';
import {
  BodyMd, LabelMd, LabelSm,
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

// ── Activity Rings ────────────────────────────────────────────────────────────
// Three concentric SVG arc rings — Apple Watch style
// Ring 1 (outer): scheduled hours today vs 8h goal
// Ring 2 (middle): events completed vs total today
// Ring 3 (inner): focus blocks completed vs total today

interface RingDef {
  value: number;   // 0–1 progress
  color: string;
  trackColor: string;
  radius: number;
  strokeWidth: number;
  label: string;
  detail: string;
}

function ArcRing({
  cx, cy, r, strokeWidth, progress, color, trackColor,
}: {
  cx: number; cy: number; r: number; strokeWidth: number;
  progress: number; color: string; trackColor: string;
}) {
  const circumference = 2 * Math.PI * r;
  const safeProgress = Math.min(1, Math.max(0, progress));
  const dash = circumference * safeProgress;
  const gap = circumference - dash;

  // Rotate so arc starts at top (−90°)
  return (
    <G rotation="-90" origin={`${cx},${cy}`}>
      {/* Track */}
      <Circle
        cx={cx} cy={cy} r={r}
        strokeWidth={strokeWidth}
        stroke={trackColor}
        fill="none"
        strokeLinecap="round"
      />
      {/* Progress — only render when > 0 to avoid dot artifact from strokeLinecap=round */}
      {safeProgress > 0 && (
        <Circle
          cx={cx} cy={cy} r={r}
          strokeWidth={strokeWidth}
          stroke={color}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset={0}
        />
      )}
    </G>
  );
}

function ActivityRingsWidget({
  rings,
  centerLabel,
  centerSub,
}: {
  rings: RingDef[];
  centerLabel: string;
  centerSub: string;
}) {
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;

  return (
    <View style={ringStyles.container}>
      {/* SVG rings */}
      <View style={ringStyles.svgWrap}>
        <Svg width={SIZE} height={SIZE}>
          {rings.map((ring, i) => (
            <ArcRing
              key={i}
              cx={CX}
              cy={CY}
              r={ring.radius}
              strokeWidth={ring.strokeWidth}
              progress={ring.value}
              color={ring.color}
              trackColor={ring.trackColor}
            />
          ))}
        </Svg>
        {/* Center text overlay */}
        <View style={ringStyles.center} pointerEvents="none">
          <LabelMd style={ringStyles.centerLabel}>{centerLabel}</LabelMd>
          <LabelSm style={ringStyles.centerSub}>{centerSub}</LabelSm>
        </View>
      </View>

      {/* Legend */}
      <View style={ringStyles.legend}>
        {rings.map((ring, i) => (
          <View key={i} style={ringStyles.legendRow}>
            <View style={[ringStyles.legendDot, { backgroundColor: ring.color }]} />
            <View>
              <LabelMd style={ringStyles.legendLabel}>{ring.detail}</LabelMd>
              <LabelSm style={ringStyles.legendSub}>{ring.label}</LabelSm>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  svgWrap: {
    position: 'relative',
    width: 180,
    height: 180,
  },
  center: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  centerSub: {
    fontSize: 10,
    opacity: 0.6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  legend: {
    flex: 1,
    gap: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  legendSub: {
    fontSize: 11,
    opacity: 0.6,
  },
});

// ── GitHub-style heatmap ──────────────────────────────────────────────────────
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

  const weeks: string[][] = [];
  let week: string[] = [];
  const firstDow = (new Date(start).getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) week.push('');
  for (const d of dates) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(''); weeks.push(week); }

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
  const CELL_SIZE = 11;
  const CELL_GAP = 3;

  const HEAT_COLORS = [
    colors.surfaceContainerHighest,
    `${colors.primary}28`,
    `${colors.primary}55`,
    `${colors.primary}90`,
    colors.primary,
  ];

  return (
    <View style={{ width: '100%' }}>
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
                        { backgroundColor: d ? HEAT_COLORS[level as 0|1|2|3|4] : 'transparent' },
                        isToday && { borderWidth: 1.5, borderColor: colors.onSurface },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

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

// ── Burnout — multi-signal algorithm ─────────────────────────────────────────
type Risk = 'Low' | 'Moderate' | 'High';

interface BurnoutResult {
  risk: Risk;
  avgActiveHours: number;   // avg over days that HAVE events
  heavyDays: number;        // days with >5h scheduled
  maxBlockMinutes: number;  // longest unbroken scheduled block this week
  daysWithData: number;
  recommendations: string[];
}

function computeBurnout(
  minutesPerDay: { date: string; minutes: number }[],
  maxBlockPerDay: { date: string; block: number }[],
): BurnoutResult {
  const empty: BurnoutResult = {
    risk: 'Low', avgActiveHours: 0, heavyDays: 0,
    maxBlockMinutes: 0, daysWithData: 0,
    recommendations: ['Start scheduling your day to build momentum.'],
  };
  if (minutesPerDay.length === 0) return empty;

  const daysWithData = minutesPerDay.length;
  // Average over ACTIVE days only — more honest than dividing by 7
  const totalMins = minutesPerDay.reduce((s, d) => s + d.minutes, 0);
  const avgActiveHours = totalMins / 60 / daysWithData;

  // Days with >5 scheduled hours (heavy load indicator)
  const heavyDays = minutesPerDay.filter(d => d.minutes > 300).length;

  // Longest single unbroken block across the whole week
  const maxBlockMinutes = maxBlockPerDay.reduce((m, d) => Math.max(m, d.block), 0);

  // ── Decision tree: any one signal can escalate risk ──
  const isHigh =
    avgActiveHours > 6 ||     // avg active day > 6h
    heavyDays >= 4 ||          // 4+ heavy days this week
    maxBlockMinutes >= 210;    // 3.5h+ unbroken block

  const isModerate =
    avgActiveHours > 3.5 ||
    heavyDays >= 2 ||
    maxBlockMinutes >= 105;    // 1.75h+ unbroken block

  if (isHigh) {
    const recs: string[] = [];
    if (maxBlockMinutes >= 210)
      recs.push(`Your longest unbroken block was ${Math.round(maxBlockMinutes / 60 * 10) / 10}h — schedule a break every 90 minutes.`);
    if (heavyDays >= 4)
      recs.push(`${heavyDays} out of 7 days had 5+ hours scheduled. Protect at least 2 light days per week.`);
    if (avgActiveHours > 6)
      recs.push('Keep at least one morning per week completely event-free for recovery.');
    recs.push('Defer non-urgent tasks to next week — protect your energy.');
    return { risk: 'High', avgActiveHours, heavyDays, maxBlockMinutes, daysWithData, recommendations: recs };
  }

  if (isModerate) {
    const recs: string[] = [];
    if (maxBlockMinutes >= 105)
      recs.push(`Longest unbroken block: ${Math.round(maxBlockMinutes / 60 * 10) / 10}h. Add a midday recovery gap.`);
    if (heavyDays >= 2)
      recs.push(`${heavyDays} days with 5+ hours — consider spacing out heavy days.`);
    recs.push('Protect the last hour of each day from new commitments.');
    return { risk: 'Moderate', avgActiveHours, heavyDays, maxBlockMinutes, daysWithData, recommendations: recs };
  }

  return {
    risk: 'Low', avgActiveHours, heavyDays, maxBlockMinutes, daysWithData,
    recommendations: ['Workload looks healthy — maintain this rhythm.'],
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

  // ── Today's Activity Rings data ────────────────────────────────────────────
  const todayStats = useMemo(() => getTodayEventStats(today), [today]);

  // ── Heatmap: completed events per day ─────────────────────────────────────
  const completedCounts = useMemo(() => {
    const rows = getCompletedEventCountPerDay(tenWeeksAgo, today);
    return Object.fromEntries(rows.map(r => [r.date, r.count]));
  }, [today, tenWeeksAgo]);

  // ── Burnout: scheduled minutes + longest block per day this week ───────────
  const burnout = useMemo(() => {
    const mins = getScheduledMinutesPerDay(weekAgo, today);
    // Compute longest block for each day that has data
    const blockPerDay = mins.map(d => ({
      date: d.date,
      block: getLongestContinuousBlockMinutes(d.date),
    }));
    return computeBurnout(mins, blockPerDay);
  }, [weekAgo, today]);

  // ── FAB / download ────────────────────────────────────────────────────────
  const [downloadDialog, setDownloadDialog] = useState(false);
  const llama = useLlama();
  const { isDownloaded, isDownloading, startDownload } = llama;

  const handleFABPress = useCallback(() => {
    if (!isDownloaded && !isDownloading) {
      setDownloadDialog(true);
    } else if (isDownloaded) {
      router.push('/chat' as any);
    }
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

  // ── Ring definitions ───────────────────────────────────────────────────────
  // Goal: 8 scheduled hours for outer ring
  const HOUR_GOAL = 8 * 60; // minutes
  const scheduledProgress = todayStats.scheduledMinutes / HOUR_GOAL;
  const completionProgress = todayStats.total > 0 ? todayStats.completed / todayStats.total : 0;
  const focusProgress = todayStats.focusTotal > 0 ? todayStats.focusCompleted / todayStats.focusTotal : 0;

  const scheduledHoursLabel =
    todayStats.scheduledMinutes >= 60
      ? `${(todayStats.scheduledMinutes / 60).toFixed(1)}h`
      : `${todayStats.scheduledMinutes}m`;

  const rings: RingDef[] = [
    {
      value: scheduledProgress,
      color: colors.primary,
      trackColor: `${colors.primary}18`,
      radius: 76,
      strokeWidth: 12,
      label: 'Scheduled',
      detail: scheduledHoursLabel,
    },
    {
      value: completionProgress,
      color: colors.secondary,
      trackColor: `${colors.secondary}20`,
      radius: 58,
      strokeWidth: 11,
      label: 'Completed',
      detail: `${todayStats.completed}/${todayStats.total}`,
    },
    {
      value: focusProgress,
      color: colors.tertiary,
      trackColor: `${colors.tertiary}22`,
      radius: 41,
      strokeWidth: 10,
      label: 'Focus done',
      detail: `${todayStats.focusCompleted}/${todayStats.focusTotal}`,
    },
  ];

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader subtitle="AI & Insights" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Activity Rings card ───────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.cardHeader}>
            <View>
              <LabelMd color={colors.onSurface}>Today's Activity</LabelMd>
              <LabelSm color={colors.onSurfaceVariant}>{todayLabel}</LabelSm>
            </View>
            {todayStats.total === 0 && (
              <View style={[styles.emptyBadge, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}>
                <LabelSm color={colors.onSurfaceVariant} style={{ fontSize: 10 }}>No events yet</LabelSm>
              </View>
            )}
          </View>

          <ActivityRingsWidget
            rings={rings}
            centerLabel={scheduledHoursLabel}
            centerSub="today"
          />
        </View>

        {/* ── Workload Heatmap card ─────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.cardHeader}>
            <View>
              <LabelMd color={colors.onSurface}>Workload Consistency</LabelMd>
              <LabelSm color={colors.onSurfaceVariant}>Completed events per day · 10 weeks</LabelSm>
            </View>
          </View>

          <WorkloadHeatmap countByDate={completedCounts} />

          <View style={styles.heatFooter}>
            <LabelSm color={colors.onSurfaceVariant} style={{ fontSize: 9 }}>10 wks ago</LabelSm>
            <LabelSm color={colors.onSurfaceVariant} style={{ fontSize: 9 }}>Today</LabelSm>
          </View>
        </View>

        {/* ── Burnout Risk card ─────────────────────────────────────────────── */}
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

          {/* Stats row */}
          <View style={[styles.burnoutStats, { borderColor: colors.outlineVariant }]}>
            <View style={styles.burnoutStat}>
              <LabelMd style={[styles.statNum, { color: colors.onSurface }]}>
                {burnout.avgActiveHours.toFixed(1)}h
              </LabelMd>
              <LabelSm color={colors.onSurfaceVariant} style={styles.statLabel}>avg/active day</LabelSm>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.outlineVariant }]} />
            <View style={styles.burnoutStat}>
              <LabelMd style={[styles.statNum, { color: burnout.heavyDays >= 4 ? colors.error : colors.onSurface }]}>
                {burnout.heavyDays}
              </LabelMd>
              <LabelSm color={colors.onSurfaceVariant} style={styles.statLabel}>heavy days</LabelSm>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.outlineVariant }]} />
            <View style={styles.burnoutStat}>
              <LabelMd style={[styles.statNum, { color: burnout.maxBlockMinutes >= 210 ? colors.error : colors.onSurface }]}>
                {burnout.maxBlockMinutes >= 60
                  ? `${(burnout.maxBlockMinutes / 60).toFixed(1)}h`
                  : `${burnout.maxBlockMinutes}m`}
              </LabelMd>
              <LabelSm color={colors.onSurfaceVariant} style={styles.statLabel}>longest block</LabelSm>
            </View>
          </View>

          <LabelSm color={colors.onSurfaceVariant} style={styles.avgLine}>
            Based on {burnout.daysWithData} day{burnout.daysWithData !== 1 ? 's' : ''} of data this week
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

      {/* ── AI pill FAB ──────────────────────────────────────────────────────── */}
      <View style={[styles.fabContainer, { bottom: 90 + insets.bottom }]}>
        <TouchableOpacity
          style={[
            styles.fabPill,
            { backgroundColor: isDownloading ? colors.primaryContainer : colors.primary },
          ]}
          onPress={handleFABPress}
          activeOpacity={0.85}
        >
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

      <Dialog
        visible={downloadDialog}
        title="Download AI Model?"
        message="SmolLM2 360M (~200 MB) will be downloaded over Wi-Fi and stored on your device. This is a one-time download."
        actions={[
          { label: 'Cancel', onPress: () => setDownloadDialog(false) },
          {
            label: 'Download', primary: true,
            onPress: () => { setDownloadDialog(false); startDownload(); },
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
  emptyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  heatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },

  // Burnout
  burnoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  riskChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  burnoutStats: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  burnoutStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: 2,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  statLabel: {
    fontSize: 10,
    textAlign: 'center',
    opacity: 0.7,
  },
  statDivider: {
    width: 1,
    marginVertical: spacing.sm,
  },
  avgLine: { marginBottom: spacing.md, fontSize: 11, opacity: 0.7 },
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
