/**
 * BottomSheet — custom themed bottom sheet built on Reanimated.
 *
 * Features:
 * - Spring slide-up on open, spring slide-down on close
 * - Drag handle bar at top
 * - Backdrop tap to dismiss
 * - Keyboard-aware (shifts up when keyboard shows)
 * - Theme-aware (reads from ThemeContext)
 *
 * Usage:
 *   <BottomSheet visible={show} onClose={() => setShow(false)}>
 *     <Text>Content here</Text>
 *   </BottomSheet>
 */

import React, { useCallback, useEffect } from 'react';
import {
  View, StyleSheet, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/theme/ThemeContext';
import { radius, spacing } from '@/theme/tokens';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPRING_CONFIG = { damping: 26, stiffness: 300 };

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max height as fraction of screen height. Default 0.92 */
  maxHeightRatio?: number;
}

export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.92,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  // Controls whether the sheet is actually rendered in the tree
  const [mounted, setMounted] = React.useState(false);

  const open = useCallback(() => {
    setMounted(true);
    // Defer animation one frame so layout completes first
    requestAnimationFrame(() => {
      backdropOpacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, SPRING_CONFIG);
    });
  }, [backdropOpacity, translateY]);

  const close = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 180 });
    translateY.value = withSpring(SCREEN_HEIGHT, SPRING_CONFIG, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
    onClose();
  }, [backdropOpacity, translateY, onClose]);

  useEffect(() => {
    if (visible) {
      open();
    } else if (mounted) {
      // Only animate close if it was mounted (avoid spurious animation on init)
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withSpring(SCREEN_HEIGHT, SPRING_CONFIG, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted && !visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={mounted ? 'auto' : 'none'}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.backdrop,
            backdropStyle,
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.outlineVariant,
              maxHeight: SCREEN_HEIGHT * maxHeightRatio,
              paddingBottom: insets.bottom + spacing.lg,
            },
            sheetStyle,
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handleWrap} pointerEvents="none">
            <View style={[styles.handle, { backgroundColor: colors.outlineVariant }]} />
          </View>

          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20,18,18,0.45)',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  } as any,
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});
