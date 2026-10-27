// Backup harian kasir.db (PRD F6): salin saat aplikasi pertama dijalankan hari itu,
// simpan 7 salinan terakhir. WAL di-checkpoint dulu agar file tunggal konsisten.
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './database';
import type { BackupFile } from '@shared/types';
import { localDate, toIsoLocal } from '../util/time';

const KEEP = 7;

export function listBackups(dir: string): BackupFile[] {
  if (!fs.existsSync(dir)) return [];
  const out: BackupFile[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('kasir-') || !name.endsWith('.db')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    out.push({ name, size: st.size, created: toIsoLocal(new Date(st.mtime)) });
  }
  out.sort((a, b) => (a.name < b.name ? 1 : -1));
  return out;
}

function prune(dir: string): void {
  const files = listBackups(dir);
  for (const f of files.slice(KEEP)) {
    try {
      fs.unlinkSync(path.join(dir, f.name));
    } catch {
      // abaikan — jangan gagalkan backup karena gagal hapus file lama
    }
  }
}

export interface BackupResult {
  skipped: boolean;
  file: string;
}

/** backupDaily=true -> satu file per hari (kasir-YYYY-MM-DD.db), skip bila sudah ada. */
export function runBackup(db: DB, dir: string, backupDaily: boolean): BackupResult {
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const name = backupDaily
    ? `kasir-${localDate(now)}.db`
    : `kasir-${localDate(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.db`;
  const target = path.join(dir, name);
  if (backupDaily && fs.existsSync(target)) {
    return { skipped: true, file: target };
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(db.name, target);
  prune(dir);
  return { skipped: false, file: target };
}
