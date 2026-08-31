/**
 * services/notificationService.ts
 *
 * Manages local daily reminder notifications using expo-notifications.
 * Default: 8:00 AM, "Good morning — your schedule is ready in freeflow."
 */

import * as Notifications from 'expo-notifications';
import { getDb } from '@/db/client';

const CHANNEL_ID = 'freeflow-daily';
const NOTIFICATION_ID = 'daily-reminder';

// ── Android channel setup ──────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily Reminder',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
  });
}

// ── Permission ────────────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Schedule daily notification ───────────────────────────────────────────────
export async function scheduleNotification(
  hour = 8,
  minute = 0,
): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: 'Good morning ☀️',
      body: 'Your schedule is ready in freeflow.',
      data: {},
    },
    trigger: {
      channelId: CHANNEL_ID,
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

// ── Cancel all ────────────────────────────────────────────────────────────────
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ── Persist preference in SQLite ──────────────────────────────────────────────
export function getNotificationEnabled(): boolean {
  try {
    const db = getDb();
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'notifications_enabled'",
    );
    return row?.value === 'true';
  } catch {
    return false;
  }
}

export function setNotificationEnabled(enabled: boolean): void {
  const db = getDb();
  db.runSync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('notifications_enabled', ?)",
    [enabled ? 'true' : 'false'],
  );
}
