import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { LabelSm } from '@/components/ui/Typography';
import { colors, timeline } from '@/theme/tokens';

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
  const animY = useRef(new Animated.Value(getCurrentY())).current;
  const [timeLabel, setTimeLabel] = useState(formatNow);

  useEffect(() => {
    // Update position AND label every 60 seconds
    const update = () => {
      animY.setValue(getCurrentY());
      setTimeLabel(formatNow());
    };
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [animY]);

  return (
    <Animated.View style={[styles.container, { top: animY }]}>
      <LabelSm color={colors.primary} style={styles.label}>{timeLabel}</LabelSm>
      <View style={styles.dot} />
      <View style={styles.line} />
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
    pointerEvents: 'none',
  },
  label: {
    width: 42,
    textAlign: 'right',
    color: colors.primary,
    fontSize: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginHorizontal: 2,
  },
  line: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.primary,
    opacity: 0.8,
  },
});
