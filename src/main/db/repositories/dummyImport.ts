// Import data dummy/demo (v1.0.2) — MERGE: duplikat dilewati, data asli tidak diubah.
// - Produk: skip bila barcode sudah ada; siswa: skip bila NISN sudah ada.
// - Absensi: skip bila (siswa, tanggal) sudah tercatat.
// - Transaksi: skip bila ID sudah ada (aman diimpor 2x); TIDAK mengurangi stok (riwayat demo).
// - Semua dummy ditandai 'synced' agar tidak mendorong ratusan baris demo ke Sheets.
// - Ringkasan harian dihitung ulang untuk tanggal terdampak.
// Satu transaksi DB — error di tengah = rollback total.
import type { DB } from '../database';
import type { DummyBundle, DummyImportCounts } from '@shared/dummyData';
import { uuid } from '../../util/uuid';
import { toIsoLocal } from '../../util/time';
import { recomputeDailySummary } from './summaries';

class ImportError extends Error {}

function asArray<T>(v: unknown, field: string): T[] {
  if (!Array.isArray(v)) throw new ImportError(`Field "${field}" harus berupa array.`);
  return v as T[];
}

/** Validasi struktur minimal — lempar pesan Indonesia yang jelas bila rusak. */
export function validateBundle(raw: unknown): DummyBundle {
  const b = raw as DummyBundle;
  if (!b || typeof b !== 'object') throw new ImportError('File bukan objek JSON yang valid.');
  if (b.format !== 'greenmart-dummy') {
    throw new ImportError('File bukan data demo GreenMart (field "format" ≠ "greenmart-dummy").');
  }
  if (b.version !== 1) throw new ImportError(`Versi format ${String(b.version)} tidak didukung.`);
  asArray(b.categories ?? [], 'categories');
  asArray(b.products ?? [], 'products');
  asArray(b.students ?? [], 'students');
  asArray(b.attendance ?? [], 'attendance');
  asArray(b.transactions ?? [], 'transactions');
  asArray(b.opnames ?? [], 'opnames');
  for (const p of b.products) {
    if (!p.barcode || !p.name || !Number.isInteger(p.price) || p.price < 0 || !Number.isInteger(p.stock)) {
      throw new ImportError('Ada produk dengan data tidak lengkap (barcode/nama/harga/stok).');
    }
  }
  for (const s of b.students) {
    if (!s.nisn || !s.name || !s.class_name || (s.gender !== 'L' && s.gender !== 'P')) {
      throw new ImportError('Ada siswa dengan data tidak lengkap.');
    }
  }
  return b;
}

/** Offset zona waktu mesin, mis. '+07:00'. */
function tzOffset(): string {
  return toIsoLocal().match(/([+-]\d{2}:\d{2})$/)?.[1] ?? '+00:00';
}

function soldAt(date: string, time: string): string {
  return `${date}T${time}:00${tzOffset()}`;
}

export function importDummyBundle(db: DB, raw: unknown): DummyImportCounts {
  const bundle = validateBundle(raw);
  const counts: DummyImportCounts = {
    products: 0, students: 0, attendance: 0, transactions: 0, items: 0, opnames: 0, days: 0,
  };

  const run = db.transaction((): void => {
    // ---------- Kategori: cocokkan by nama, buat bila belum ada ----------
    const catId = new Map<string, string>();
    const findCat = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE');
    const insCat = db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)');
    const now = toIsoLocal();
    for (const name of bundle.categories) {
      const found = findCat.get(name) as { id: string } | undefined;
      if (found) catId.set(name.toLowerCase(), found.id);
      else {
        const id = uuid();
        insCat.run(id, name, now);
        catId.set(name.toLowerCase(), id);
      }
    }
    const catOf = (name: string): string | null => catId.get((name ?? '').toLowerCase()) ?? null;

    // ---------- Produk: skip bila barcode sudah ada ----------
    const insProd = db.prepare(
      `INSERT INTO products (id, barcode, name, price, stock, min_stock, is_active, created_at, updated_at, category_id)
       VALUES (?, ?, ?, ?, ?, 5, 1, ?, ?, ?)`,
    );
    const prodIdByBarcode = new Map<string, string>();
    const getProd = db.prepare('SELECT id FROM products WHERE barcode = ?');
    for (const p of bundle.products) {
      const existing = getProd.get(p.barcode) as { id: string } | undefined;
      if (existing) {
        prodIdByBarcode.set(p.barcode, existing.id);
        continue;
      }
      const id = uuid();
      insProd.run(id, p.barcode, p.name, p.price, p.stock, now, now, catOf(p.category));
      prodIdByBarcode.set(p.barcode, id);
      counts.products++;
    }

    // ---------- Siswa: skip bila NISN sudah ada ----------
    const insSiswa = db.prepare(
      `INSERT INTO students (id, class_name, nis, nisn, name, gender, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    const siswaIdByNisn = new Map<string, string>();
    for (const s of bundle.students) {
      const existing = db.prepare('SELECT id FROM students WHERE nisn = ?').get(s.nisn) as
        | { id: string }
        | undefined;
      if (existing) {
        siswaIdByNisn.set(s.nisn, existing.id);
        continue;
      }
      const id = uuid();
      insSiswa.run(id, s.class_name, s.nis ?? '', s.nisn, s.name, s.gender, now, now);
      siswaIdByNisn.set(s.nisn, id);
      counts.students++;
    }

    // ---------- Absensi: skip bila (siswa, tanggal) sudah tercatat ----------
    const insAbs = db.prepare(
      'INSERT INTO attendances (id, student_id, scanned_at, local_date) VALUES (?, ?, ?, ?)',
    );
    const hasAbs = db.prepare(
      'SELECT 1 FROM attendances WHERE student_id = ? AND local_date = ? LIMIT 1',
    );
    for (const a of bundle.attendance) {
      const sid = siswaIdByNisn.get(a.nisn);
      if (!sid) throw new ImportError(`Absensi merujuk NISN yang tidak dikenal: ${a.nisn}`);
      if (hasAbs.get(sid, a.date)) continue;
      insAbs.run(uuid(), sid, soldAt(a.date, a.time), a.date);
      counts.attendance++;
    }

    // Nama petugas kasir per tanggal (absen pertama hari itu) — untuk cashier_student_id.
    const firstAttendee = db.prepare(
      `SELECT student_id FROM attendances WHERE local_date = ? ORDER BY scanned_at ASC LIMIT 1`,
    );

    // ---------- Transaksi + item: dedup by ID, stok TIDAK dikurangi ----------
    const insTrx = db.prepare(
      `INSERT INTO transactions
         (id, code, total, item_count, payment_method, cashier_student_id, sold_at, created_at,
          sync_status, synced_at, retry_count)
       VALUES (?, ?, ?, ?, 'cash', ?, ?, ?, 'synced', ?, 0)`,
    );
    const insItem = db.prepare(
      `INSERT INTO transaction_items (id, transaction_id, product_id, barcode, product_name, price, qty, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const getProdFull = db.prepare('SELECT * FROM products WHERE barcode = ?');
    const trxExists = db.prepare('SELECT 1 FROM transactions WHERE id = ?');
    const codeExists = db.prepare('SELECT 1 FROM transactions WHERE code = ?');
    const seqForDate = new Map<string, number>();
    const touchedDates = new Set<string>();

    // Urutkan kronologis agar nomor urut kode masuk akal.
    const txs = [...bundle.transactions].sort(
      (a, b) => (a.date + a.time).localeCompare(b.date + b.time),
    );
    for (const t of txs) {
      if (trxExists.get(t.id)) continue;
      if (!t.items?.length) throw new ImportError(`Transaksi ${t.id} tanpa item.`);
      // Snapshot produk + validasi barcode
      const lines = t.items.map((it) => {
        const p = getProdFull.get(it.barcode) as
          | { id: string; barcode: string; name: string; price: number }
          | undefined;
        if (!p) throw new ImportError(`Transaksi memakai barcode yang tidak dikenal: ${it.barcode}`);
        if (!Number.isInteger(it.qty) || it.qty < 1) {
          throw new ImportError(`Qty tidak valid untuk barcode ${it.barcode}.`);
        }
        return { product: p, qty: it.qty, subtotal: p.price * it.qty };
      });
      const total = lines.reduce((s, l) => s + l.subtotal, 0);
      const itemCount = lines.reduce((s, l) => s + l.qty, 0);

      // Kode TRX-YYYYMMDD-NNNN (urut per hari; hindari bentrok dgn kode existing).
      let seq = (seqForDate.get(t.date) ?? 0) + 1;
      seqForDate.set(t.date, seq);
      let code = `TRX-${t.date.replaceAll('-', '')}-${String(seq).padStart(4, '0')}`;
      while (codeExists.get(code)) {
        seq++;
        seqForDate.set(t.date, seq);
        code = `TRX-${t.date.replaceAll('-', '')}-${String(seq).padStart(4, '0')}`;
      }

      const cashier = (firstAttendee.get(t.date) as { student_id: string } | undefined)?.student_id ?? null;
      const at = soldAt(t.date, t.time);
      insTrx.run(t.id, code, total, itemCount, cashier, at, now, now);
      for (const l of lines) {
        insItem.run(uuid(), t.id, l.product.id, l.product.barcode, l.product.name, l.product.price, l.qty, l.subtotal);
      }
      counts.transactions++;
      counts.items += lines.length;
      touchedDates.add(t.date);
    }

    // ---------- Ringkasan harian tanggal terdampak ----------
    for (const date of touchedDates) {
      recomputeDailySummary(db, date);
      // Tandai synced HANYA bila semua transaksi tanggal itu sudah synced
      // (jangan menenggelamkan transaksi nyata yang masih pending).
      const pending = db
        .prepare("SELECT COUNT(*) AS c FROM transactions WHERE substr(sold_at, 1, 10) = ? AND sync_status != 'synced'")
        .get(date) as { c: number };
      if (pending.c === 0) {
        db.prepare(
          "UPDATE daily_summaries SET sync_status = 'synced', synced_at = ?, sync_error = NULL, retry_count = 0 WHERE local_date = ?",
        ).run(now, date);
      }
    }

    // ---------- Opname: dedup by (tanggal, fase) ----------
    const opnameExists = db.prepare(
      'SELECT 1 FROM stock_opnames WHERE local_date = ? AND phase = ? LIMIT 1',
    );
    const insOpname = db.prepare(
      `INSERT INTO stock_opnames (id, local_date, phase, petugas, status, created_at, confirmed_at, synced_at)
       VALUES (?, ?, ?, ?, 'done', ?, ?, ?)`,
    );
    const insOpItem = db.prepare(
      `INSERT INTO stock_opname_items
         (id, opname_id, product_id, barcode, product_name, price, system_stock, physical_stock, diff_qty, diff_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const o of bundle.opnames ?? []) {
      if (opnameExists.get(o.date, o.phase)) continue;
      if (!o.items?.length) throw new ImportError(`Opname ${o.date} tanpa item.`);
      const id = uuid();
      const at = soldAt(o.date, '08:00');
      insOpname.run(id, o.date, o.phase, o.petugas ?? null, at, at, now);
      for (const it of o.items) {
        const p = getProdFull.get(it.barcode) as
          | { id: string; barcode: string; name: string; price: number }
          | undefined;
        if (!p) throw new ImportError(`Opname memakai barcode yang tidak dikenal: ${it.barcode}`);
        const diff = it.system - it.physical;
        insOpItem.run(uuid(), id, p.id, p.barcode, p.name, p.price, it.system, it.physical, diff, diff * p.price);
      }
      counts.opnames++;
    }

    if (counts.days === 0) counts.days = touchedDates.size;

    // Rekap harian (Sheets) tidak perlu mendorong seluruh riwayat demo:
    // window sinkron dipangkatkan ke kemarin.
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('report_sync_from', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(daysAgoStr());
  });

  run();
  return counts;
}

function daysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
