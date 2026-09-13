/**
 * services/notificationService.ts
 *
 * 4 types of notifications:
 *   1. Event Reminder  — 5 min before each event's start time (today)
 *   2. Event Start     — exact moment each event starts (today)
 *   3. Good Morning    — every day at 07:00 with a daily quote
 *   4. Motivational    — 4 random times per day (09:00–21:00), random quotes
 */

import * as Notifications from 'expo-notifications';
import { getDb } from '@/db/client';
import type { Event } from '@/db/events';

// ── Channels / identifiers ────────────────────────────────────────────────────
const CHANNEL_ID            = 'freeflow-daily';
const CHANNEL_EVENT_ID      = 'freeflow-events';
const QUOTE_PREFIX          = 'quote-';
const EVENT_REMINDER_PREFIX = 'event-reminder-';
const EVENT_START_PREFIX    = 'event-start-';
// Morning notifications use identifiers 'morning-0' through 'morning-6'
const MORNING_PREFIX        = 'morning-';

// ── Notification handler (show while app is foregrounded too) ─────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Quote banks ───────────────────────────────────────────────────────────────
const MORNING_QUOTES: string[] = [
  'Small steps every day lead to big results.',
  'Your focus determines your reality.',
  'Begin with intention. The rest will follow.',
  'Today is a fresh start — make it count.',
  'One task at a time, done well.',
  'Clarity is the foundation of great work.',
  'A calm morning sets the tone for a great day.',
  'What you do today creates tomorrow.',
  'Progress, not perfection.',
  'Show up. That\'s half the battle.',
  'You don\'t have to be great to start, but you have to start to be great.',
  'Each morning is a new chapter. Write it well.',
  'Discipline is choosing between what you want now and what you want most.',
  'The secret of getting ahead is getting started.',
  'Do the hard thing first. The rest feels easy after.',
  'Good things grow from consistent effort.',
  'Your work has value. Show up for it.',
  'Focus on what matters. Let the rest go.',
  'Today\'s choices are tomorrow\'s results.',
  'Energy follows attention. Choose wisely.',
  'A good plan today beats a perfect plan tomorrow.',
  'Build the day you wish you had.',
  'Momentum starts with one small action.',
  'Intention is the beginning of every good outcome.',
  'Work with purpose. Rest with peace.',
  'You are more capable than yesterday.',
  'Make today interesting.',
  'Structure frees the mind to do its best work.',
  'Every expert was once a beginner. Keep going.',
  'The best time to start is now.',
];

const MOTIVATIONAL_QUOTES: string[] = [
  'Take a breath. You\'re doing better than you think.',
  'Halfway through — you\'ve got this.',
  'Protect your energy. Say no to what doesn\'t serve you.',
  'The way you talk to yourself matters. Be kind.',
  'Hard work compounds. Keep stacking.',
  'Discomfort is a sign of growth.',
  'Do one thing that moves the needle today.',
  'Check in with yourself. How are you doing?',
  'Consistency beats intensity every time.',
  'Rest is productive. Don\'t forget to recharge.',
  'Small wins deserve to be celebrated.',
  'What you repeatedly do, you become.',
  'Done is better than perfect.',
  'Your best work happens when you\'re at your best. Take care of yourself.',
  'One focused hour beats three distracted ones.',
  'Adjust the plan, not the goal.',
  'You\'ve handled harder days. This one is yours.',
  'Drink some water. Stretch. You\'ve earned a moment.',
  'Don\'t let perfect stop good.',
  'Notice what\'s working. Do more of it.',
  'Make the next hour count.',
  'Difficult roads lead to beautiful destinations.',
  'Your potential is limitless. Take one step forward.',
  'Every task you finish is a promise kept to yourself.',
  'The grind is the goal.',
  'Pause. Breathe. Refocus.',
  'What is the most important thing right now? Do that.',
  'Momentum is built in the quiet moments.',
  'Not every day is perfect. Every day is progress.',
  'You\'re building something. Stay with it.',
  'Be where your feet are.',
  'Simplify. Focus. Execute.',
  'Challenges are invitations to grow.',
  'The people who thrive are the ones who keep going.',
  'Act as if it\'s already working.',
  'How you do anything is how you do everything.',
  'Your next step doesn\'t have to be giant. Just forward.',
  'Clarity comes from action, not thought alone.',
  'Make space for deep work today.',
  'Evening check-in: what went well? Build on that.',
];

// ── Android channel setup ──────────────────────────────────────────────────────
export async function setupNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_EVENT_ID, {
    name: 'Event Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

// ── Permission ────────────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeToDate(timeStr: string, base: Date = new Date()): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function pickQuote(bank: string[], seed: number): string {
  return bank[Math.abs(seed) % bank.length];
}

/** Returns 4 random times (Date objects) spread across 09:00–21:00,
 *  each at least 2 hours apart. Seeded by today's date for consistency
 *  within the same day but different each day. */
function buildRandomQuoteTimes(): Date[] {
  const today = new Date();
  // Use date as seed so times are consistent within a day
  const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  const START_HOUR = 9;
  const END_HOUR   = 21; // exclusive, so last slot ends at 21:00
  const RANGE      = END_HOUR - START_HOUR; // 12 hours
  const SLOTS      = 4;
  const MIN_GAP    = 120; // minutes

  const times: Date[] = [];
  // Divide the range into 4 equal windows and pick one random minute in each
  const windowSize = (RANGE * 60) / SLOTS; // 180 min per slot

  for (let i = 0; i < SLOTS; i++) {
    const windowStart = START_HOUR * 60 + i * windowSize;
    // Pseudo-random offset within the window using the day seed
    const pseudoRandom = ((daySeed * (i + 7) * 31337) >>> 0) % (windowSize - MIN_GAP);
    const totalMinutes = Math.floor(windowStart + MIN_GAP / 2 + pseudoRandom);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    const t = new Date();
    t.setHours(h, m, 0, 0);
    times.push(t);
  }

  return times;
}

// ── 1. Schedule event notifications (reminder + exact start) ──────────────────
export async function scheduleEventNotifications(events: Event[]): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  // Cancel existing event notifications
  await cancelEventNotifications();

  const now = new Date();

  for (const event of events) {
    const startDate = timeToDate(event.start_time);

    // 5-min reminder
    const reminderDate = new Date(startDate.getTime() - 5 * 60 * 1000);
    if (reminderDate > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${EVENT_REMINDER_PREFIX}${event.id}`,
        content: {
          title: '⏰ Starting soon',
          body: `${event.title} starts in 5 minutes`,
          data: { eventId: event.id },
        },
        trigger: {
          channelId: CHANNEL_EVENT_ID,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        },
      });
    }

    // Exact start
    if (startDate > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${EVENT_START_PREFIX}${event.id}`,
        content: {
          title: '🚀 Starting now',
          body: event.title,
          data: { eventId: event.id },
        },
        trigger: {
          channelId: CHANNEL_EVENT_ID,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: startDate,
        },
      });
    }
  }
}

/** Cancel only the per-event notifications (leaves morning + quotes intact). */
export async function cancelEventNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const eventIds = scheduled
    .filter(n =>
      n.identifier.startsWith(EVENT_REMINDER_PREFIX) ||
      n.identifier.startsWith(EVENT_START_PREFIX)
    )
    .map(n => n.identifier);

  await Promise.all(eventIds.map(id =>
    Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  ));
}

// ── 2. Good Morning — 7:00 AM daily ──────────────────────────────────────────
// Schedules the next 7 mornings individually so each day gets a DIFFERENT quote.
// On every app launch the next 7 days are rescheduled, keeping content fresh.
export async function scheduleMorningGreeting(): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  // Cancel any existing morning notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const morningIds = scheduled
    .filter(n => n.identifier.startsWith(MORNING_PREFIX))
    .map(n => n.identifier);
  await Promise.all(morningIds.map(id =>
    Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  ));

  const now = new Date();

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const fireDate = new Date();
    fireDate.setDate(fireDate.getDate() + dayOffset);
    fireDate.setHours(7, 0, 0, 0);

    // Skip if this morning has already passed today
    if (fireDate <= now) continue;

    // Deterministic quote: different each day, consistent across rescheduling
    const daySeed =
      fireDate.getFullYear() * 10000 +
      (fireDate.getMonth() + 1) * 100 +
      fireDate.getDate();
    const quote = pickQuote(MORNING_QUOTES, daySeed);

    await Notifications.scheduleNotificationAsync({
      identifier: `${MORNING_PREFIX}${dayOffset}`,
      content: {
        title: 'Good morning ☀️',
        body: quote,
        data: {},
      },
      trigger: {
        channelId: CHANNEL_ID,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
  }
}

// ── 3. Random motivational quotes — 4 times per day ──────────────────────────
export async function scheduleRandomQuotes(): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  // Cancel existing quote notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const quoteIds = scheduled
    .filter(n => n.identifier.startsWith(QUOTE_PREFIX))
    .map(n => n.identifier);
  await Promise.all(quoteIds.map(id =>
    Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  ));

  const times = buildRandomQuoteTimes();
  const now = new Date();
  // Compute daySeed once outside the loop
  const quoteToday = new Date();
  const daySeed =
    quoteToday.getFullYear() * 10000 +
    (quoteToday.getMonth() + 1) * 100 +
    quoteToday.getDate();

  for (let i = 0; i < times.length; i++) {
    if (times[i] <= now) continue; // skip times already past today

    // Different quote per slot per day
    const quote = pickQuote(MOTIVATIONAL_QUOTES, daySeed + i * 13);

    await Notifications.scheduleNotificationAsync({
      identifier: `${QUOTE_PREFIX}${i}`,
      content: {
        title: 'freeflow',
        body: quote,
        data: {},
      },
      trigger: {
        channelId: CHANNEL_ID,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: times[i],
      },
    });
  }
}

// ── Master: schedule everything ───────────────────────────────────────────────
export async function scheduleAllNotifications(events: Event[]): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Promise.all([
    scheduleEventNotifications(events),
    scheduleMorningGreeting(),
    scheduleRandomQuotes(),
  ]);
}

// ── Cancel all ────────────────────────────────────────────────────────────────
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ── Legacy: kept for backwards compat with settings.tsx toggle ────────────────
/** @deprecated Use scheduleAllNotifications() instead */
export async function scheduleNotification(_hour = 8, _minute = 0): Promise<void> {
  // No-op — the new system doesn't use a configurable reminder time
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
