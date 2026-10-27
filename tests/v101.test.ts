// Test repositori stok opname + laporan + rekap absensi (v1.0.1).
import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { DB } from '../src/main/db/database';
import { applySchema } from '../src/main/db/database';
import {
  confirmOpname,
  fillRemainingWithSystem,
  getLastDone,
  listOpnames,
  setPhysical,
  startOpname,
  unsyncedDone,
  markSynced,
} from '../src/main/db/repositories/opname';
import { buildReportCsv, salesByItem } from '../src/main/db/repositories/reports';
import { recapByMonth } from '../src/main/db/repositories/attendance';
import { createProduct } from '../src/main/db/repositories/products';
import { insertStudents } from '../src/main/db/repositories/students';
import { createTransaction } from '../src/main/db/repositories/transactions';
import { recordAttendance } from '../src/main/db/repositories/attendance';

function openDb(): DB {
  const db = new Database(':memory:') as unknown as DB;
  applySchema(db);
  return db;
}

describe('opname repo', () => {
  let db: DB;
  beforeEach(() => {
    db = openDb();
    createProduct(db, { barcode: 'B1', name: 'Chiki', price: 5000, stock: 20, is_active: true, category_id: null });
    createProduct(db, { barcode: 'B2', name: 'Aqua', price: 3000, stock: 10, is_active: true, category_id: null });
  });

  it('startOpname snapshot semua produk aktif dgn stok sistem', () => {
    const d = startOpname(db, 'awal', 'Sinta, Rina');
    expect(d.status).toBe('draft');
    expect(d.total_count).toBe(2);
    expect(d.items.map((i) => i.system_stock).sort((a, b) => a - b)).toEqual([10, 20]);
    expect(d.petugas).toBe('Sinta, Rina');
    // Idempoten: panggil lagi → draft yang sama
    const again = startOpname(db, 'awal', null);
    expect(again.id).toBe(d.id);
  });

  it('setPhysical menghitung selisih; confirm wajib semua terisi; stok sistem TIDAK berubah', () => {
    const d = startOpname(db, 'akhir', null);
    const chiki = d.items.find((i) => i.barcode === 'B1')!;
    // Stok sistem 20, fisik 18 → selisih +2, nilai 2*5000 = 10000
    const updated = setPhysical(db, chiki.id, 18);
    expect(updated.diff_qty).toBe(2);
    expect(updated.diff_value).toBe(10_000);
    // Konfirmasi ditolak saat ada yang kosong
    expect(() => confirmOpname(db, d.id)).toThrow(/belum diisi/i);
    // Fill remaining → semua terisi 0 selisih
    const n = fillRemainingWithSystem(db, d.id);
    expect(n).toBe(1);
    const done = confirmOpname(db, d.id);
    expect(done.status).toBe('done');
    expect(done.filled_count).toBe(2);
    // Stok sistem tetap 20/10 — opname hanya mencatat
    const stocks = db.prepare('SELECT barcode, stock FROM products ORDER BY barcode').all() as {
      barcode: string;
      stock: number;
    }[];
    expect(stocks.find((s) => s.barcode === 'B1')?.stock).toBe(20);
    expect(stocks.find((s) => s.barcode === 'B2')?.stock).toBe(10);
  });

  it('physical 0 valid; qty negatif ditolak; setelah done tidak bisa diubah', () => {
    const d = startOpname(db, 'awal', null);
    const item = d.items[0];
    const z = setPhysical(db, item.id, 0);
    expect(z.physical_stock).toBe(0);
    expect(z.diff_qty).toBe(item.system_stock);
    expect(() => setPhysical(db, item.id, -3)).toThrow(/>= 0/);
    fillRemainingWithSystem(db, d.id); // item kedua (belum diisi) = stok sistem
    confirmOpname(db, d.id);
    expect(() => setPhysical(db, item.id, 5)).toThrow(/sudah dikonfirmasi/i);
  });

  it('getLastDone → opname done terakhir; listOpnames ringkas', () => {
    const d = startOpname(db, 'awal', 'Sinta');
    fillRemainingWithSystem(db, d.id);
    confirmOpname(db, d.id);
    expect(getLastDone(db)).toEqual({ date: d.local_date, phase: 'awal' });
    const list = listOpnames(db);
    expect(list).toHaveLength(1);
    expect(list[0].diff_value_total).toBe(0);
  });

  it('unsyncedDone + markSynced self-heal', () => {
    const d = startOpname(db, 'awal', null);
    fillRemainingWithSystem(db, d.id);
    confirmOpname(db, d.id);
    expect(unsyncedDone(db)).toHaveLength(1);
    markSynced(db, [d.id]);
    expect(unsyncedDone(db)).toHaveLength(0);
    // markSynced dengan array kosong tidak error
    expect(() => markSynced(db, [])).not.toThrow();
  });
});

describe('laporan & CSV', () => {
  let db: DB;
  beforeEach(() => {
    db = openDb();
    insertStudents(db, [{ className: 'X', nis: '1', nisn: '1234567890', name: 'Sinta', gender: 'P' }]);
    const s = db.prepare('SELECT id FROM students LIMIT 1').get() as { id: string };
    recordAttendance(db, s.id);
    createProduct(db, { barcode: 'B1', name: 'Chiki', price: 5000, stock: 20, is_active: true, category_id: null });
    createProduct(db, { barcode: 'B2', name: 'Aqua', price: 3000, stock: 20, is_active: true, category_id: null });
  });

  it('salesByItem agregasi qty & omzet', () => {
    const today = new Date();
    const p = (n: number): string => String(n).padStart(2, '0');
    const dateStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
    // transaksi hari ini: 2x Chiki + 1x Aqua = 10000 + 3000
    createTransaction(db, [
      { barcode: 'B1', qty: 2 },
      { barcode: 'B2', qty: 1 },
    ]);
    const rows = salesByItem(db, dateStr, dateStr);
    expect(rows).toHaveLength(2);
    const chiki = rows.find((r) => r.barcode === 'B1')!;
    expect(chiki.qty).toBe(2);
    expect(chiki.revenue).toBe(10_000);
    const aqua = rows.find((r) => r.barcode === 'B2')!;
    expect(aqua.revenue).toBe(3_000);
    // Rentang kosong → kosong
    expect(salesByItem(db, '2000-01-01', '2000-01-02')).toHaveLength(0);
  });

  it('buildReportCsv: BOM, titik-koma, baris TOTAL', () => {
    const rows = [
      { barcode: 'B1', product_name: 'Chiki', category_name: 'Makanan', qty: 2, revenue: 10000 },
      { barcode: 'B2', product_name: 'Aqua', category_name: null, qty: 1, revenue: 3000 },
    ];
    const csv = buildReportCsv(rows, ['Laporan Harian', 'Periode: 2026-01-01']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Laporan Harian');
    expect(lines[1]).toBe('Periode: 2026-01-01');
    expect(lines[2]).toBe(''); // baris kosong pemisah header
    expect(lines[3]).toBe('Barcode;Nama Produk;Kategori;Qty;Omzet');
    expect(lines[4]).toBe('B1;Chiki;Makanan;2;10000');
    expect(lines[5]).toBe('B2;Aqua;-;1;3000');
    expect(lines[6]).toBe('TOTAL;;;3;13000');
  });
});

describe('recapByMonth', () => {
  it('rekap per siswa: jumlah hari, tanggal, rata-rata jam', () => {
    const db = openDb();
    insertStudents(db, [
      { className: 'X', nis: '1', nisn: '111', name: 'Sinta', gender: 'P' },
      { className: 'X', nis: '2', nisn: '222', name: 'Rina', gender: 'P' },
    ]);
    const ids = (db.prepare('SELECT id, name FROM students ORDER BY name').all() as {
      id: string;
      name: string;
    }[]);
    const sinta = ids.find((s) => s.name === 'Sinta')!;
    const rina = ids.find((s) => s.name === 'Rina')!;
    // Sinta absen 2 hari (07:30 dan 08:00), Rina 1 hari (07:00)
    db.exec(`
      INSERT INTO attendances (id, student_id, local_date, scanned_at) VALUES
        ('a1', '${sinta.id}', '2026-01-05', '2026-01-05T07:30:00+07:00'),
        ('a2', '${sinta.id}', '2026-01-05', '2026-01-05T15:00:00+07:00'),
        ('a3', '${sinta.id}', '2026-01-06', '2026-01-06T08:00:00+07:00'),
        ('a4', '${rina.id}', '2026-01-05', '2026-01-05T07:00:00+07:00');
    `);
    const recap = recapByMonth(db, '2026-01');
    expect(recap).toHaveLength(2);
    const sintaRecap = recap.find((r) => r.name === 'Sinta')!;
    expect(sintaRecap.days_count).toBe(2);
    expect(sintaRecap.dates).toEqual(['2026-01-05', '2026-01-06']);
    expect(sintaRecap.avg_first_time).toBe('07:45');
    const rinaRecap = recap.find((r) => r.name === 'Rina')!;
    expect(rinaRecap.days_count).toBe(1);
    expect(rinaRecap.avg_first_time).toBe('07:00');
    // Bulan lain → kosong
    expect(recapByMonth(db, '2026-02')).toHaveLength(0);
  });
});
