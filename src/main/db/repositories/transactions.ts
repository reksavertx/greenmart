// Pembuatan transaksi penjualan — atomik sesuai PRD §6.
import type { DB } from '../database';
import type { CartItemInput, PaymentResult, Product, Student } from '@shared/types';
import { uuid } from '../../util/uuid';
import { toIsoLocal, localDate, compactDate } from '../../util/time';
import { getSetting } from './settings';
import { recomputeDailySummary } from './summaries';

/**
 * Satu SQLite transaction: INSERT transactions + INSERT transaction_items +
 * UPDATE stok + upsert daily_summaries + kode TRX-YYYYMMDD-NNNN.
 * Gagal di tengah -> rollback penuh (better-sqlite3 db.transaction).
 */
export function createTransaction(db: DB, items: CartItemInput[]): PaymentResult {
  const now = toIsoLocal();
  const date = localDate();

  const run = db.transaction((): PaymentResult => {
    if (!items.length) throw new Error('Keranjang kosong — tidak ada yang dibayar.');

    // Agregasi defensif per barcode (keranjang seharusnya sudah menggabungkan).
    const qtyByBarcode = new Map<string, number>();
    for (const it of items) {
      if (!Number.isInteger(it.qty) || it.qty <= 0) {
        throw new Error(`Qty tidak valid untuk barcode ${it.barcode}.`);
      }
      qtyByBarcode.set(it.barcode, (qtyByBarcode.get(it.barcode) ?? 0) + it.qty);
    }

    const getProd = db.prepare('SELECT * FROM products WHERE barcode = ?');
    const resolved: { product: Product; qty: number }[] = [];
    for (const [barcode, qty] of qtyByBarcode) {
      const product = (getProd.get(barcode) as Product | undefined) ?? null;
      if (!product) throw new Error(`Produk dengan barcode ${barcode} tidak ditemukan.`);
      if (!product.is_active) throw new Error(`Produk ${product.name} sedang tidak aktif.`);
      if (product.stock < qty) {
        throw new Error(`Stok ${product.name} tidak cukup (sisa ${product.stock}).`);
      }
      resolved.push({ product, qty });
    }

    // Nomor urut hari itu (single-process + sinkron -> aman; UNIQUE melindungi).
    const seqRow = db
      .prepare("SELECT COUNT(*) AS c FROM transactions WHERE substr(sold_at, 1, 10) = ?")
      .get(date) as { c: number };
    const code = `TRX-${compactDate(date)}-${String(seqRow.c + 1).padStart(4, '0')}`;

    const cashierId = getSetting(db, 'active_cashier_student_id', '') || null;
    let total = 0;
    let itemCount = 0;
    for (const r of resolved) {
      total += r.product.price * r.qty;
      itemCount += r.qty;
    }

    const id = uuid();
    db.prepare(
      `INSERT INTO transactions
         (id, code, total, item_count, payment_method, cashier_student_id, sold_at, created_at, sync_status)
       VALUES (?, ?, ?, ?, 'cash', ?, ?, ?, 'pending')`,
    ).run(id, code, total, itemCount, cashierId, now, now);

    const insItem = db.prepare(
      `INSERT INTO transaction_items
         (id, transaction_id, product_id, barcode, product_name, price, qty, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const decStock = db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?');
    for (const r of resolved) {
      insItem.run(
        uuid(),
        id,
        r.product.id,
        r.product.barcode,
        r.product.name,
        r.product.price,
        r.qty,
        r.product.price * r.qty,
      );
      decStock.run(r.qty, now, r.product.id);
    }

    recomputeDailySummary(db, date);

    let cashierName: string | null = null;
    let cashierClass: string | null = null;
    if (cashierId) {
      const s = (db.prepare('SELECT name, class_name FROM students WHERE id = ?').get(cashierId) as
        | Pick<Student, 'name' | 'class_name'>
        | undefined) ?? null;
      if (s) {
        cashierName = s.name;
        cashierClass = s.class_name;
      }
    }

    return {
      id,
      code,
      total,
      item_count: itemCount,
      sold_at: now,
      cashier_name: cashierName,
      cashier_class: cashierClass,
    };
  });

  return run();
}
