// Repositori tabel settings.
import type { DB } from '../database';
import type { SettingsMap } from '@shared/types';

export const DEFAULT_SETTINGS: Record<string, string> = {
  store_name: 'GreenMart',
  min_stock_default: '5',
  sync_interval_minutes: '10',
};

export function seedDefaultSettings(db: DB): void {
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
}

export function getSetting(db: DB, key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function getAllSettings(db: DB): SettingsMap {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const map: SettingsMap = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
