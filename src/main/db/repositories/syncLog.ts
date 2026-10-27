// sync_log + hitungan status sinkronisasi untuk UI.
import type { DB } from '../database';
import type { StatusCounts, SyncLogEntry, SyncStatusInfo } from '@shared/types';
import { toIsoLocal } from '../../util/time';
import { getSetting } from './settings';

export function addSyncLog(db: DB, scope: string, status: 'ok' | 'error', message?: string): void {
  db.prepare('INSERT INTO sync_log (scope, status, message, created_at) VALUES (?, ?, ?, ?)').run(
    scope,
    status,
    message ?? null,
    toIsoLocal(),
  );
}

export function recentSyncErrors(db: DB, limit = 10): SyncLogEntry[] {
  return db
    .prepare("SELECT id, scope, status, message, created_at FROM sync_log WHERE status = 'error' ORDER BY id DESC LIMIT ?")
    .all(limit) as SyncLogEntry[];
}

function countStatuses(db: DB, table: 'transactions' | 'daily_summaries'): StatusCounts {
  const rows = db
    .prepare(`SELECT sync_status AS s, COUNT(*) AS c FROM ${table} GROUP BY sync_status`)
    .all() as { s: string; c: number }[];
  const counts: StatusCounts = { pending: 0, failed: 0 };
  for (const r of rows) {
    if (r.s === 'pending') counts.pending = r.c;
    if (r.s === 'failed') counts.failed = r.c;
  }
  return counts;
}

export function getSyncStatusInfo(db: DB, running: boolean): SyncStatusInfo {
  const last = getSetting(db, 'last_sync_at', '');
  return {
    running,
    last_sync_at: last || null,
    transactions: countStatuses(db, 'transactions'),
    daily: countStatuses(db, 'daily_summaries'),
    recent_errors: recentSyncErrors(db),
  };
}
