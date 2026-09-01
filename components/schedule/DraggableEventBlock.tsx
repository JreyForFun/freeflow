import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { Event } from '@/db/events';
import { updateEventTime } from '@/db/events';
import { LabelSm, LabelMd } from '@/components/ui/Typography';
import { colors, spacing, radius, timeline } from '@/theme/tokens';
import { formatTime } from '@/hooks/useTimeFormat';
import { useTimeFormatCtx } from '@/hooks/useTimeFormatContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function snapToGrid(minutes: number, snapMinutes = timeline.snapMinutes): number {
  return Math.round(minutes / snapMinutes) * snapMinutes;
}

const PIXEL_PER_MINUTE = timeline.hourHeight / 60;

// ── Category color mapping ────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  focus: colors.secondaryContainer,
  meeting: colors.tertiaryFixed,
  personal: colors.primaryFixed,
  imported: colors.surfaceContainerHigh,
};

// ── Component ─────────────────────────────────────────────────────────────────
interface DraggableEventBlockProps {
  event: Event;
  taskCount: number;
  completedTaskCount: number;
  onPress: (event: Event) => void;
  onMoved: () => void; // callback to refresh parent after a move
}

export function DraggableEventBlock({
  event,
  taskCount,
  completedTaskCount,
  onPress,
  onMoved,
}: DraggableEventBlockProps) {
  const { timeFmt } = useTimeFormatCtx();
  const startMinutes = timeToMinutes(event.start_time);
  const endMinutes = event.end_time ? timeToMinutes(event.end_time) : startMinutes + 60;
  const durationMinutes = endMinutes - startMinutes;

  const topPx = startMinutes * PIXEL_PER_MINUTE;
  const heightPx = Math.max(durationMinutes * PIXEL_PER_MINUTE, 32);

  // ── Reanimated shared values ──
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // ── Entrance animation ──
  const entranceOpacity = useSharedValue(0);
  const entranceSlide = useSharedValue(8);

  // Trigger entrance on mount (runs once on UI thread)
  entranceOpacity.value = withTiming(1, { duration: 220 });
  entranceSlide.value = withSpring(0, { damping: 22, stiffness: 280 });

  const isPast = new Date() > new Date(`${event.date}T${event.end_time ?? event.start_time}`);

  // ── Save new time after drag ──
  const commitMove = useCallback((deltaY: number) => {
    const deltaMins = deltaY / PIXEL_PER_MINUTE;
    const newStart = snapToGrid(startMinutes + deltaMins);
    const newEnd = newStart + durationMinutes;

    updateEventTime(
      event.id,
      minutesToTime(newStart),
      minutesToTime(newEnd),
    );
    onMoved();
  }, [event.id, startMinutes, durationMinutes, onMoved]);

  // ── Long-press + pan gesture ──
  const panGesture = Gesture.Pan()
    .activateAfterLongPress(400)    // 400ms hold to start dragging
    .onStart(() => {
      isDragging.value = true;
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      isDragging.value = false;
      const finalDelta = e.translationY;
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      runOnJS(commitMove)(finalDelta);
    })
    .onFinalize(() => {
      isDragging.value = false;
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
    });

  // ── Tap gesture (open detail modal) ──
  const tapGesture = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => {
      runOnJS(onPress)(event);
    });

  // Compose: tap OR long-press-pan (simultaneous so tap still fires when not dragging)
  const composed = Gesture.Exclusive(panGesture, tapGesture);

  // ── Animated styles ──
  const animStyle = useAnimatedStyle(() => {
    const baseOpacity = isPast ? 0.55 : 1;
    return {
      transform: [{ translateY: translateY.value + entranceSlide.value }],
      opacity: isDragging.value ? 0.85 : entranceOpacity.value * baseOpacity,
      shadowOpacity: isDragging.value ? 0.18 : 0,
      shadowRadius: isDragging.value ? 12 : 0,
      zIndex: isDragging.value ? 100 : 1,
      elevation: isDragging.value ? 8 : 0,
    };
  });

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isDragging.value ? 1.03 : 1 }],
  }));

  const bgColor = CATEGORY_COLORS[event.category] ?? colors.surfaceContainerHigh;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.block,
          {
            top: topPx,
            height: heightPx,
            backgroundColor: bgColor,
          },
          animStyle,
        ]}
      >
        {/* Left accent bar */}
        <View style={[styles.accent, { backgroundColor: isPast ? colors.outline : colors.primary }]} />

        <Animated.View style={[styles.content, scaleStyle]}>
          {/* Time label */}
          <LabelSm style={styles.timeText} color={colors.onSurfaceVariant}>
            {(() => {
              const start = formatTime(event.start_time, timeFmt);
              const end = event.end_time ? ` – ${formatTime(event.end_time, timeFmt)}` : '';
              return start + end;
            })()}
          </LabelSm>

          {/* Title */}
          <LabelMd
            numberOfLines={2}
            color={isPast ? colors.onSurfaceVariant : colors.onSurface}
            style={isPast ? { textDecorationLine: 'line-through' } : undefined}
          >
            {event.title}
          </LabelMd>

          {/* Task badge */}
          {taskCount > 0 && !isPast && (
            <View style={styles.taskBadge}>
              <MaterialCommunityIcons
                name={completedTaskCount === taskCount ? 'check-all' : 'checkbox-multiple-outline'}
                size={10}
                color={colors.secondary}
              />
              <LabelSm style={styles.taskBadgeText} color={colors.secondary}>
                {completedTaskCount}/{taskCount}
              </LabelSm>
            </View>
          )}
        </Animated.View>

        {/* Drag handle indicator — visible on long hold */}
        <View style={styles.dragHandle}>
          <MaterialCommunityIcons name="drag-horizontal-variant" size={12} color={`${colors.outline}88`} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    borderRadius: radius.default,
    borderWidth: 1,
    borderColor: `${colors.outlineVariant}88`,
    overflow: 'hidden',
    shadowColor: colors.onSurface,
    shadowOffset: { width: 0, height: 4 },
  },
  accent: {
    width: 4,
    borderTopLeftRadius: radius.default,
    borderBottomLeftRadius: radius.default,
  },
  content: {
    flex: 1,
    paddingLeft: spacing.xs,
    paddingVertical: 3,
    gap: 1,
  },
  timeText: {
    fontSize: 9,
    lineHeight: 12,
  },
  taskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    backgroundColor: `${colors.secondaryContainer}99`,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.full,
    marginTop: 2,
  },
  taskBadgeText: {
    fontSize: 9,
  },
  dragHandle: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    opacity: 0.5,
  },
});
