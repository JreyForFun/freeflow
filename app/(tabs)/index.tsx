import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, ScrollView, StyleSheet,
  TouchableOpacity, AppState, AppStateStatus, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { getEventsByDate, type Event } from '@/db/events';
import { getTasksByEvent, getTaskCountForEvent, type Task } from '@/db/tasks';
import { DraggableEventBlock } from '@/components/schedule/DraggableEventBlock';
import { CurrentTimeLine } from '@/components/schedule/CurrentTimeLine';
import { EventModal } from '@/components/schedule/EventModal';
import { EventFormSheet } from '@/components/schedule/EventFormSheet';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { LabelSm } from '@/components/ui/Typography';
import { useThemeColors } from '@/theme/ThemeContext';
import { formatHourLabel } from '@/hooks/useTimeFormat';
import { useTimeFormatCtx } from '@/hooks/useTimeFormatContext';
import { spacing, radius, timeline } from '@/theme/tokens';

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function getScrollTarget(): number {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = Math.max(0, minutes - 60);
  return (targetMinutes / 60) * timeline.hourHeight;
}

// Hour indices 0–23
const HOUR_INDICES = Array.from({ length: 24 }, (_, i) => i);

// 30-min tick positions (between each pair of hours): 0:30, 1:30 … 22:30
const HALF_HOUR_TOPS = Array.from({ length: 23 }, (_, i) => (i + 0.5) * timeline.hourHeight);

// ── Overlap column layout ─────────────────────────────────────────────────────
// Uses Union-Find to cluster overlapping events, then greedily assigns columns.
// Guarantees all events in the same visual cluster share the same totalColumns
// so column widths are consistent and events never occlude each other.
interface EventLayout {
  event: Event;
  column: number;
  totalColumns: number;
}

function computeEventLayout(events: Event[]): EventLayout[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) =>
    timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  );

  const layouts: EventLayout[] = sorted.map(e => ({ event: e, column: 0, totalColumns: 1 }));

  // ── Union-Find ──
  const parent = sorted.map((_, i) => i);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  // Union all directly-overlapping pairs
  for (let i = 0; i < sorted.length; i++) {
    const aS = timeToMinutes(sorted[i].start_time);
    const aE = sorted[i].end_time ? timeToMinutes(sorted[i].end_time!) : aS + 60;
    for (let j = i + 1; j < sorted.length; j++) {
      const bS = timeToMinutes(sorted[j].start_time);
      const bE = sorted[j].end_time ? timeToMinutes(sorted[j].end_time!) : bS + 60;
      if (aS < bE && aE > bS) {
        parent[find(i)] = find(j);
      }
    }
  }

  // Group indices by cluster root
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < sorted.length; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  // Greedy column assignment within each cluster
  for (const indices of clusters.values()) {
    const colEnds: number[] = []; // earliest end-time that fits in each column

    for (const idx of indices) {
      const s = timeToMinutes(sorted[idx].start_time);
      const e = sorted[idx].end_time ? timeToMinutes(sorted[idx].end_time!) : s + 60;

      // Find first column whose last event has already ended
      let col = 0;
      while (col < colEnds.length && colEnds[col] > s) col++;

      layouts[idx].column = col;
      if (col >= colEnds.length) colEnds.push(e);
      else colEnds[col] = e;
    }

    // All events in cluster share the same totalColumns = actual columns used
    const maxCol = Math.max(...indices.map(i => layouts[i].column));
    for (const idx of indices) layouts[idx].totalColumns = maxCol + 1;
  }

  return layouts;
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const appState = useRef(AppState.currentState);
  const { timeFmt } = useTimeFormatCtx();

  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | undefined>(undefined);

  const today = todayISO();
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // ── Load events ──────────────────────────────────────────────────────────────
  const loadEvents = useCallback(() => {
    setEvents(getEventsByDate(today));
  }, [today]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Reload every time this tab is focused (cross-tab refresh)
  useFocusEffect(useCallback(() => { loadEvents(); }, [loadEvents]));

  // ── Pull-to-refresh ──────────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadEvents();
    setTimeout(() => setRefreshing(false), 600);
  }, [loadEvents]);

  // ── Auto-scroll to current time ──────────────────────────────────────────────
  const scrollToNow = useCallback(() => {
    scrollRef.current?.scrollTo({ y: getScrollTarget(), animated: true });
  }, []);

  useEffect(() => {
    const timer = setTimeout(scrollToNow, 300);
    return () => clearTimeout(timer);
  }, [scrollToNow]);

  // Re-scroll + reload when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        scrollToNow();
        loadEvents();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [scrollToNow, loadEvents]);

  // ── Event modal handlers ──────────────────────────────────────────────────────
  const openEvent = useCallback((event: Event) => {
    setSelectedEvent(event);
    setSelectedTasks(getTasksByEvent(event.id));
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSelectedEvent(null);
    loadEvents();
  }, [loadEvents]);

  const refreshModalTasks = useCallback(() => {
    if (selectedEvent) {
      setSelectedTasks(getTasksByEvent(selectedEvent.id));
      loadEvents();
    }
  }, [selectedEvent, loadEvents]);

  const handleEditEvent = useCallback((event: Event) => {
    setEditingEvent(event);
    setFormVisible(true);
  }, []);

  const handleDeleteEvent = useCallback(() => { loadEvents(); }, [loadEvents]);

  const handleFormClose = useCallback(() => {
    setFormVisible(false);
    setEditingEvent(undefined);
  }, []);

  const eventLayouts = computeEventLayout(events);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader subtitle={dateLabel} />

      {/* 24-hour timeline */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.timelineContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Hour grid — proper height so label never needs overflow:visible */}
        {HOUR_INDICES.map((hour) => (
          <View
            key={hour}
            style={[styles.hourRow, { top: hour * timeline.hourHeight - 7 }]}
          >
            <LabelSm style={[styles.hourLabel, { color: colors.onSurfaceVariant }]}>
              {formatHourLabel(hour, timeFmt)}
            </LabelSm>
            <View style={[styles.hourLine, { backgroundColor: colors.outlineVariant }]} />
          </View>
        ))}

        {/* 30-minute minor ticks — only in the events area, no label */}
        {HALF_HOUR_TOPS.map((top, i) => (
          <View
            key={`hh${i}`}
            style={[
              styles.halfHourLine,
              {
                top,
                left: timeline.timeColumnWidth + spacing.xs,
                backgroundColor: colors.outlineVariant,
              },
            ]}
          />
        ))}

        {/* Events layer — side-by-side overlapping events */}
        <View style={styles.eventsLayer}>
          {eventLayouts.map(({ event, column, totalColumns }) => {
            const { total, completed } = getTaskCountForEvent(event.id);
            return (
              <DraggableEventBlock
                key={event.id}
                event={event}
                taskCount={total}
                completedTaskCount={completed}
                onPress={openEvent}
                onMoved={loadEvents}
                columnIndex={column}
                totalColumns={totalColumns}
              />
            );
          })}
        </View>

        {/* Current time indicator — OUTSIDE eventsLayer so it spans the full row
            including the time-column, aligning its label with hour labels */}
        <CurrentTimeLine />
      </ScrollView>

      {/* Quick-add pill */}
      <View style={styles.quickAddBar}>
        <TouchableOpacity
          style={[styles.quickAddInner, { backgroundColor: colors.surfaceContainer, borderColor: `${colors.primary}33` }]}
          onPress={() => setFormVisible(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.primary} />
          <LabelSm color={colors.onSurfaceVariant} style={styles.quickAddText}>
            Add event to schedule…
          </LabelSm>
        </TouchableOpacity>
      </View>

      {/* Event detail modal */}
      <EventModal
        event={selectedEvent}
        tasks={selectedTasks}
        visible={modalVisible}
        onClose={closeModal}
        onTasksChanged={refreshModalTasks}
        onEdit={handleEditEvent}
        onDelete={handleDeleteEvent}
      />

      {/* Create / Edit event form */}
      <EventFormSheet
        visible={formVisible}
        onClose={handleFormClose}
        onSaved={loadEvents}
        editingEvent={editingEvent}
        prefillDate={today}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  timelineContent: {
    height: timeline.totalHeight + 100,
    position: 'relative',
  },

  // Hour row: has actual height (14px) so label never overflows.
  // Top is shifted by -7 so the center of the row aligns with the hour mark.
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourLabel: {
    width: timeline.timeColumnWidth,
    textAlign: 'right',
    paddingRight: spacing.sm,
    fontSize: 9,
    lineHeight: 11,
    opacity: 0.65,
  },
  hourLine: {
    flex: 1,
    height: 1,
    marginRight: spacing.sm,
    opacity: 0.4,
  },

  // 30-minute minor tick — short dashed line, no label
  halfHourLine: {
    position: 'absolute',
    right: spacing.sm,
    height: 1,
    opacity: 0.18,
  },

  eventsLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: timeline.timeColumnWidth + spacing.sm,
    right: spacing.sm,
  },

  quickAddBar: {
    paddingHorizontal: spacing.marginMobile,
    paddingTop: spacing.md,
    paddingBottom: 112,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  quickAddInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  quickAddText: {
    flex: 1,
    fontSize: 14,
  },
});
