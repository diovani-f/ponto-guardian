import { mkdirSync } from 'fs';
import Database from 'better-sqlite3';
import { join } from 'path';
import { Punch } from '../models/punch.model.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const root = process.env.PONTO_ROOT ?? process.cwd();
    const dataDir = join(root, 'data');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'ponto.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS punches (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      date      TEXT NOT NULL,
      time      TEXT NOT NULL,
      name      TEXT NOT NULL,
      type      TEXT NOT NULL CHECK (type IN ('ENTRY', 'EXIT')),
      synced_at TEXT NOT NULL,
      UNIQUE(date, name)
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at  TEXT NOT NULL,
      date_range TEXT NOT NULL,
      new_count  INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function upsertPunch(punch: Omit<Punch, 'id'>): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO punches (date, time, name, type, synced_at)
    VALUES (@date, @time, @name, @type, @syncedAt)
    ON CONFLICT(date, name) DO UPDATE SET
      time      = excluded.time,
      synced_at = excluded.synced_at
    WHERE punches.time != excluded.time
  `);
  const result = stmt.run(punch);
  return result.changes > 0;
}

export function getPunchesForDate(date: string): Punch[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, date, time, name, type, synced_at as syncedAt
    FROM punches
    WHERE date = ?
    ORDER BY time ASC
  `).all(date) as Punch[];
  return rows;
}

export function getLastSyncedAt(): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT synced_at FROM sync_log ORDER BY id DESC LIMIT 1
  `).get() as { synced_at: string } | undefined;
  return row?.synced_at ?? null;
}

export function logSync(dateRange: string, newCount: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_log (synced_at, date_range, new_count)
    VALUES (?, ?, ?)
  `).run(new Date().toISOString(), dateRange, newCount);
}
