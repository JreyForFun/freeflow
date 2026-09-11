import { getDb } from './client';

export type EventCategory = 'focus' | 'meeting' | 'personal' | 'imported';
export type EventSource = 'manual' | 'imported' | 'template';

export interface Event {
  id: string;
  title: string;
  date: string;       // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string | null;
  description: string | null;
  category: EventCategory;
  completed: number;  // 0 | 1
  source: EventSource;
  created_at: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getEventsByDate(date: string): Event[] {
  const db = getDb();
  return db.getAllSync<Event>(
    'SELECT * FROM events WHERE date = ? ORDER BY start_time ASC',
    [date]
  );
}

export function getEventById(id: string): Event | null {
  const db = getDb();
  return db.getFirstSync<Event>('SELECT * FROM events WHERE id = ?', [id]) ?? null;
}

export function getEventsForDateRange(startDate: string, endDate: string): Event[] {
  const db = getDb();
  return db.getAllSync<Event>(
    'SELECT * FROM events WHERE date >= ? AND date <= ? ORDER BY date ASC, start_time ASC',
    [startDate, endDate]
  );
}

// Returns count of completed events per day: { date: string; count: number }[]
export function getCompletedEventCountPerDay(
  startDate: string,
  endDate: string
): { date: string; count: number }[] {
  const db = getDb();
  return db.getAllSync<{ date: string; count: number }>(
    `SELECT date, COUNT(*) as count
     FROM events
     WHERE date >= ? AND date <= ? AND completed = 1
     GROUP BY date`,
    [startDate, endDate]
  );
}

// Returns total scheduled minutes per day over a date range
export function getScheduledMinutesPerDay(
  startDate: string,
  endDate: string
): { date: string; minutes: number }[] {
  const db = getDb();
  const rows = db.getAllSync<{ date: string; start_time: string; end_time: string | null }>(
    `SELECT date, start_time, end_time FROM events WHERE date >= ? AND date <= ?`,
    [startDate, endDate]
  );

  const map: Record<string, number> = {};
  for (const row of rows) {
    if (!row.end_time) continue;
    const [sh, sm] = row.start_time.split(':').map(Number);
    const [eh, em] = row.end_time.split(':').map(Number);
    const minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes > 0) {
      map[row.date] = (map[row.date] ?? 0) + minutes;
    }
  }

  return Object.entries(map).map(([date, minutes]) => ({ date, minutes }));
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function createEvent(event: Omit<Event, 'created_at'>): void {
  const db = getDb();
  db.runSync(
    `INSERT INTO events (id, title, date, start_time, end_time, description, category, completed, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.title,
      event.date,
      event.start_time,
      event.end_time ?? null,
      event.description ?? null,
      event.category,
      event.completed,
      event.source,
      new Date().toISOString(),
    ]
  );
}

export function updateEventTime(id: string, startTime: string, endTime: string | null): void {
  const db = getDb();
  db.runSync(
    'UPDATE events SET start_time = ?, end_time = ? WHERE id = ?',
    [startTime, endTime ?? null, id]
  );
}

export function toggleEventCompleted(id: string, completed: boolean): void {
  const db = getDb();
  db.runSync('UPDATE events SET completed = ? WHERE id = ?', [completed ? 1 : 0, id]);
}

export function updateEvent(id: string, updates: Partial<Pick<Event, 'title' | 'description' | 'category' | 'date' | 'start_time' | 'end_time'>>): void {
  const fields = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  const db = getDb();
  db.runSync(`UPDATE events SET ${fields} WHERE id = ?`, values);
}

export function deleteEvent(id: string): void {
  const db = getDb();
  db.runSync('DELETE FROM events WHERE id = ?', [id]);
}

// Dedup check for ICS import: skip if exact event already exists
export function eventExists(title: string, date: string, startTime: string): boolean {
  const db = getDb();
  const result = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM events WHERE title = ? AND date = ? AND start_time = ?',
    [title, date, startTime]
  );
  return (result?.count ?? 0) > 0;
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

/** Today's event stats for the Activity Rings widget */
export function getTodayEventStats(date: string): {
  total: number;
  completed: number;
  focusTotal: number;
  focusCompleted: number;
  scheduledMinutes: number;
} {
  const db = getDb();
  const rows = db.getAllSync<{
    completed: number;
    category: string;
    start_time: string;
    end_time: string | null;
  }>(
    `SELECT completed, category, start_time, end_time FROM events WHERE date = ?`,
    [date]
  );

  let total = 0, completed = 0, focusTotal = 0, focusCompleted = 0, scheduledMinutes = 0;
  for (const r of rows) {
    total++;
    if (r.completed) completed++;
    if (r.category === 'focus') {
      focusTotal++;
      if (r.completed) focusCompleted++;
    }
    if (r.end_time) {
      const [sh, sm] = r.start_time.split(':').map(Number);
      const [eh, em] = r.end_time.split(':').map(Number);
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins > 0) scheduledMinutes += mins;
    }
  }
  return { total, completed, focusTotal, focusCompleted, scheduledMinutes };
}

/** Longest continuous scheduled block (no gap > 15 min) across all events on a date.
 *  Returns minutes. Used by burnout algorithm to detect no-break days. */
export function getLongestContinuousBlockMinutes(date: string): number {
  const db = getDb();
  const rows = db.getAllSync<{ start_time: string; end_time: string }>(
    `SELECT start_time, end_time FROM events WHERE date = ? AND end_time IS NOT NULL ORDER BY start_time ASC`,
    [date]
  );
  if (rows.length === 0) return 0;

  const GAP_THRESHOLD = 15; // minutes — gaps larger than this break the chain
  let maxBlock = 0;
  let blockStart = -1;
  let blockEnd = -1;

  for (const r of rows) {
    const [sh, sm] = r.start_time.split(':').map(Number);
    const [eh, em] = r.end_time.split(':').map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (e <= s) continue;

    if (blockStart === -1) {
      blockStart = s; blockEnd = e;
    } else if (s - blockEnd <= GAP_THRESHOLD) {
      blockEnd = Math.max(blockEnd, e); // extend chain
    } else {
      maxBlock = Math.max(maxBlock, blockEnd - blockStart);
      blockStart = s; blockEnd = e;
    }
  }
  if (blockStart !== -1) maxBlock = Math.max(maxBlock, blockEnd - blockStart);
  return maxBlock;
}
