// Repositori tabel settings.
import type { DB } from '../database';
import type { SettingsMap } from '@shared/types';
import { uuid } from '../../util/uuid';
import { toIsoLocal } from '../../util/time';

export const DEFAULT_SETTINGS: Record<string, string> = {
  store_name: 'GreenMart',
  min_stock_default: '5', // legacy v1.0.0 — tidak lagi dipakai (diganti low_stock_alert)
  sync_interval_minutes: '10',
  // v1.0.1
  low_stock_alert: '5', // batas global alert stok menipis
  opname_cycle_days: '3', // periode jaga X hari
  receipt_width_mm: '58', // lebar kertas struk thermal
  receipt_printer: '', // v1.0.3: nama printer struk/label; '' = default sistem, '__dialog__' = dialog print
  theme: 'system', // light | dark | system
};

/** Kategori awal agar grafik distribusi langsung terpakai (boleh diubah/dihapus di Pengaturan). */
const DEFAULT_CATEGORIES = ['Makanan', 'Minuman', 'Alat Tulis', 'Lainnya'];

export function seedDefaultCategories(db: DB): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }).c;
  if (count > 0) return;
  const ins = db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)');
  const now = toIsoLocal();
  for (const name of DEFAULT_CATEGORIES) ins.run(uuid(), name, now);
}

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
