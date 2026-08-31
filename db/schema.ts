import { getDb } from './client';

export function runMigrations(): void {
  const db = getDb();

  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      description TEXT,
      category TEXT DEFAULT 'personal',
      completed INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      blocks TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'light');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('notifications_enabled', 'false');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('notification_time', '08:00');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('time_format', '24h');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_model_downloaded', 'false');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_model_path', '');
  `);
}
