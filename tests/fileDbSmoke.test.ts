// Smoke test file-based DB: WAL, persist, backup harian (PRD §9, AC6) — data uji PRD §13.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type DB } from '../src/main/db/database';
import { createProduct, getProductByBarcode } from '../src/main/db/repositories/products';
import { createTransaction } from '../src/main/db/repositories/transactions';
import { recordAttendance, listAttendanceByDate } from '../src/main/db/repositories/attendance';
import { runBackup, listBackups } from '../src/main/db/backup';
import { parseStudentsCsv } from '../src/main/csv/importStudents';
import { insertStudents, getStudentByNisn } from '../src/main/db/repositories/students';

let dir: string;
let db: DB;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'greenmart-smoke-'));
  db = new Database(path.join(dir, 'kasir.db'));
  applySchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function seedPrdProducts(): void {
  createProduct(db, { barcode: '8998866200011', name: 'Chiki Jagung', price: 5000, stock: 20, is_active: true, category_id: null });
  createProduct(db, { barcode: '8992761110017', name: 'Aqua 600ml', price: 3000, stock: 48, is_active: true, category_id: null });
  createProduct(db, { barcode: 'SNACK001', name: 'Roti Bungkus Sendiri', price: 2500, stock: 5, is_active: true, category_id: null });
}

describe('file-based DB (AC6, §9)', () => {
  it('WAL aktif pada file DB dan transaksi persist di file', () => {
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');

    seedPrdProducts();
    const res = createTransaction(db, [
      { barcode: '8998866200011', qty: 2 },
      { barcode: 'SNACK001', qty: 1 },
    ]);
    expect(res.total).toBe(12500);

    // buka ulang dari file → data masih ada (persist)
    const db2 = new Database(path.join(dir, 'kasir.db'));
    const again = (db2.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }).c;
    const chiki = db2.prepare('SELECT stock FROM products WHERE barcode = ?').get('8998866200011') as { stock: number };
    db2.close();
    expect(again).toBe(1);
    expect(chiki.stock).toBe(18);
  });

  it('backup: checkpoint + salinan tercatat; 7 salinan terakhir disimpan', () => {
    seedPrdProducts();
    const backupDir = path.join(dir, 'backups');

    // buat 9 "hari" backup
    for (let i = 0; i < 9; i++) {
      const target = path.join(backupDir, `kasir-2026-01-${String(10 + i).padStart(2, '0')}.db`);
      fs.mkdirSync(backupDir, { recursive: true });
      db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(db.name, target);
    }
    // backup resmi hari ini (skip bila sudah ada) + prune ke 7
    const todayFile = path.join(backupDir, `kasir-2000-01-01.db`);
    fs.copyFileSync(db.name, todayFile);
    runBackup(db, backupDir, false); // manual backup menambah 1 file & memicu prune

    const files = listBackups(backupDir);
    expect(files.length).toBeLessThanOrEqual(7);
  });

  it('alur lengkap PRD: import CSV → absensi → kasir aktif → transaksi memakai kasir', () => {
    seedPrdProducts();
    const csv = [
      'Kelas\tNIS\tNISN\tNAMA\tJenisKelamin',
      "XIPM\t12777\t'0103133511\tAIDA ZULFA KHASNA\tP",
      "XIPM\t12778\t'0103133512\tBUDI SANTOSO\tL",
      "XIIPA1\t12801\t'0103133520\tCITRA DEWI\tP",
    ].join('\n');
    const preview = parseStudentsCsv(csv, new Set());
    expect(preview.summary.valid).toBe(3);
    const ins = insertStudents(db, preview.rows.filter((r) => r.status === 'valid').map((r) => ({
      className: r.className, nis: r.nis, nisn: r.nisn, name: r.name, gender: r.gender as 'P' | 'L',
    })));
    expect(ins.inserted).toBe(3);

    const aida = getStudentByNisn(db, '0103133511');
    expect(aida).not.toBeNull();

    recordAttendance(db, aida!.id);
    const today = new Date();
    const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const entries = listAttendanceByDate(db, local);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('AIDA ZULFA KHASNA');

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_cashier_student_id', ?)").run(aida!.id);
    const cashierId = (db.prepare("SELECT value FROM settings WHERE key = 'active_cashier_student_id'").get() as { value: string }).value;
    expect(cashierId).toBe(aida!.id);

    const res = createTransaction(db, [{ barcode: '8992761110017', qty: 1 }]);
    expect(res.cashier_name).toBe('AIDA ZULFA KHASNA');
    expect(res.cashier_class).toBe('XIPM');
    expect(res.code).toMatch(/^TRX-\d{8}-0001$/);

    const aqua = getProductByBarcode(db, '8992761110017');
    expect(aqua!.stock).toBe(47);
  });
});
