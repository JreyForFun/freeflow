import { getDb } from './client';

export interface Task {
  id: string;
  event_id: string;
  title: string;
  completed: number; // 0 | 1
  sort_order: number;
}

export function getTasksByEvent(eventId: string): Task[] {
  const db = getDb();
  return db.getAllSync<Task>(
    'SELECT * FROM tasks WHERE event_id = ? ORDER BY sort_order ASC',
    [eventId]
  );
}

export function createTask(task: Omit<Task, 'sort_order'>): void {
  const db = getDb();
  // Auto-assign sort_order as max + 1
  const maxResult = db.getFirstSync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) as max_order FROM tasks WHERE event_id = ?',
    [task.event_id]
  );
  const sortOrder = (maxResult?.max_order ?? -1) + 1;
  db.runSync(
    'INSERT INTO tasks (id, event_id, title, completed, sort_order) VALUES (?, ?, ?, ?, ?)',
    [task.id, task.event_id, task.title, 0, sortOrder]
  );
}

export function toggleTask(id: string, completed: boolean): void {
  const db = getDb();
  db.runSync('UPDATE tasks SET completed = ? WHERE id = ?', [completed ? 1 : 0, id]);
}

export function deleteTask(id: string): void {
  const db = getDb();
  db.runSync('DELETE FROM tasks WHERE id = ?', [id]);
}

export function getTaskCountForEvent(eventId: string): { total: number; completed: number } {
  const db = getDb();
  const result = db.getFirstSync<{ total: number; completed: number }>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
     FROM tasks WHERE event_id = ?`,
    [eventId]
  );
  return { total: result?.total ?? 0, completed: result?.completed ?? 0 };
}
