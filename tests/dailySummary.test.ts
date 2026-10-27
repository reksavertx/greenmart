// Test aturan penulisan transaksi + recompute daily_summaries (PRD §6, AC5).
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type DB } from '../src/main/db/database';
import { createProduct } from '../src/main/db/repositories/products';
import { createTransaction } from '../src/main/db/repositories/transactions';
import { recomputeDailySummary, getDailySummary } from '../src/main/db/repositories/summaries';
import { insertStudents, getStudentByNisn } from '../src/main/db/repositories/students';

let db: DB;

beforeEach(() => {
  db = new Database(':memory:');
  applySchema(db);
});

function seed(): { chikiId: string; aquaId: string; cashierId: string } {
  const chiki = createProduct(db, {
    barcode: '8998866200011',
    name: 'Chiki Jagung',
    price: 5000,
    stock: 20,
    min_stock: 5,
    is_active: true,
  });
  const aqua = createProduct(db, {
    barcode: '8992761110017',
    name: 'Aqua 600ml',
    price: 3000,
    stock: 48,
    min_stock: 5,
    is_active: true,
  });
  insertStudents(db, [
    { className: 'XIPM', nis: '12777', nisn: '0103133511', name: 'AIDA ZULFA KHASNA', gender: 'P' },
  ]);
  const cashier = getStudentByNisn(db, '0103133511');
  return { chikiId: chiki.id, aquaId: aqua.id, cashierId: cashier!.id };
}

describe('createTransaction', () => {
  it('AC5: menyimpan transaksi + item + stok berkurang + summary terupdate', () => {
    const { cashierId } = seed();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_cashier_student_id', ?)").run(cashierId);

    const res = createTransaction(db, [
      { barcode: '8998866200011', qty: 2 },
      { barcode: '8992761110017', qty: 1 },
    ]);

    expect(res.total).toBe(5000 * 2 + 3000);
    expect(res.item_count).toBe(3);
    expect(res.code).toMatch(/^TRX-\d{8}-0001$/);
    expect(res.cashier_name).toBe('AIDA ZULFA KHASNA');

    const chiki = db.prepare('SELECT stock FROM products WHERE barcode = ?').get('8998866200011') as { stock: number };
    const aqua = db.prepare('SELECT stock FROM products WHERE barcode = ?').get('8992761110017') as { stock: number };
    expect(chiki.stock).toBe(18);
    expect(aqua.stock).toBe(47);

    const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(res.id) as unknown as {
      qty: number;
      subtotal: number;
      product_name: string;
    }[];
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.qty).sort()).toEqual([1, 2]);

    const s = getDailySummary(db, res.sold_at.slice(0, 10));
    expect(s.revenue).toBe(13000);
    expect(s.transaction_count).toBe(1);
    expect(s.items_sold).toBe(3);

    const row = db.prepare('SELECT sync_status FROM daily_summaries WHERE local_date = ?').get(res.sold_at.slice(0, 10)) as {
      sync_status: string;
    };
    expect(row.sync_status).toBe('pending');
  });

  it('kode transaksi urut per hari (TRX-YYYYMMDD-NNNN)', () => {
    seed();
    const r1 = createTransaction(db, [{ barcode: '8998866200011', qty: 1 }]);
    const r2 = createTransaction(db, [{ barcode: '8998866200011', qty: 1 }]);
    expect(r1.code.endsWith('0001')).toBe(true);
    expect(r2.code.endsWith('0002')).toBe(true);
    expect(r1.code.slice(4, 12)).toBe(r2.code.slice(4, 12));
  });

  it('stok tidak cukup -> rollback penuh (tidak ada transaksi/item, stok utuh)', () => {
    seed();
    expect(() =>
      createTransaction(db, [
        { barcode: '8998866200011', qty: 100 },
      ]),
    ).toThrow(/tidak cukup/);
    const trxCount = (db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }).c;
    const itemCount = (db.prepare('SELECT COUNT(*) AS c FROM transaction_items').get() as { c: number }).c;
    const chiki = db.prepare('SELECT stock FROM products WHERE barcode = ?').get('8998866200011') as { stock: number };
    expect(trxCount).toBe(0);
    expect(itemCount).toBe(0);
    expect(chiki.stock).toBe(20);
  });

  it('keranjang kosong ditolak', () => {
    seed();
    expect(() => createTransaction(db, [])).toThrow(/Keranjang kosong/);
  });

  it('transaksi tanpa kasir aktif -> cashier NULL (PRD F3)', () => {
    seed();
    const res = createTransaction(db, [{ barcode: '8998866200011', qty: 1 }]);
    expect(res.cashier_name).toBeNull();
    const row = db.prepare('SELECT cashier_student_id FROM transactions WHERE id = ?').get(res.id) as {
      cashier_student_id: string | null;
    };
    expect(row.cashier_student_id).toBeNull();
  });
});

describe('recomputeDailySummary', () => {
  it('menghitung ulang dari transactions dan mereset status sync ke pending', () => {
    seed();
    const day = new Date();
    const local = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    createTransaction(db, [{ barcode: '8998866200011', qty: 1 }]);
    createTransaction(db, [
      { barcode: '8998866200011', qty: 1 },
      { barcode: '8992761110017', qty: 2 },
    ]);
    // tandai synced palsu, lalu recompute harus mereset
    db.prepare("UPDATE daily_summaries SET sync_status = 'synced', synced_at = 'x' WHERE local_date = ?").run(local);
    recomputeDailySummary(db, local);
    const s = getDailySummary(db, local);
    expect(s.revenue).toBe(5000 + 5000 + 6000);
    expect(s.transaction_count).toBe(2);
    expect(s.items_sold).toBe(4);
    const row = db.prepare('SELECT sync_status FROM daily_summaries WHERE local_date = ?').get(local) as {
      sync_status: string;
    };
    expect(row.sync_status).toBe('pending');
  });

  it('tanggal tanpa transaksi -> baris nol (recompute idempoten)', () => {
    recomputeDailySummary(db, '2001-01-01');
    const s = getDailySummary(db, '2001-01-01');
    expect(s.revenue).toBe(0);
    expect(s.transaction_count).toBe(0);
    recomputeDailySummary(db, '2001-01-01');
    const again = getDailySummary(db, '2001-01-01');
    expect(again.transaction_count).toBe(0);
  });
});
