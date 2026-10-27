// Repositori laporan penjualan per item (harian/mingguan/bulanan) + baris rekap harian untuk Sheets.
import type { DB } from '../database';
import type { SalesReportRow, SalesDailyItemRow } from '@shared/types';

/** Agregat item terjual pada rentang tanggal lokal [start..end] (inklusif). */
export function salesByItem(db: DB, start: string, end: string): SalesReportRow[] {
  return db
    .prepare(
      `SELECT ti.barcode,
              ti.product_name,
              c.name AS category_name,
              SUM(ti.qty) AS qty,
              SUM(ti.subtotal) AS revenue
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       LEFT JOIN products p ON p.id = ti.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE substr(t.sold_at, 1, 10) >= ? AND substr(t.sold_at, 1, 10) <= ?
       GROUP BY ti.barcode
       ORDER BY revenue DESC, qty DESC`,
    )
    .all(start, end) as SalesReportRow[];
}

/** Rekap per (tanggal, barcode) — sumber tab Sheets 'Rekap Harian Item'. */
export function salesDailyItemRows(db: DB, start: string, end: string): SalesDailyItemRow[] {
  return db
    .prepare(
      `SELECT substr(t.sold_at, 1, 10) AS local_date,
              ti.barcode,
              ti.product_name,
              c.name AS category_name,
              SUM(ti.qty) AS qty,
              SUM(ti.subtotal) AS revenue
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       LEFT JOIN products p ON p.id = ti.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE substr(t.sold_at, 1, 10) >= ? AND substr(t.sold_at, 1, 10) <= ?
       GROUP BY local_date, ti.barcode
       ORDER BY local_date ASC, revenue DESC`,
    )
    .all(start, end) as SalesDailyItemRow[];
}

/** Tanggal transaksi terakhir/terbaru — untuk menentukan rentang sinkron rekap. */
export function earliestTransactionDate(db: DB): string | null {
  const row = db
    .prepare("SELECT substr(sold_at, 1, 10) AS d FROM transactions ORDER BY sold_at ASC LIMIT 1")
    .get() as { d: string } | undefined;
  return row?.d ?? null;
}

/** CSV laporan (delimiter titik-koma + BOM agar rapi dibuka di Excel Indonesia). */
export function buildReportCsv(rows: SalesReportRow[], headerLines: string[]): string {
  const esc = (s: string | number | null): string => {
    const str = String(s ?? '');
    return /[";\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
  };
  const lines: string[] = [...headerLines, ''];
  lines.push('Barcode;Nama Produk;Kategori;Qty;Omzet');
  for (const r of rows) {
    lines.push([r.barcode, r.product_name, r.category_name ?? '-', r.qty, r.revenue].map(esc).join(';'));
  }
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  lines.push(['TOTAL', '', '', totalQty, totalRev].map(esc).join(';'));
  return '\uFEFF' + lines.join('\r\n');
}
