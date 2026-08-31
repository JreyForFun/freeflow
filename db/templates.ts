/**
 * db/templates.ts — CRUD for user-created schedule templates.
 *
 * A template is a named collection of time blocks that can be
 * applied to any day. Built-in templates are hardcoded in hub.tsx;
 * this module only handles user-created templates persisted in SQLite.
 *
 * Block schema (stored as JSON string):
 *   { title: string; start: string; end: string; category: EventCategory }[]
 */

import { getDb } from './client';
import { randomUUID } from 'expo-crypto';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TemplateBlock {
  title: string;
  start: string;  // HH:MM
  end: string;    // HH:MM
  category: string;
}

export interface Template {
  id: string;
  name: string;
  blocks: TemplateBlock[];
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rowToTemplate(row: {
  id: string;
  name: string;
  blocks: string;
  created_at: string;
}): Template {
  return {
    id: row.id,
    name: row.name,
    blocks: JSON.parse(row.blocks) as TemplateBlock[],
    created_at: row.created_at,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Return all user templates ordered newest-first. */
export function getUserTemplates(): Template[] {
  const db = getDb();
  const rows = db.getAllSync<{
    id: string; name: string; blocks: string; created_at: string;
  }>('SELECT * FROM templates ORDER BY created_at DESC');
  return rows.map(rowToTemplate);
}

/** Create a new user template. Returns the generated id. */
export function createTemplate(name: string, blocks: TemplateBlock[]): string {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.runSync(
    'INSERT INTO templates (id, name, blocks, created_at) VALUES (?, ?, ?, ?)',
    [id, name.trim(), JSON.stringify(blocks), now],
  );
  return id;
}

/** Update an existing template's name and/or blocks. */
export function updateTemplate(
  id: string,
  name: string,
  blocks: TemplateBlock[],
): void {
  const db = getDb();
  db.runSync(
    'UPDATE templates SET name = ?, blocks = ? WHERE id = ?',
    [name.trim(), JSON.stringify(blocks), id],
  );
}

/** Delete a user template by id. */
export function deleteTemplate(id: string): void {
  const db = getDb();
  db.runSync('DELETE FROM templates WHERE id = ?', [id]);
}
