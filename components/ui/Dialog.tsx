/**
 * Dialog — custom themed confirmation dialog.
 *
 * Replaces Alert.alert() and native Android dialog with a fully
 * custom, spring-animated card centered on screen.
 *
 * Usage:
 *   <Dialog
 *     visible={show}
 *     title="Delete Event?"
 *     message="This cannot be undone."
 *     actions={[
 *       { label: 'Cancel', onPress: () => setShow(false) },
 *       { label: 'Delete', onPress: handleDelete, destructive: true },
 *     ]}
 *   />
 */

import React, { useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '@/theme/ThemeContext';
import { HeadlineMd, BodyMd, LabelMd } from '@/components/ui/Typography';
import { radius, spacing } from '@/theme/tokens';
import { useModalVisibility } from '@/hooks/useModalVisibility';

export interface DialogAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  primary?: boolean;
}

interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  actions: DialogAction[];
  onDismiss?: () => void;
}

const SPRING = { damping: 22, stiffness: 320 };

export function Dialog({ visible, title, message, actions, onDismiss }: DialogProps) {
  const colors = useThemeColors();
  const { showModal, hideModal } = useModalVisibility();
  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      showModal();
      requestAnimationFrame(() => {
        scale.value = withSpring(1, SPRING);
        opacity.value = withTiming(1, { duration: 160 });
      });
    } else if (mounted) {
      scale.value = withSpring(0.88, SPRING);
      opacity.value = withTiming(0, { duration: 140 });
      hideModal();
      const t = setTimeout(() => setMounted(false), 160);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!mounted && !visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={mounted ? 'auto' : 'none'}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      </TouchableWithoutFeedback>

      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.outlineVariant,
            },
            cardStyle,
          ]}
        >
          <HeadlineMd style={styles.title}>{title}</HeadlineMd>
          {message ? (
            <BodyMd color={colors.onSurfaceVariant} style={styles.message}>
              {message}
            </BodyMd>
          ) : null}

          <View style={[styles.actions, { borderTopColor: colors.outlineVariant }]}>
            {actions.map((action, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.actionBtn,
                  action.primary && { backgroundColor: colors.primary },
                  action.destructive && { backgroundColor: colors.errorContainer },
                ]}
                onPress={action.onPress}
                activeOpacity={0.75}
              >
                <LabelMd
                  color={
                    action.primary
                      ? colors.onPrimary
                      : action.destructive
                        ? colors.onErrorContainer
                        : colors.onSurfaceVariant
                  }
                >
                  {action.label}
                </LabelMd>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20,18,18,0.5)',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    pointerEvents: 'box-none',
  } as any,
  card: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  title: {
    marginBottom: spacing.sm,
  },
  message: {
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
  },
  actionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.default,
  },
});
