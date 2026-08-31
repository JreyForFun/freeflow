import React from 'react';
import { Text, TextStyle, StyleSheet, StyleProp } from 'react-native';
import { typography, colors } from '@/theme/tokens';

interface TypographyProps {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function Display({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.display, color ? { color } : {}, style]} {...props}>{children}</Text>;
}
export function HeadlineLg({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.headlineLg, color ? { color } : {}, style]} {...props}>{children}</Text>;
}
export function HeadlineLgMobile({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.headlineLgMobile, color ? { color } : {}, style]} {...props}>{children}</Text>;
}
export function HeadlineMd({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.headlineMd, color ? { color } : {}, style]} {...props}>{children}</Text>;
}
export function BodyLg({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.bodyLg, color ? { color } : {}, style]} {...props}>{children}</Text>;
}
export function BodyMd({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.bodyMd, color ? { color } : {}, style]} {...props}>{children}</Text>;
}
export function LabelMd({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.labelMd, color ? { color } : {}, style]} {...props}>{children}</Text>;
}
export function LabelSm({ children, color, style, ...props }: TypographyProps) {
  return <Text style={[styles.labelSm, color ? { color } : {}, style]} {...props}>{children}</Text>;
}

const styles = StyleSheet.create({
  display:         { ...typography.display,         color: colors.onBackground },
  headlineLg:      { ...typography.headlineLg,      color: colors.onBackground },
  headlineLgMobile:{ ...typography.headlineLgMobile,color: colors.onBackground },
  headlineMd:      { ...typography.headlineMd,      color: colors.onSurface    },
  bodyLg:          { ...typography.bodyLg,          color: colors.onSurface    },
  bodyMd:          { ...typography.bodyMd,          color: colors.onSurface    },
  labelMd:         { ...typography.labelMd,         color: colors.onSurface    },
  labelSm:         { ...typography.labelSm,         color: colors.onSurfaceVariant },
});
