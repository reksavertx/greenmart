// Test konsistensi file demo (v1.0.2) — memastikan demo/greenmart-dummy.json selalu valid
// untuk importer dan mengikuti aturan libur (Sabtu–Minggu + hari libur nasional).
// Skip otomatis bila file belum digenerate.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/main/db/repositories/dummyImport';

const FILE = join(__dirname, '..', 'demo', 'greenmart-dummy.json');
const hasFile = existsSync(FILE);

describe.skipIf(!hasFile)('demo/greenmart-dummy.json (hasil generator)', () => {
  const bundle = validateBundle(JSON.parse(readFileSync(FILE, 'utf8')));

  it('lolos validateBundle dengan format/versi benar', () => {
    expect(bundle.format).toBe('greenmart-dummy');
    expect(bundle.version).toBe(1);
    expect(bundle.products.length).toBeGreaterThan(0);
    expect(bundle.students.length).toBeGreaterThan(0);
  });

  const closedDays = new Set(bundle.holidays.map((h) => h.date));
  const isClosed = (date: string): boolean => {
    const d = new Date(`${date}T12:00:00`);
    return d.getDay() === 0 || d.getDay() === 6 || closedDays.has(date);
  };

  it('tidak ada transaksi/absensi/opname di Sabtu–Minggu & hari libur', () => {
    for (const t of bundle.transactions) expect(isClosed(t.date), `trx ${t.date}`).toBe(false);
    for (const a of bundle.attendance) expect(isClosed(a.date), `absen ${a.date}`).toBe(false);
    for (const o of bundle.opnames) expect(isClosed(o.date), `opname ${o.date}`).toBe(false);
  });

  it('semua NISN absensi & barcode transaksi dikenal di bundle', () => {
    const nisns = new Set(bundle.students.map((s) => s.nisn));
    const barcodes = new Set(bundle.products.map((p) => p.barcode));
    for (const a of bundle.attendance) expect(nisns.has(a.nisn), `absen nisn ${a.nisn}`).toBe(true);
    for (const t of bundle.transactions) {
      for (const it of t.items) expect(barcodes.has(it.barcode), `trx ${t.date} barcode ${it.barcode}`).toBe(true);
    }
    for (const o of bundle.opnames) {
      for (const it of o.items) expect(barcodes.has(it.barcode), `opname barcode ${it.barcode}`).toBe(true);
    }
  });

  it('ID transaksi unik + tanggal dalam window', () => {
    const ids = new Set<string>();
    for (const t of bundle.transactions) {
      expect(ids.has(t.id), `id duplikat ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(t.date >= bundle.window.start && t.date <= bundle.window.end).toBe(true);
    }
  });
});
