/**
 * hooks/useTimeFormat.ts
 *
 * Reads the user's preferred time format ('24h' | '12h') from SQLite
 * and provides a formatTime() helper that converts 'HH:MM' strings.
 *
 * Internal storage is always 24hr (HH:MM).
 * This hook only affects display.
 */

import { useCallback } from 'react';
import { getDb } from '@/db/client';

export type TimeFormat = '24h' | '12h';

/** Read the current time_format preference from settings table. */
export function getTimeFormatPref(): TimeFormat {
  try {
    const db = getDb();
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'time_format'",
    );
    return (row?.value === '12h') ? '12h' : '24h';
  } catch {
    return '24h';
  }
}

/** Save the time_format preference to settings table. */
export function setTimeFormatPref(format: TimeFormat): void {
  const db = getDb();
  db.runSync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('time_format', ?)",
    [format],
  );
}

/**
 * Convert 'HH:MM' (24hr) to the user's preferred display format.
 * Examples:
 *   formatTime('09:30', '24h') → '09:30'
 *   formatTime('09:30', '12h') → '9:30 AM'
 *   formatTime('13:45', '12h') → '1:45 PM'
 *   formatTime('00:00', '12h') → '12:00 AM'
 */
export function formatTime(hhmm: string, format: TimeFormat): string {
  if (!hhmm) return '';
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  const h = parseInt(m[1], 10);
  const min = m[2];
  if (format === '24h') return `${h.toString().padStart(2, '0')}:${min}`;

  // 12hr conversion
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${period}`;
}

/**
 * Format an hour index (0–23) as a timeline label.
 * Examples:
 *   formatHourLabel(9, '24h') → '09:00'
 *   formatHourLabel(9, '12h') → '9 AM'
 *   formatHourLabel(13, '12h') → '1 PM'
 *   formatHourLabel(0, '12h') → '12 AM'
 */
export function formatHourLabel(hour: number, format: TimeFormat): string {
  if (format === '24h') return `${hour.toString().padStart(2, '0')}:00`;
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}
