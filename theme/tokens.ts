// ─────────────────────────────────────────────────────────────────────────────
// FREEFLOW DESIGN TOKENS
// Source of truth: stitch_freeflow_ai_scheduler/DESIGN.md
// ALL colors, spacing, typography, and radius values live here.
// Never use raw hex/numbers in components — always import from this file.
// ─────────────────────────────────────────────────────────────────────────────


// ── Light palette (default) ──────────────────────────────────────────────────────────────
export const lightColors = {
  // Primary – Terracotta
  primary: '#99462a',
  onPrimary: '#ffffff',
  primaryContainer: '#d97757',
  onPrimaryContainer: '#541400',
  primaryFixed: '#ffdbd0',
  primaryFixedDim: '#ffb59e',
  onPrimaryFixed: '#390b00',
  onPrimaryFixedVariant: '#7a2f15',
  inversePrimary: '#ffb59e',
  surfaceTint: '#99462a',

  // Secondary – Sage
  secondary: '#4a654d',
  onSecondary: '#ffffff',
  secondaryContainer: '#cae8c9',
  onSecondaryContainer: '#4f6951',
  secondaryFixed: '#cceacc',
  secondaryFixedDim: '#b1ceb1',
  onSecondaryFixed: '#07200e',
  onSecondaryFixedVariant: '#334d36',

  // Tertiary – Warm Grey
  tertiary: '#5e5e5b',
  onTertiary: '#ffffff',
  tertiaryContainer: '#93928e',
  onTertiaryContainer: '#2b2b28',
  tertiaryFixed: '#e4e2dd',
  tertiaryFixedDim: '#c8c6c2',
  onTertiaryFixed: '#1b1c19',
  onTertiaryFixedVariant: '#474744',

  // Background & Surface – Cream/Sand
  background: '#fcf9f8',
  onBackground: '#1c1b1b',
  surface: '#fcf9f8',
  onSurface: '#1c1b1b',
  surfaceBright: '#fcf9f8',
  surfaceDim: '#dcd9d9',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f6f3f2',
  surfaceContainer: '#f0eded',
  surfaceContainerHigh: '#eae7e7',
  surfaceContainerHighest: '#e5e2e1',
  surfaceVariant: '#e5e2e1',
  onSurfaceVariant: '#55433d',
  inverseSurface: '#313030',
  inverseOnSurface: '#f3f0ef',

  // Outline
  outline: '#88726c',
  outlineVariant: '#dbc1b9',

  // Error
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
} as const;

// ── Dark palette ───────────────────────────────────────────────────────────────────
export const darkColors = {
  // Primary – Terracotta (lightened for dark bg)
  primary: '#ffb59e',
  onPrimary: '#541400',
  primaryContainer: '#7a2f15',
  onPrimaryContainer: '#ffdbd0',
  primaryFixed: '#ffdbd0',
  primaryFixedDim: '#ffb59e',
  onPrimaryFixed: '#390b00',
  onPrimaryFixedVariant: '#7a2f15',
  inversePrimary: '#99462a',
  surfaceTint: '#ffb59e',

  // Secondary – Sage
  secondary: '#b1ceb1',
  onSecondary: '#1e361f',
  secondaryContainer: '#334d36',
  onSecondaryContainer: '#cce8cc',
  secondaryFixed: '#cceacc',
  secondaryFixedDim: '#b1ceb1',
  onSecondaryFixed: '#07200e',
  onSecondaryFixedVariant: '#334d36',

  // Tertiary – Warm Grey
  tertiary: '#c8c6c2',
  onTertiary: '#303030',
  tertiaryContainer: '#474744',
  onTertiaryContainer: '#e4e2dd',
  tertiaryFixed: '#e4e2dd',
  tertiaryFixedDim: '#c8c6c2',
  onTertiaryFixed: '#1b1c19',
  onTertiaryFixedVariant: '#474744',

  // Background & Surface – Deep charcoal
  background: '#141212',
  onBackground: '#e6e1e0',
  surface: '#141212',
  onSurface: '#e6e1e0',
  surfaceBright: '#3a3736',
  surfaceDim: '#141212',
  surfaceContainerLowest: '#0e0c0c',
  surfaceContainerLow: '#1c1b1b',
  surfaceContainer: '#201e1e',
  surfaceContainerHigh: '#2a2828',
  surfaceContainerHighest: '#353233',
  surfaceVariant: '#353233',
  onSurfaceVariant: '#dfc4bc',
  inverseSurface: '#e6e1e0',
  inverseOnSurface: '#313030',

  // Outline
  outline: '#a68b83',
  outlineVariant: '#53433e',

  // Error
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
} as const;

/** Backward-compat default export — always the light palette.
 *  Components that need dynamic theming should use useThemeColors() instead. */
export const colors = lightColors;

// ── Spacing (4px base unit grid) ─────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 48,
  xxl: 80,
  gutter: 24,
  marginMobile: 16,
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────────
export const radius = {
  sm: 4,
  default: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// ── Typography ────────────────────────────────────────────────────────────────
// Font families — loaded via expo-font in app/_layout.tsx
export const fonts = {
  serifRegular: 'SourceSerif4-Regular',
  serifMedium: 'SourceSerif4-Medium',
  serifSemiBold: 'SourceSerif4-SemiBold',
  sansRegular: 'Inter-Regular',
  sansMedium: 'Inter-Medium',
  sansSemiBold: 'Inter-SemiBold',
} as const;

export const typography = {
  display: {
    fontFamily: fonts.serifSemiBold,
    fontSize: 48,
    lineHeight: 48 * 1.1,
    letterSpacing: -0.02 * 48,
  },
  headlineLg: {
    fontFamily: fonts.serifSemiBold,
    fontSize: 32,
    lineHeight: 32 * 1.2,
  },
  headlineLgMobile: {
    fontFamily: fonts.serifSemiBold,
    fontSize: 28,
    lineHeight: 28 * 1.2,
  },
  headlineMd: {
    fontFamily: fonts.serifMedium,
    fontSize: 24,
    lineHeight: 24 * 1.3,
  },
  bodyLg: {
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    lineHeight: 18 * 1.6,
  },
  bodyMd: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 16 * 1.6,
  },
  labelMd: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    lineHeight: 14 * 1.4,
    letterSpacing: 0.01 * 14,
  },
  labelSm: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    lineHeight: 12 * 1.2,
    letterSpacing: 0.05 * 12,
  },
} as const;

// ── Timeline Constants ────────────────────────────────────────────────────────
export const timeline = {
  hourHeight: 64,        // px per hour
  totalHeight: 64 * 24, // 1536px — full 24hr scroll
  snapMinutes: 15,       // drag snaps to 15-min intervals
  timeColumnWidth: 52,   // left column width for hour labels
} as const;
