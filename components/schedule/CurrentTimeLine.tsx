import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { LabelSm } from '@/components/ui/Typography';
import { timeline, spacing } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeContext';

function getCurrentY(): number {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (minutes / 60) * timeline.hourHeight;
}

function formatNow(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

export function CurrentTimeLine() {
  const themeColors = useThemeColors();
  const animY = useRef(new Animated.Value(getCurrentY())).current;
  const [timeLabel, setTimeLabel] = useState(formatNow);

  useEffect(() => {
    const update = () => {
      animY.setValue(getCurrentY());
      setTimeLabel(formatNow());
    };
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [animY]);

  return (
    // pointerEvents must be a PROP (not style) so touches pass through to event blocks
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { top: animY }]}
    >
      {/* Label sits in the time column so it aligns with the hour labels */}
      <LabelSm style={[styles.label, { color: themeColors.primary }]}>
        {timeLabel}
      </LabelSm>
      <View style={[styles.dot, { backgroundColor: themeColors.primary }]} />
      <View style={[styles.line, { backgroundColor: themeColors.primary }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  // Width = timeColumnWidth + gap so dot starts exactly at events area
  label: {
    width: timeline.timeColumnWidth + spacing.sm,
    textAlign: 'right',
    paddingRight: spacing.xs,
    fontSize: 9,
    lineHeight: 11,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 2,
  },
  line: {
    flex: 1,
    height: 1.5,
    marginRight: spacing.sm,
    opacity: 0.85,
  },
});
