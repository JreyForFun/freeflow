/**
 * ThemeContext — provides the active color palette to all components.
 *
 * Priority order:
 *   1. User preference from Settings (System | Light | Dark)
 *   2. System color scheme (useColorScheme)
 *
 * Usage:
 *   const c = useThemeColors();   // always-current palette
 *   const { setThemePref } = useTheme();  // to change preference
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors } from './tokens';

// ── Types ─────────────────────────────────────────────────────────────────────
export type ThemePref = 'System' | 'Light' | 'Dark';
/** Structural color palette — both light and dark palettes satisfy this type. */
export type ColorPalette = Record<keyof typeof lightColors, string>;

interface ThemeContextValue {
  colors: ColorPalette;
  isDark: boolean;
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  themePref: 'System',
  setThemePref: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [themePref, setThemePrefState] = useState<ThemePref>('Light');

  const isDark = useMemo(() => {
    if (themePref === 'Dark') return true;
    if (themePref === 'Light') return false;
    return systemScheme === 'dark';
  }, [themePref, systemScheme]);

  const palette: ColorPalette = isDark ? darkColors : lightColors;

  const setThemePref = useCallback((pref: ThemePref) => {
    setThemePrefState(pref);
  }, []);

  const value = useMemo(
    () => ({ colors: palette, isDark, themePref, setThemePref }),
    [palette, isDark, themePref, setThemePref],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns the current active color palette. Use this everywhere instead of
 *  importing `colors` directly so that dark mode works automatically. */
export function useThemeColors(): ColorPalette {
  return useContext(ThemeContext).colors;
}

/** Returns the full theme context (colors + isDark + pref setter). */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
