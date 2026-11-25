import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = path.resolve(process.env.JARVIS_DATA_DIR || path.join(ROOT, 'data'));
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const DB_FILE = path.join(DATA_DIR, 'jarvis.db');

export const FOLDERS = [
  '00_INBOX', '01_IDENTITY', '02_BUSINESS', '03_PROJECTS', '04_CONTENT', '05_MARKETING',
  '06_KNOWLEDGE', '07_PROMPTS', '08_SOP', '09_DECISIONS', '10_ARCHIVE',
] as const;
export const KINDS = ['fact', 'assumption', 'suggestion', 'decision', 'note'] as const;

let db: Database.Database | null = null;

export function openDb(): Database.Database {
  if (db) return db;
  for (const d of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR]) fs.mkdirSync(d, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
export function getDb(): Database.Database { return db ?? openDb(); }
export function closeDb() { if (db) { db.close(); db = null; } }

export function migrate(d: Database.Database) {
  d.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = path.join(here, 'migrations');
  const done = new Set(d.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    d.transaction(() => {
      d.exec(sql);
      d.prepare('INSERT INTO _migrations VALUES (?, ?)').run(f, now());
    })();
  }
}

export const now = () => new Date().toISOString();

export function getSetting<T>(key: string, fallback: T): T {
  const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!r) return fallback;
  try { return JSON.parse(r.value) as T; } catch { return fallback; }
}
export function setSetting(key: string, value: unknown) {
  getDb().prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}
export function log(action: string, entity = '', entityId: string | number = '', detail = '') {
  getDb().prepare('INSERT INTO audit_log(action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?)')
    .run(action, entity, String(entityId), detail.slice(0, 500), now());
}

/** Asia/Tashkent — доимий UTC+5, ёзги вақт йўқ. */
export const TZ_OFFSET_MIN = 5 * 60;
export function tashkentParts(d: Date) {
  const t = new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`,
    time: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`,
    weekday: t.getUTCDay(), monthday: t.getUTCDate(),
  };
}
/** Тошкент маҳаллий вақти ("YYYY-MM-DDTHH:MM") → UTC Date. */
export function tashkentToDate(local: string): Date {
  return new Date(Date.parse(local + ':00Z') - TZ_OFFSET_MIN * 60000);
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') { super(message); }
}
