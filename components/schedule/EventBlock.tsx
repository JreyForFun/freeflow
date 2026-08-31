import React, { useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Event } from '@/db/events';
import { LabelSm, LabelMd } from '@/components/ui/Typography';
import { colors, spacing, radius, timeline, typography } from '@/theme/tokens';

interface EventBlockProps {
  event: Event;
  taskCount?: number;
  completedTaskCount?: number;
  onPress: (event: Event) => void;
  columnOffset?: number; // for overlapping events: 0, 0.5, etc.
  columnWidth?: number;  // fraction of available width: 1, 0.5, etc.
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function EventBlock({
  event,
  taskCount = 0,
  completedTaskCount = 0,
  onPress,
  columnOffset = 0,
  columnWidth = 1,
}: EventBlockProps) {
  const startMinutes = timeToMinutes(event.start_time);
  const endMinutes = event.end_time ? timeToMinutes(event.end_time) : startMinutes + 60;
  const durationMinutes = Math.max(endMinutes - startMinutes, 30); // min height = 30min

  const top = (startMinutes / 60) * timeline.hourHeight;
  const height = (durationMinutes / 60) * timeline.hourHeight;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isPast = event.completed === 1 || endMinutes < nowMinutes;
  const isActive = !isPast && startMinutes <= nowMinutes && endMinutes > nowMinutes;

  const handlePress = useCallback(() => onPress(event), [event, onPress]);

  const containerStyle = useMemo(() => [
    styles.block,
    {
      top,
      height,
      left: `${columnOffset * 100}%` as any,
      width: `${columnWidth * 100}%` as any,
    },
    isPast && styles.blockPast,
    isActive && styles.blockActive,
  ], [top, height, columnOffset, columnWidth, isPast, isActive]);

  return (
    <TouchableOpacity style={containerStyle} onPress={handlePress} activeOpacity={0.85}>
      {/* Active left border */}
      {isActive && <View style={styles.activeBorder} />}

      <View style={styles.content}>
        <LabelSm
          color={isPast ? colors.onSurfaceVariant : isActive ? colors.primary : colors.onSurfaceVariant}
          style={styles.timeText}
        >
          {event.start_time}
          {event.end_time ? ` – ${event.end_time}` : ''}
        </LabelSm>

        <LabelMd
          numberOfLines={2}
          color={isPast ? colors.onSurfaceVariant : colors.onSurface}
          style={isPast ? { fontFamily: typography.labelMd.fontFamily, fontSize: typography.labelMd.fontSize, textDecorationLine: 'line-through' } : undefined}
        >
          {event.title}
        </LabelMd>

        {/* Task badge */}
        {taskCount > 0 && !isPast && (
          <View style={styles.taskBadge}>
            <MaterialCommunityIcons
              name={completedTaskCount === taskCount ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
              size={12}
              color={colors.onSecondaryContainer}
            />
            <LabelSm color={colors.onSecondaryContainer} style={styles.taskBadgeText}>
              {completedTaskCount}/{taskCount} Tasks
            </LabelSm>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  blockPast: {
    opacity: 0.55,
    backgroundColor: colors.surface,
  },
  blockActive: {
    backgroundColor: colors.surfaceContainer,
    borderColor: `${colors.primary}4D`, // 30% opacity
  },
  activeBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.primary,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  content: {
    flex: 1,
    paddingLeft: 6,
    gap: 2,
  },
  timeText: {
    fontSize: 10,
    lineHeight: 14,
  },
  title: {
    fontFamily: typography.labelMd.fontFamily,
    fontSize: typography.labelMd.fontSize,
    lineHeight: typography.labelMd.lineHeight,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  taskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${colors.secondaryContainer}80`, // 50% opacity
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: 2,
  },
  taskBadgeText: {
    fontSize: 10,
  },
});
