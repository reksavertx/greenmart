// Test importer data dummy/demo (v1.0.2) — merge (skip duplikat), kode TRX tanpa bentrok,
// rollback total saat error, summary recompute + tandai synced kondisional, stok tak berkurang.
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type DB } from '../src/main/db/database';
import { createProduct } from '../src/main/db/repositories/products';
import { importDummyBundle, validateBundle } from '../src/main/db/repositories/dummyImport';
import type { DummyBundle } from '../src/shared/dummyData';

let db: DB;

beforeEach(() => {
  db = new Database(':memory:');
  applySchema(db);
});

const AQUA = '8992761110017';
const CHIKI = '8998866200011';
const NISN_AIDA = '0061234501';
const NISN_BAYU = '0061234502';
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';

function makeBundle(): DummyBundle {
  return {
    format: 'greenmart-dummy',
    version: 1,
    generated_at: '2026-10-28T08:00:00.000Z',
    window: { start: '2026-10-15', end: '2026-10-28' },
    holidays: [{ date: '2026-10-17', name: 'Libur Contoh' }],
    categories: ['Makanan', 'Minuman'],
    products: [
      { barcode: AQUA, name: 'Aqua Botol 600ml', price: 3000, stock: 100, category: 'Minuman' },
      { barcode: CHIKI, name: 'Chiki Jagung', price: 2500, stock: 80, category: 'Makanan' },
    ],
    students: [
      { class_name: 'XI TKJ 1', nis: '2601', nisn: NISN_AIDA, name: 'AIDA ZULFA KHASNA', gender: 'P' },
      { class_name: 'XI TKJ 1', nis: '2602', nisn: NISN_BAYU, name: 'BAYU SETIAWAN', gender: 'L' },
    ],
    // Bayu absen duluan (06:45) — harus jadi kasir transaksi tanggal 2026-10-20.
    attendance: [
      { nisn: NISN_BAYU, date: '2026-10-20', time: '06:45' },
      { nisn: NISN_AIDA, date: '2026-10-20', time: '06:50' },
    ],
    transactions: [
      {
        id: ID1,
        date: '2026-10-20',
        time: '07:10',
        items: [
          { barcode: AQUA, qty: 2 },
          { barcode: CHIKI, qty: 1 },
        ],
      },
      { id: ID2, date: '2026-10-20', time: '12:30', items: [{ barcode: CHIKI, qty: 2 }] },
      { id: ID3, date: '2026-10-21', time: '09:40', items: [{ barcode: AQUA, qty: 1 }] },
    ],
    opnames: [
      {
        date: '2026-10-21',
        phase: 'akhir',
        petugas: 'BAYU SETIAWAN',
        items: [
          { barcode: AQUA, system: 97, physical: 95 },
          { barcode: CHIKI, system: 77, physical: 77 },
        ],
      },
    ],
  };
}

function n(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

function setting(key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)
    ?.value;
}

function yesterdayLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (x: number): string => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe('validateBundle', () => {
  it('menerima bundle valid dan mengembalikannya', () => {
    const b = makeBundle();
    expect(validateBundle(b).format).toBe('greenmart-dummy');
  });

  it('menolak format/version yang salah dengan pesan jelas', () => {
    const b = makeBundle() as unknown as Record<string, unknown>;
    expect(() => validateBundle({ ...b, format: 'bukan-demo' })).toThrow(/greenmart-dummy/);
    expect(() => validateBundle({ ...b, version: 2 })).toThrow(/Versi/);
  });

  it('menolak produk/siswa dengan data tidak lengkap', () => {
    const b1 = makeBundle();
    b1.products[0].price = -1;
    expect(() => validateBundle(b1)).toThrow(/produk/i);

    const b2 = makeBundle();
    b2.students[0].gender = 'X' as never;
    expect(() => validateBundle(b2)).toThrow(/siswa/i);
  });
});

describe('importDummyBundle — import pertama', () => {
  it('memasukkan semua data, kode TRX urut per hari, stok TIDAK berkurang', () => {
    const counts = importDummyBundle(db, makeBundle());

    expect(counts).toEqual({
      products: 2,
      students: 2,
      attendance: 2,
      transactions: 3,
      items: 4,
      opnames: 1,
      days: 2,
    });

    // Produk masuk dengan stok sesuai bundle (riwayat demo tidak mengurangi stok).
    const aqua = db.prepare('SELECT * FROM products WHERE barcode = ?').get(AQUA) as {
      stock: number;
      category_id: string | null;
    };
    expect(aqua.stock).toBe(100);
    expect(aqua.category_id).not.toBeNull();
    expect(n('products')).toBe(2);
    // 'Makanan' & 'Minuman' sudah ada sebagai kategori default seed → tidak ada kategori baru.
    expect(n('categories')).toBe(4);

    // NISN leading zero tersimpan utuh sebagai TEXT.
    const aida = db.prepare('SELECT nisn FROM students WHERE nisn = ?').get(NISN_AIDA);
    expect(aida).toBeDefined();

    // Kode urut per hari, total/item_count benar, status synced.
    const rows = db
      .prepare('SELECT id, code, total, item_count, payment_method, sync_status FROM transactions ORDER BY code')
      .all() as unknown as { id: string; code: string; total: number; item_count: number; payment_method: string; sync_status: string }[];
    expect(rows.map((r) => r.code)).toEqual([
      'TRX-20261020-0001',
      'TRX-20261020-0002',
      'TRX-20261021-0001',
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(ID1)).toMatchObject({ total: 3000 * 2 + 2500, item_count: 3, payment_method: 'cash', sync_status: 'synced' });
    expect(byId.get(ID2)).toMatchObject({ total: 5000, item_count: 2 });
    expect(byId.get(ID3)).toMatchObject({ total: 3000, item_count: 1 });

    // Kasir = absen pertama hari itu (Bayu 06:45 < Aida 06:50); tanggal tanpa absen → NULL.
    const cash20 = db
      .prepare('SELECT s.name FROM transactions t JOIN students s ON s.id = t.cashier_student_id WHERE t.id = ?')
      .get(ID1) as { name: string };
    expect(cash20.name).toBe('BAYU SETIAWAN');
    const cash21 = (db.prepare('SELECT cashier_student_id FROM transactions WHERE id = ?').get(ID3) as {
      cashier_student_id: string | null;
    }).cashier_student_id;
    expect(cash21).toBeNull();

    // Summary harian di-recompute lalu ditandai synced (semua transaksi tanggal itu synced).
    const s20 = db.prepare('SELECT * FROM daily_summaries WHERE local_date = ?').get('2026-10-20') as {
      revenue: number;
      transaction_count: number;
      items_sold: number;
      sync_status: string;
    };
    expect(s20).toMatchObject({ revenue: 13500, transaction_count: 2, items_sold: 5, sync_status: 'synced' });
    const s21 = db.prepare('SELECT sync_status FROM daily_summaries WHERE local_date = ?').get('2026-10-21') as {
      sync_status: string;
    };
    expect(s21.sync_status).toBe('synced');

    // Window sinkron Sheets dipangkatkan ke kemarin.
    expect(setting('report_sync_from')).toBe(yesterdayLocal());

    // Opname masuk sebagai 'done' dengan diff benar (system - physical).
    const op = db.prepare('SELECT * FROM stock_opnames WHERE local_date = ? AND phase = ?').get('2026-10-21', 'akhir') as {
      status: string;
      petugas: string;
    };
    expect(op.status).toBe('done');
    expect(op.petugas).toBe('BAYU SETIAWAN');
    const items = db
      .prepare('SELECT barcode, diff_qty, diff_value FROM stock_opname_items ORDER BY barcode')
      .all() as unknown as { barcode: string; diff_qty: number; diff_value: number }[];
    expect(items).toEqual([
      { barcode: AQUA, diff_qty: 2, diff_value: 6000 },
      { barcode: CHIKI, diff_qty: 0, diff_value: 0 },
    ]);
  });
});

describe('importDummyBundle — merge & dedup', () => {
  it('produk/siswa existing dilewati, data asli tidak tertimpa', () => {
    createProduct(db, {
      barcode: AQUA,
      name: 'Aqua LOKAL (asli)',
      price: 3000,
      stock: 7,
      is_active: true,
      category_id: null,
    });
    db.prepare(
      'INSERT INTO students (id, class_name, nis, nisn, name, gender, is_active, created_at, updated_at)' +
        " VALUES ('s-asli', 'X RPL', '9999', ?, 'SISWA ASLI', 'P', 1, '2026-01-01', '2026-01-01')",
    ).run(NISN_AIDA);

    const counts = importDummyBundle(db, makeBundle());
    expect(counts.products).toBe(1); // hanya Chiki
    expect(counts.students).toBe(1); // hanya Bayu

    // Data asli utuh.
    const p = db.prepare('SELECT name, stock FROM products WHERE barcode = ?').get(AQUA) as {
      name: string;
      stock: number;
    };
    expect(p).toEqual({ name: 'Aqua LOKAL (asli)', stock: 7 });
    const s = db.prepare('SELECT name FROM students WHERE nisn = ?').get(NISN_AIDA) as { name: string };
    expect(s.name).toBe('SISWA ASLI');

    // Transaksi tetap masuk (produk existing dipakai untuk item).
    expect(counts.transactions).toBe(3);
    expect(n('transactions')).toBe(3);
  });

  it('kode transaksi baru tidak bentrok dengan kode existing (loop pencarian seq)', () => {
    // Transaksi nyata pending di tanggal yang sama sudah memakai -0001 dan -0002.
    db.prepare(
      `INSERT INTO transactions (id, code, total, item_count, payment_method, sold_at, created_at, sync_status)
       VALUES ('asli-1', 'TRX-20261020-0001', 9999, 1, 'cash', '2026-10-20T09:00:00+07:00', '2026-10-20T09:00:00+07:00', 'pending')`,
    ).run();

    const counts = importDummyBundle(db, makeBundle());
    expect(counts.transactions).toBe(3);

    const codes = (
      db.prepare("SELECT code FROM transactions WHERE id LIKE '1111%' OR id LIKE '2222%' OR id LIKE '3333%' ORDER BY code").all() as unknown as {
        code: string;
      }[]
    ).map((r) => r.code);
    expect(codes).toEqual(['TRX-20261020-0002', 'TRX-20261020-0003', 'TRX-20261021-0001']);
  });

  it('summary tanggal dengan transaksi nyata PENDING tetap pending; tanggal lain synced', () => {
    db.prepare(
      `INSERT INTO transactions (id, code, total, item_count, payment_method, sold_at, created_at, sync_status)
       VALUES ('asli-1', 'TRX-20261020-0001', 9999, 1, 'cash', '2026-10-20T09:00:00+07:00', '2026-10-20T09:00:00+07:00', 'pending')`,
    ).run();

    importDummyBundle(db, makeBundle());

    const s20 = db.prepare('SELECT revenue, sync_status FROM daily_summaries WHERE local_date = ?').get('2026-10-20') as {
      revenue: number;
      sync_status: string;
    };
    // Revenue termasuk transaksi nyata (9999) + dummy (8500 + 5000), tapi status mengikuti pending nyata.
    expect(s20.revenue).toBe(23499);
    expect(s20.sync_status).toBe('pending');

    const s21 = db.prepare('SELECT sync_status FROM daily_summaries WHERE local_date = ?').get('2026-10-21') as {
      sync_status: string;
    };
    expect(s21.sync_status).toBe('synced');
  });

  it('import dua kali idempoten — duplikat semua dilewati', () => {
    const first = importDummyBundle(db, makeBundle());
    expect(first.transactions).toBe(3);

    const second = importDummyBundle(db, makeBundle());
    expect(second).toEqual({
      products: 0,
      students: 0,
      attendance: 0,
      transactions: 0,
      items: 0,
      opnames: 0,
      days: 0,
    });

    expect(n('products')).toBe(2);
    expect(n('students')).toBe(2);
    expect(n('attendances')).toBe(2);
    expect(n('transactions')).toBe(3);
    expect(n('transaction_items')).toBe(4);
    expect(n('stock_opnames')).toBe(1);

    // Summary tetap benar (tidah dobel).
    const s20 = db.prepare('SELECT revenue FROM daily_summaries WHERE local_date = ?').get('2026-10-20') as {
      revenue: number;
    };
    expect(s20.revenue).toBe(13500);
  });
});

describe('importDummyBundle — rollback & error', () => {
  it('barcode tak dikenal di transaksi → gagal + rollback total (tidak ada data masuk)', () => {
    const b = makeBundle();
    b.transactions[0].items[0].barcode = 'BARCODE-HANTU';
    // Kategori baru di bundle harus ikut ter-rollback bila error terjadi.
    b.categories = [...b.categories, 'KategoriHantu'];
    expect(() => importDummyBundle(db, b)).toThrow(/tidak dikenal/);

    expect(n('products')).toBe(0);
    expect(n('categories')).toBe(4); // hanya kategori default seed — 'KategoriHantu' tak tersisa
    expect(n('students')).toBe(0);
    expect(n('attendances')).toBe(0);
    expect(n('transactions')).toBe(0);
    expect(n('transaction_items')).toBe(0);
    expect(n('stock_opnames')).toBe(0);
    expect(setting('report_sync_from')).toBeUndefined();
  });

  it('absensi merujuk NISN tak dikenal → gagal + rollback', () => {
    const b = makeBundle();
    b.attendance[0].nisn = '0099999999';
    expect(() => importDummyBundle(db, b)).toThrow(/NISN/);
    expect(n('students')).toBe(0);
    expect(n('attendances')).toBe(0);
  });

  it('opname memakai barcode tak dikenal → gagal + rollback', () => {
    const b = makeBundle();
    b.opnames[0].items[0].barcode = 'TIDAK-ADA';
    expect(() => importDummyBundle(db, b)).toThrow(/tidak dikenal/);
    expect(n('products')).toBe(0);
    expect(n('stock_opnames')).toBe(0);
  });
});
