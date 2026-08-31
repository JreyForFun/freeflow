/**
 * ScreenHeader — shared header used by all 4 tab screens.
 *
 * Layout:
 *   [ icon ]  freeflow          subtitle/slot →
 *
 * Props:
 *   subtitle  — optional right-side text (date, screen label, etc.)
 *   right     — optional custom right node (overrides subtitle)
 */

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeadlineLgMobile, LabelSm } from '@/components/ui/Typography';
import { useThemeColors } from '@/theme/ThemeContext';
import { spacing } from '@/theme/tokens';

interface ScreenHeaderProps {
  subtitle?: string;
  right?: React.ReactNode;
}

export function ScreenHeader({ subtitle, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + spacing.sm,
          borderBottomColor: colors.outlineVariant,
          backgroundColor: colors.background,
        },
      ]}
    >
      {/* Left: icon + wordmark */}
      <View style={styles.left}>
        <Image
          source={require('@/assets/icon.png')}
          style={styles.icon}
          resizeMode="contain"
        />
        <HeadlineLgMobile color={colors.primary}>freeflow</HeadlineLgMobile>
      </View>

      {/* Right: subtitle text or custom node */}
      {right ?? (
        subtitle ? (
          <LabelSm color={colors.onSurfaceVariant}>{subtitle}</LabelSm>
        ) : null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
});
