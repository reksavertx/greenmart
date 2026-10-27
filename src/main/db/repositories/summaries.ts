// Recompute ringkasan harian dari transactions (PRD §6 aturan penulisan transaksi).
import type { DB } from '../database';

export function recomputeDailySummary(db: DB, date: string): void {
  db.prepare(
    `INSERT INTO daily_summaries (local_date, revenue, transaction_count, items_sold, sync_status)
     SELECT ?, COALESCE(SUM(total), 0), COUNT(*), COALESCE(SUM(item_count), 0), 'pending'
     FROM transactions WHERE substr(sold_at, 1, 10) = ?
     ON CONFLICT(local_date) DO UPDATE SET
       revenue = excluded.revenue,
       transaction_count = excluded.transaction_count,
       items_sold = excluded.items_sold,
       sync_status = 'pending',
       synced_at = NULL,
       sync_error = NULL`,
  ).run(date, date);
}

export function getDailySummary(db: DB, date: string): {
  local_date: string;
  revenue: number;
  transaction_count: number;
  items_sold: number;
} {
  return db
    .prepare(
      'SELECT local_date, revenue, transaction_count, items_sold FROM daily_summaries WHERE local_date = ?',
    )
    .get(date) as {
    local_date: string;
    revenue: number;
    transaction_count: number;
    items_sold: number;
  };
}
