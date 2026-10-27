// Repositori stok opname (v1.0.1) — mencatat selisih, TIDAK mengubah stok sistem.
import type { DB } from '../database';
import type {
  OpnamePhase,
  StockOpname,
  StockOpnameDetail,
  StockOpnameItem,
  StockOpnameSummary,
} from '@shared/types';
import { uuid } from '../../util/uuid';
import { toIsoLocal, localDate } from '../../util/time';

/** Baris mentah tabel stock_opnames (struktur = StockOpname). */
type HeadRow = StockOpname;

export function getDraft(db: DB, date: string, phase: OpnamePhase): StockOpname | null {
  return (
    (db
      .prepare("SELECT * FROM stock_opnames WHERE local_date = ? AND phase = ? AND status = 'draft'")
      .get(date, phase) as StockOpname | undefined) ?? null
  );
}

/** Draft sesi apa pun (fase bebas) yang masih terbuka — untuk tombol "lanjutkan opname". */
export function getCurrentDraft(db: DB): StockOpname | null {
  return (
    (db
      .prepare("SELECT * FROM stock_opnames WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1")
      .get() as StockOpname | undefined) ?? null
  );
}

/** Mulai (atau lanjutkan) sesi opname: snapshot semua produk aktif dengan stok sistem saat ini. */
export function startOpname(db: DB, phase: OpnamePhase, petugas: string | null): StockOpnameDetail {
  const today = localDate();
  const existing = getDraft(db, today, phase);
  if (existing) return getOpname(db, existing.id) as StockOpnameDetail;

  const id = uuid();
  const now = toIsoLocal();
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO stock_opnames (id, local_date, phase, petugas, status, created_at)
       VALUES (?, ?, ?, ?, 'draft', ?)`,
    ).run(id, today, phase, petugas, now);
    const products = db
      .prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY name COLLATE NOCASE')
      .all() as {
      id: string;
      barcode: string;
      name: string;
      price: number;
      stock: number;
    }[];
    const ins = db.prepare(
      `INSERT INTO stock_opname_items
         (id, opname_id, product_id, barcode, product_name, price, system_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of products) ins.run(uuid(), id, p.id, p.barcode, p.name, p.price, p.stock);
  });
  run();
  return getOpname(db, id) as StockOpnameDetail;
}

function computeDiff(systemStock: number, price: number, physical: number | null): {
  diff_qty: number | null;
  diff_value: number | null;
} {
  if (physical === null || physical === undefined) return { diff_qty: null, diff_value: null };
  const diff = systemStock - physical;
  return { diff_qty: diff, diff_value: diff * price };
}

/** Input stok fisik satu item (qty bisa 0). Physical null = kosongkan. */
export function setPhysical(db: DB, itemId: string, qty: number | null): StockOpnameItem {
  const item = db.prepare('SELECT * FROM stock_opname_items WHERE id = ?').get(itemId) as
    | StockOpnameItem
    | undefined;
  if (!item) throw new Error('Item opname tidak ditemukan.');
  const head = db.prepare('SELECT status FROM stock_opnames WHERE id = ?').get(item.opname_id) as {
    status: string;
  };
  if (head.status !== 'draft') throw new Error('Opname sudah dikonfirmasi — tidak bisa diubah.');
  let physical: number | null = null;
  if (qty !== null) {
    if (!Number.isInteger(qty) || qty < 0) throw new Error('Stok fisik harus bilangan bulat >= 0.');
    physical = qty;
  }
  const { diff_qty, diff_value } = computeDiff(item.system_stock, item.price, physical);
  db.prepare(
    'UPDATE stock_opname_items SET physical_stock = ?, diff_qty = ?, diff_value = ? WHERE id = ?',
  ).run(physical, diff_qty, diff_value, itemId);
  return db.prepare('SELECT * FROM stock_opname_items WHERE id = ?').get(itemId) as StockOpnameItem;
}

/** Isi semua item yang masih kosong dengan stok sistem (selisih 0). */
export function fillRemainingWithSystem(db: DB, opnameId: string): number {
  const items = db
    .prepare('SELECT * FROM stock_opname_items WHERE opname_id = ? AND physical_stock IS NULL')
    .all(opnameId) as StockOpnameItem[];
  const stmt = db.prepare(
    'UPDATE stock_opname_items SET physical_stock = system_stock, diff_qty = 0, diff_value = 0 WHERE id = ?',
  );
  const tx = db.transaction(() => {
    for (const it of items) stmt.run(it.id);
  });
  tx();
  return items.length;
}

export function getOpname(db: DB, id: string): StockOpnameDetail | null {
  const head = db.prepare('SELECT * FROM stock_opnames WHERE id = ?').get(id) as
    | HeadRow
    | undefined;
  if (!head) return null;
  const items = db
    .prepare('SELECT * FROM stock_opname_items WHERE opname_id = ? ORDER BY product_name COLLATE NOCASE')
    .all(id) as StockOpnameItem[];
  const filled = items.filter((i) => i.physical_stock !== null).length;
  const diffItems = items.filter((i) => (i.diff_qty ?? 0) !== 0).length;
  const diffTotal = items.reduce((s, i) => s + (i.diff_value ?? 0), 0);
  return {
    ...head,
    items,
    filled_count: filled,
    total_count: items.length,
    diff_items: diffItems,
    diff_value_total: diffTotal,
  };
}

/** Konfirmasi: semua item wajib terisi. Stok sistem TIDAK diubah (keputusan v1.0.1). */
export function confirmOpname(db: DB, id: string): StockOpnameDetail {
  const head = db.prepare('SELECT * FROM stock_opnames WHERE id = ?').get(id) as HeadRow | undefined;
  if (!head) throw new Error('Sesi opname tidak ditemukan.');
  if (head.status === 'done') return getOpname(db, id) as StockOpnameDetail;
  const missing = (
    db
      .prepare('SELECT COUNT(*) AS c FROM stock_opname_items WHERE opname_id = ? AND physical_stock IS NULL')
      .get(id) as { c: number }
  ).c;
  if (missing > 0) {
    throw new Error(`Masih ada ${missing} produk yang stok fisiknya belum diisi.`);
  }
  db.prepare("UPDATE stock_opnames SET status = 'done', confirmed_at = ? WHERE id = ?").run(
    toIsoLocal(),
    id,
  );
  return getOpname(db, id) as StockOpnameDetail;
}

export function cancelDraft(db: DB, id: string): void {
  db.prepare("DELETE FROM stock_opnames WHERE id = ? AND status = 'draft'").run(id);
}

export function listOpnames(db: DB, limit = 20): StockOpnameSummary[] {
  return db
    .prepare(
      `SELECT o.id, o.local_date, o.phase, o.petugas, o.status, o.confirmed_at, o.synced_at,
              COUNT(i.id) AS total_items,
              SUM(CASE WHEN i.diff_qty != 0 THEN 1 ELSE 0 END) AS diff_items,
              COALESCE(SUM(i.diff_value), 0) AS diff_value_total
       FROM stock_opnames o
       LEFT JOIN stock_opname_items i ON i.opname_id = o.id
       GROUP BY o.id
       ORDER BY o.local_date DESC, o.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StockOpnameSummary[];
}

/** Opname 'done' terakhir (untuk perhitungan siklus pengingat). */
export function getLastDone(db: DB): { date: string; phase: OpnamePhase } | null {
  const row = db
    .prepare(
      "SELECT local_date, phase FROM stock_opnames WHERE status = 'done' ORDER BY confirmed_at DESC LIMIT 1",
    )
    .get() as { local_date: string; phase: OpnamePhase } | undefined;
  return row ? { date: row.local_date, phase: row.phase } : null;
}

/** Sesi done yang belum tersinkron ke Sheets (beserta itemnya). */
export function unsyncedDone(db: DB): StockOpnameDetail[] {
  const heads = db
    .prepare(
      "SELECT * FROM stock_opnames WHERE status = 'done' AND synced_at IS NULL ORDER BY confirmed_at ASC LIMIT 20",
    )
    .all() as HeadRow[];
  const itemsStmt = db.prepare(
    'SELECT * FROM stock_opname_items WHERE opname_id = ? ORDER BY product_name COLLATE NOCASE',
  );
  return heads.map((h) => {
    const items = itemsStmt.all(h.id) as StockOpnameItem[];
    const filled = items.filter((i) => i.physical_stock !== null).length;
    const diffItems = items.filter((i) => (i.diff_qty ?? 0) !== 0).length;
    return {
      ...h,
      items,
      filled_count: filled,
      total_count: items.length,
      diff_items: diffItems,
      diff_value_total: items.reduce((s, i) => s + (i.diff_value ?? 0), 0),
    };
  });
}

export function markSynced(db: DB, ids: string[]): void {
  if (!ids.length) return;
  const now = toIsoLocal();
  const stmt = db.prepare('UPDATE stock_opnames SET synced_at = ? WHERE id = ?');
  const tx = db.transaction((list: string[]) => {
    for (const id of list) stmt.run(now, id);
  });
  tx(ids);
}
