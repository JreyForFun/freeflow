import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, ScrollView, StyleSheet,
  TouchableOpacity, AppState, AppStateStatus,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
import { spacing, radius, timeline, colors } from '@/theme/tokens';

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getScrollTarget(): number {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  // Scroll 1 hour before current time so you see context
  const targetMinutes = Math.max(0, minutes - 60);
  return (targetMinutes / 60) * timeline.hourHeight;
}

// Hour indices 0–23 — labels rendered dynamically based on time format pref
const HOUR_INDICES = Array.from({ length: 24 }, (_, i) => i);

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const appState = useRef(AppState.currentState);
  const { timeFmt } = useTimeFormatCtx();

  const [events, setEvents] = useState<Event[]>([]);
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

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // ── Auto-scroll to current time ──────────────────────────────────────────────
  const scrollToNow = useCallback(() => {
    scrollRef.current?.scrollTo({ y: getScrollTarget(), animated: true });
  }, []);

  useEffect(() => {
    // Small delay lets the layout settle before scrolling
    const timer = setTimeout(scrollToNow, 300);
    return () => clearTimeout(timer);
  }, [scrollToNow]);

  // Re-scroll when app comes to foreground
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
      >
        {/* Hour grid */}
        {HOUR_INDICES.map((hour) => (
          <View key={hour} style={[styles.hourRow, { top: hour * timeline.hourHeight }]}>
            <LabelSm style={styles.hourLabel}>{formatHourLabel(hour, timeFmt)}</LabelSm>
            <View style={styles.hourLine} />
          </View>
        ))}

        {/* Events layer */}
        <View style={styles.eventsLayer}>
          {events.map((event) => {
            const { total, completed } = getTaskCountForEvent(event.id);
            return (
              <DraggableEventBlock
                key={event.id}
                event={event}
                taskCount={total}
                completedTaskCount={completed}
                onPress={openEvent}
                onMoved={loadEvents}
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
          style={styles.quickAddInner}
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
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  timelineContent: {
    height: timeline.totalHeight + 100,
    position: 'relative',
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: timeline.hourHeight,
  },
  hourLabel: {
    width: timeline.timeColumnWidth,
    textAlign: 'right',
    paddingRight: spacing.sm,
    fontSize: 10,
    color: colors.onSurfaceVariant,
    opacity: 0.7,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.outlineVariant,
    opacity: 0.4,
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
    borderTopColor: `rgba(0,0,0,0.08)`,
  },
  quickAddInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: `${colors.primary}33`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  quickAddText: {
    flex: 1,
    fontSize: 14,
  },
});
