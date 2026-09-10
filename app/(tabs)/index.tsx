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

// ── Overlap column layout ─────────────────────────────────────────────────────
// Each event gets a column index + totalColumns so they sit side-by-side
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

  // Group into collision clusters
  const layouts: EventLayout[] = sorted.map((e) => ({ event: e, column: 0, totalColumns: 1 }));

  // For each event, find all events that overlap with it
  for (let i = 0; i < sorted.length; i++) {
    const aStart = timeToMinutes(sorted[i].start_time);
    const aEnd = sorted[i].end_time ? timeToMinutes(sorted[i].end_time!) : aStart + 60;

    const overlapping = [i]; // indices that overlap with event i
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const bStart = timeToMinutes(sorted[j].start_time);
      const bEnd = sorted[j].end_time ? timeToMinutes(sorted[j].end_time!) : bStart + 60;
      if (aStart < bEnd && aEnd > bStart) {
        overlapping.push(j);
      }
    }

    // Assign columns within the overlap group
    const usedColumns = new Set<number>();
    for (const idx of overlapping) {
      if (idx !== i) usedColumns.add(layouts[idx].column);
    }
    let col = 0;
    while (usedColumns.has(col)) col++;
    layouts[i].column = col;
    layouts[i].totalColumns = overlapping.length;
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

  // Load on mount
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // ✅ FIX #4 — Reload every time this tab is focused (cross-tab refresh)
  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  // ── Pull-to-refresh ──────────────────────────────────────────────────────────
  // ✅ FIX #5
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

  // ── Event modal ──────────────────────────────────────────────────────────────
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

  const handleDeleteEvent = useCallback(() => {
    loadEvents();
  }, [loadEvents]);

  const handleFormClose = useCallback(() => {
    setFormVisible(false);
    setEditingEvent(undefined);
  }, []);

  // ✅ FIX #2 — Overlap column layout
  const eventLayouts = computeEventLayout(events);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader subtitle={dateLabel} />

      {/* 24hr Timeline */}
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
        {/* ✅ FIX #1 — Hour grid: anchor rows to height:0, label sits above line */}
        {HOUR_INDICES.map((hour) => (
          <View key={hour} style={[styles.hourRow, { top: hour * timeline.hourHeight }]}>
            <LabelSm style={[styles.hourLabel, { color: colors.onSurfaceVariant }]}>
              {formatHourLabel(hour, timeFmt)}
            </LabelSm>
            <View style={[styles.hourLine, { backgroundColor: colors.outlineVariant }]} />
          </View>
        ))}

        {/* Events layer */}
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

          {/* Current time line (inside events layer) */}
          <CurrentTimeLine />
        </View>
      </ScrollView>

      {/* Quick-add pill — taps to open full form */}
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

  // ✅ FIX #1 — row is a zero-height anchor; label floats above the line
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,                // ← anchor only, no height
    flexDirection: 'row',
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  hourLabel: {
    width: timeline.timeColumnWidth,
    textAlign: 'right',
    paddingRight: spacing.sm,
    fontSize: 10,
    lineHeight: 12,
    marginTop: -6,            // ← sit label above the grid line
    opacity: 0.7,
  },
  hourLine: {
    flex: 1,
    height: 1,
    opacity: 0.35,
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
