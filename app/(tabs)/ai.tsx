import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import {
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
  const d = new Date(from + 'T00:00:00'); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Activity Rings ────────────────────────────────────────────────────────────
interface RingDef {
  value: number;
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

  return (
    <G rotation="-90" origin={`${cx},${cy}`}>
      <Circle
        cx={cx} cy={cy} r={r}
        strokeWidth={strokeWidth}
        stroke={trackColor}
        fill="none"
        strokeLinecap="round"
      />
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
      <View style={ringStyles.svgWrap}>
        <Svg width={SIZE} height={SIZE}>
          {rings.map((ring, i) => (
            <ArcRing
              key={i}
              cx={CX} cy={CY}
              r={ring.radius}
              strokeWidth={ring.strokeWidth}
              progress={ring.value}
              color={ring.color}
              trackColor={ring.trackColor}
            />
          ))}
        </Svg>
        <View style={ringStyles.center} pointerEvents="none">
          <LabelMd style={ringStyles.centerLabel}>{centerLabel}</LabelMd>
          <LabelSm style={ringStyles.centerSub}>{centerSub}</LabelSm>
        </View>
      </View>

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
  svgWrap: { position: 'relative', width: 180, height: 180 },
  center: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: { fontSize: 22, fontWeight: '700', lineHeight: 26 },
  centerSub: { fontSize: 10, opacity: 0.6, letterSpacing: 0.5, textTransform: 'uppercase' },
  legend: { flex: 1, gap: spacing.md },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  legendSub: { fontSize: 11, opacity: 0.6 },
});

// ── Daily Momentum Chart ──────────────────────────────────────────────────────
// 14-day vertical bar chart showing scheduled hours per day.
// Completely different from the old heatmap:
//   - Vertical bars (not grid squares)
//   - Scheduled HOURS not event count
//   - Left = oldest day, right = today
//   - Reference lines at 4h for context
//   - Today's bar is highlighted with glow

const BAR_AREA_H = 80;  // px — total chart height
const GAP = 4;          // px — gap between bars
const MAX_MINUTES = 8 * 60; // 8h = full bar
const REF_4H_BOTTOM = (4 / 8) * BAR_AREA_H; // 40px from bottom = 4h mark

function DailyMomentumChart({
  minutesByDate,
}: {
  minutesByDate: Record<string, number>;
}) {
  const colors = useThemeColors();
  const today = todayISO();

  // Last 14 days: oldest on the left, today on the right
  const days = Array.from({ length: 14 }, (_, i) => subtractDays(today, 13 - i));

  return (
    <View>
      {/* ── Chart area ─────────────────────────────────────────────── */}
      <View style={{ height: BAR_AREA_H, position: 'relative' }}>

        {/* 4h reference line — sits exactly at the height a 4h bar would reach */}
        <View style={{
          position: 'absolute',
          bottom: REF_4H_BOTTOM,
          left: 0, right: 0,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
          <View style={{
            flex: 1,
            height: StyleSheet.hairlineWidth,
            backgroundColor: `${colors.outlineVariant}80`,
          }} />
          <LabelSm style={{
            fontSize: 8,
            paddingLeft: 3,
            opacity: 0.55,
            color: colors.onSurfaceVariant,
          }}>4h</LabelSm>
        </View>

        {/* Bars — absolutely fill the chart area, grow from the bottom */}
        <View style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: BAR_AREA_H,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: GAP,
        }}>
          {days.map((date) => {
            const mins = minutesByDate[date] ?? 0;
            // barH: proportional to 8h goal, minimum 2px (shows the day exists)
            const barH = Math.max((mins / MAX_MINUTES) * BAR_AREA_H, mins > 0 ? 5 : 2);
            const isToday = date === today;

            // Color ramp: empty → faint → mid → strong → full primary
            const barColor = isToday
              ? colors.primary
              : mins === 0  ? `${colors.outlineVariant}40`
              : mins < 90  ? `${colors.primary}28`  // < 1.5h
              : mins < 240 ? `${colors.primary}58`  // 1.5–4h
              : mins < 360 ? `${colors.primary}85`  // 4–6h
              : `${colors.primary}b0`;              // 6h+

            return (
              <View
                key={date}
                style={{
                  flex: 1,
                  height: barH,
                  backgroundColor: barColor,
                  borderRadius: 3,
                  ...(isToday && {
                    shadowColor: colors.primary,
                    shadowOpacity: 0.4,
                    shadowRadius: 5,
                    elevation: 4,
                  }),
                }}
              />
            );
          })}
        </View>
      </View>

      {/* ── Day labels — SEPARATE row below the chart, no overflow issues ── */}
      <View style={{
        flexDirection: 'row',
        gap: GAP,
        marginTop: 5,
      }}>
        {days.map((date) => {
          const isToday = date === today;
          const d = new Date(date + 'T00:00:00');
          const isWeekend = [0, 6].includes(d.getDay());
          const dayLetter = d.toLocaleDateString('en-US', { weekday: 'narrow' });

          return (
            <View key={date} style={{ flex: 1, alignItems: 'center' }}>
              <LabelSm style={{
                fontSize: 8,
                color: isToday
                  ? colors.primary
                  : isWeekend
                    ? colors.outline
                    : colors.onSurfaceVariant,
                fontWeight: isToday ? '700' : '400',
              }}>
                {dayLetter}
              </LabelSm>
              {isToday && (
                <View style={{
                  width: 3, height: 3,
                  borderRadius: 1.5,
                  backgroundColor: colors.primary,
                  marginTop: 1,
                }} />
              )}
            </View>
          );
        })}
      </View>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs }}>
        <LabelSm style={{ fontSize: 9, color: colors.onSurfaceVariant }}>2 weeks ago</LabelSm>
        <LabelSm style={{ fontSize: 9, color: colors.primary }}>Today</LabelSm>
      </View>
    </View>
  );
}

// ── Burnout — multi-signal algorithm ─────────────────────────────────────────
type Risk = 'Low' | 'Moderate' | 'High';

interface BurnoutResult {
  risk: Risk;
  avgActiveHours: number;
  heavyDays: number;
  maxBlockMinutes: number;
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
  const totalMins = minutesPerDay.reduce((s, d) => s + d.minutes, 0);
  const avgActiveHours = totalMins / 60 / daysWithData;
  const heavyDays = minutesPerDay.filter(d => d.minutes > 300).length;
  const maxBlockMinutes = maxBlockPerDay.reduce((m, d) => Math.max(m, d.block), 0);

  const isHigh =
    avgActiveHours > 6 ||
    heavyDays >= 4 ||
    maxBlockMinutes >= 210;

  const isModerate =
    avgActiveHours > 3.5 ||
    heavyDays >= 2 ||
    maxBlockMinutes >= 105;

  if (isHigh) {
    const recs: string[] = [];
    if (maxBlockMinutes >= 210)
      recs.push(`Longest unbroken block: ${(maxBlockMinutes / 60).toFixed(1)}h — take a break every 90 minutes.`);
    if (heavyDays >= 4)
      recs.push(`${heavyDays}/7 days had 5+ hours scheduled. Protect at least 2 lighter days.`);
    if (avgActiveHours > 6)
      recs.push('Keep one morning per week completely free for mental recovery.');
    recs.push('Defer non-urgent tasks to next week — protect your energy.');
    return { risk: 'High', avgActiveHours, heavyDays, maxBlockMinutes, daysWithData, recommendations: recs };
  }

  if (isModerate) {
    const recs: string[] = [];
    if (maxBlockMinutes >= 105)
      recs.push(`Longest block: ${(maxBlockMinutes / 60).toFixed(1)}h. Add a midday recovery gap.`);
    if (heavyDays >= 2)
      recs.push(`${heavyDays} heavy days — consider spacing them out.`);
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
  const weekAgo = subtractDays(today, 6);
  const fourteenDaysAgo = subtractDays(today, 13);

  // refreshKey increments on every tab focus so all memos recompute with fresh DB data
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []));

  // ── Today's Activity ────────────────────────────────────────────────────────
  const todayStats = useMemo(() => getTodayEventStats(today), [today, refreshKey]);

  // ── Daily Momentum (14-day scheduled hours bar chart) ──────────────────────
  const momentumMinutes = useMemo(() => {
    const rows = getScheduledMinutesPerDay(fourteenDaysAgo, today);
    return Object.fromEntries(rows.map(r => [r.date, r.minutes]));
  }, [today, fourteenDaysAgo, refreshKey]);

  // ── Burnout: last 7 days ────────────────────────────────────────────────────
  const burnout = useMemo(() => {
    const mins = getScheduledMinutesPerDay(weekAgo, today);
    const blockPerDay = mins.map(d => ({
      date: d.date,
      block: getLongestContinuousBlockMinutes(d.date),
    }));
    return computeBurnout(mins, blockPerDay);
  }, [weekAgo, today, refreshKey]);

  // ── FAB ───────────────────────────────────────────────────────────────────
  const [downloadDialog, setDownloadDialog] = useState(false);
  const llama = useLlama();
  const { isDownloaded, isDownloading, startDownload } = llama;

  const handleFABPress = useCallback(() => {
    if (!isDownloaded && !isDownloading) setDownloadDialog(true);
    else if (isDownloaded) router.push('/chat' as any);
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

  // ── Ring definitions ────────────────────────────────────────────────────────
  const HOUR_GOAL = 8 * 60;
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
      radius: 76, strokeWidth: 12,
      label: 'Scheduled',
      detail: scheduledHoursLabel,
    },
    {
      value: completionProgress,
      color: colors.secondary,
      trackColor: `${colors.secondary}20`,
      radius: 58, strokeWidth: 11,
      label: 'Completed',
      detail: `${todayStats.completed}/${todayStats.total}`,
    },
    {
      value: focusProgress,
      color: colors.tertiary,
      trackColor: `${colors.tertiary}22`,
      radius: 41, strokeWidth: 10,
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
        {/* ── Today's Activity ─────────────────────────────────────────────── */}
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

        {/* ── Daily Momentum card ───────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
          <View style={styles.cardHeader}>
            <View>
              <LabelMd color={colors.onSurface}>Daily Momentum</LabelMd>
              <LabelSm color={colors.onSurfaceVariant}>Scheduled hours · last 14 days</LabelSm>
            </View>
          </View>
          <DailyMomentumChart minutesByDate={momentumMinutes} />
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

          <View style={[styles.burnoutStats, { borderColor: colors.outlineVariant }]}>
            <View style={styles.burnoutStat}>
              <LabelMd style={[styles.statNum, { color: burnout.avgActiveHours > 6 ? colors.error : colors.onSurface }]}>
                {burnout.avgActiveHours.toFixed(1)}h
              </LabelMd>
              <LabelSm color={colors.onSurfaceVariant} style={styles.statLabel}>avg / active day</LabelSm>
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
            {burnout.daysWithData === 0
              ? 'No scheduled events this week'
              : `Based on ${burnout.daysWithData} day${burnout.daysWithData !== 1 ? 's' : ''} of data this week`}
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
  statNum: { fontSize: 20, fontWeight: '700', lineHeight: 24 },
  statLabel: { fontSize: 10, textAlign: 'center', opacity: 0.7 },
  statDivider: { width: 1, marginVertical: spacing.sm },
  avgLine: { marginBottom: spacing.md, fontSize: 11, opacity: 0.7 },
  recoBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  recoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },

  // FAB
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
