// Registrasi seluruh IPC handler — satu-satunya jalan renderer -> data (PRD §5.4).
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import type { DB } from '../db/database';
import type {
  CartItemInput,
  DashboardCards,
  HourPoint,
  ProductFilter,
  ProductInput,
  TopProduct,
  TrendPoint,
} from '@shared/types';
import * as products from '../db/repositories/products';
import * as students from '../db/repositories/students';
import * as attendance from '../db/repositories/attendance';
import * as settingsRepo from '../db/repositories/settings';
import { createTransaction } from '../db/repositories/transactions';
import { getSyncStatusInfo } from '../db/repositories/syncLog';
import { parseStudentsCsv } from '../csv/importStudents';
import { runBackup, listBackups } from '../db/backup';
import { localDate, daysAgo, dateRange } from '../util/time';
import { encryptSecret, encryptionAvailable, decryptSecret } from '../util/secret';
import { buildSheetsClient, extractSpreadsheetId, validateCredentialJson } from '../sync/google';
import { resetFailedBackoff } from '../sync/sheetsSync';
import type { SyncManager } from '../sync/scheduler';
import log from 'electron-log/main';

export interface IpcContext {
  db: DB;
  sync: SyncManager;
  defaultBackupDir: string;
}

/** Cetak HTML label (SVG barcode sudah dirender di renderer) via window tersembunyi. */
async function printHtml(html: string): Promise<void> {
  const win = new BrowserWindow({ show: false, width: 860, height: 1100 });
  win.setMenuBarVisibility(false);
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise<void>((resolve) => {
    win.webContents.once('did-finish-load', () => resolve());
  });
  await new Promise<void>((resolve) => {
    win.webContents.print({ silent: false, printBackground: true }, () => resolve());
  });
  win.destroy();
}

function dashboardCards(db: DB): DashboardCards {
  const date = localDate();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS c, COALESCE(SUM(item_count), 0) AS items
       FROM transactions WHERE substr(sold_at, 1, 10) = ?`,
    )
    .get(date) as { revenue: number; c: number; items: number };
  return { date, revenue: row.revenue, transaction_count: row.c, items_sold: row.items };
}

function dashboardTrend(db: DB, days: number): TrendPoint[] {
  const start = daysAgo(days);
  const end = localDate();
  const rows = db
    .prepare(
      `SELECT substr(sold_at, 1, 10) AS d, COALESCE(SUM(total), 0) AS revenue
       FROM transactions WHERE substr(sold_at, 1, 10) >= ? AND substr(sold_at, 1, 10) <= ?
       GROUP BY d`,
    )
    .all(start, end) as { d: string; revenue: number }[];
  const map = new Map(rows.map((r) => [r.d, r.revenue]));
  return dateRange(start, end).map((d) => ({ date: d, revenue: map.get(d) ?? 0 }));
}

function dashboardTop(db: DB, days: number, by: 'qty' | 'revenue'): TopProduct[] {
  const start = daysAgo(days);
  const order = by === 'qty' ? 'qty DESC' : 'revenue DESC';
  return db
    .prepare(
      `SELECT ti.product_name AS name, SUM(ti.qty) AS qty, SUM(ti.subtotal) AS revenue
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE substr(t.sold_at, 1, 10) >= ?
       GROUP BY ti.product_name
       ORDER BY ${order}
       LIMIT 10`,
    )
    .all(start) as TopProduct[];
}

function dashboardHourly(db: DB, days: number): HourPoint[] {
  const start = daysAgo(days);
  const rows = db
    .prepare(
      `SELECT CAST(substr(sold_at, 12, 2) AS INTEGER) AS h, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS c
       FROM transactions WHERE substr(sold_at, 1, 10) >= ?
       GROUP BY h`,
    )
    .all(start) as { h: number; revenue: number; c: number }[];
  const map = new Map(rows.map((r) => [r.h, r]));
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    revenue: map.get(h)?.revenue ?? 0,
    count: map.get(h)?.c ?? 0,
  }));
}

function existingNisns(db: DB): Set<string> {
  const rows = db.prepare('SELECT nisn FROM students').all() as { nisn: string }[];
  return new Set(rows.map((r) => r.nisn));
}

export function registerIpc(ctx: IpcContext): void {
  const { db, sync } = ctx;

  // ---------- Produk ----------
  ipcMain.handle('products:list', (_e, q: { search?: string; filter?: ProductFilter }) =>
    products.listProducts(db, q ?? {}),
  );
  ipcMain.handle('products:create', (_e, input: ProductInput) => products.createProduct(db, input));
  ipcMain.handle('products:update', (_e, id: string, input: ProductInput) =>
    products.updateProduct(db, id, input),
  );
  ipcMain.handle('products:delete', (_e, id: string, mode: 'soft' | 'hard') =>
    products.deleteProduct(db, id, mode),
  );
  ipcMain.handle('products:hasSales', (_e, id: string) => products.hasSales(db, id));
  ipcMain.handle('products:byBarcode', (_e, barcode: string) =>
    products.getProductByBarcode(db, barcode),
  );

  // ---------- Label barcode (HTML dari renderer, SVG Code 128 sudah jadi) ----------
  ipcMain.handle('labels:print', async (_e, html: string, labelCount: number) => {
    await printHtml(html);
    log.info(`Label dicetak: ${labelCount} label`);
  });

  // ---------- Siswa & absensi ----------
  ipcMain.handle('students:pickCsv', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Pilih file CSV siswa',
      filters: [{ name: 'CSV / TSV', extensions: ['csv', 'txt', 'tsv'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const file = res.filePaths[0];
    const fs = await import('node:fs');
    return { content: fs.readFileSync(file, 'utf8'), fileName: file };
  });
  ipcMain.handle('students:importPreview', (_e, content: string) =>
    parseStudentsCsv(content, existingNisns(db)),
  );
  ipcMain.handle(
    'students:importCommit',
    (_e, rows: { className: string; nis: string; nisn: string; name: string; gender: string }[]) => {
      const valid = rows
        .filter((r) => r && r.nisn && /^\d+$/.test(r.nisn) && r.name && r.className && (r.gender === 'P' || r.gender === 'L'))
        .map((r) => ({
          className: r.className,
          nis: r.nis,
          nisn: r.nisn,
          name: r.name,
          gender: r.gender === 'L' ? ('L' as const) : ('P' as const),
        }));
      const res = students.insertStudents(db, valid);
      return { inserted: res.inserted, skipped: res.skipped };
    },
  );
  ipcMain.handle('students:findByNisn', (_e, nisn: string) =>
    students.getStudentByNisn(db, nisn.replace(/\D+/g, '')),
  );

  ipcMain.handle('attendance:record', (_e, studentId: string) => {
    const student = students.getStudentById(db, studentId);
    if (!student) throw new Error('Siswa tidak ditemukan.');
    const res = attendance.recordAttendance(db, studentId);
    settingsRepo.setSetting(db, 'active_cashier_student_id', studentId);
    return {
      id: student.id,
      nisn: student.nisn,
      name: student.name,
      class_name: student.class_name,
      gender: student.gender,
      scanned_at: res.scanned_at,
    };
  });
  ipcMain.handle('attendance:today', () => attendance.listAttendanceByDate(db, localDate()));
  ipcMain.handle('attendance:byDate', (_e, date: string) => attendance.listAttendanceByDate(db, date));
  ipcMain.handle('attendance:setActiveCashier', (_e, studentId: string | null) => {
    settingsRepo.setSetting(db, 'active_cashier_student_id', studentId ?? '');
  });
  ipcMain.handle('attendance:getActiveCashier', () => {
    const id = settingsRepo.getSetting(db, 'active_cashier_student_id', '');
    return id ? students.getStudentById(db, id) : null;
  });

  // ---------- Transaksi ----------
  ipcMain.handle('transactions:create', (_e, items: CartItemInput[]) => createTransaction(db, items));

  // ---------- Dashboard ----------
  ipcMain.handle('dashboard:cards', () => dashboardCards(db));
  ipcMain.handle('dashboard:trend', (_e, days: number) => dashboardTrend(db, days));
  ipcMain.handle('dashboard:top', (_e, days: number, by: 'qty' | 'revenue') =>
    dashboardTop(db, days, by),
  );
  ipcMain.handle('dashboard:hourly', (_e, days: number) => dashboardHourly(db, days));

  // ---------- Pengaturan ----------
  ipcMain.handle('settings:all', () => settingsRepo.getAllSettings(db));
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    settingsRepo.setSetting(db, key, value);
  });

  // ---------- Sinkronisasi ----------
  ipcMain.handle('sync:now', async () => {
    const res = await sync.run(true);
    return { ok: res.ok, message: res.message };
  });
  ipcMain.handle('sync:status', () => getSyncStatusInfo(db, sync.isRunning));
  ipcMain.handle('sync:retryFailed', async () => {
    resetFailedBackoff(db);
    const res = await sync.run(true);
    return { ok: res.ok, message: res.message };
  });
  ipcMain.handle('sync:openSheet', async () => {
    const url = settingsRepo.getSetting(db, 'google_spreadsheet_url', '');
    if (url) await shell.openExternal(url);
  });

  ipcMain.handle(
    'google:test',
    async (_e, payload: { credentialJson: string; spreadsheetInput: string }) => {
      const credCheck = validateCredentialJson(payload?.credentialJson ?? '');
      if (!credCheck.ok) return { ok: false, message: credCheck.message };
      const id = extractSpreadsheetId(payload?.spreadsheetInput ?? '');
      if (!id) return { ok: false, message: 'URL/ID spreadsheet tidak dikenali.' };
      try {
        const client = buildSheetsClient(payload.credentialJson, id);
        const meta = await client.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'properties.title' });
        return { ok: true, message: `Terhubung ke spreadsheet: "${meta.data.properties?.title ?? id}".` };
      } catch (err) {
        return { ok: false, message: googleErrorMessage(err) };
      }
    },
  );

  ipcMain.handle(
    'google:save',
    async (_e, payload: { credentialJson: string; spreadsheetInput: string }) => {
      const credCheck = validateCredentialJson(payload?.credentialJson ?? '');
      if (!credCheck.ok) return { ok: false, message: credCheck.message };
      const id = extractSpreadsheetId(payload?.spreadsheetInput ?? '');
      if (!id) return { ok: false, message: 'URL/ID spreadsheet tidak dikenali.' };
      try {
        const client = buildSheetsClient(payload.credentialJson, id);
        const meta = await client.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'properties.title' });
        const encrypted = await encryptSecret(payload.credentialJson);
        settingsRepo.setSetting(db, 'google_credential', encrypted);
        settingsRepo.setSetting(db, 'google_spreadsheet_id', id);
        settingsRepo.setSetting(db, 'google_spreadsheet_url', `https://docs.google.com/spreadsheets/d/${id}/edit`);
        return {
          ok: true,
          message: `Kredensial tersimpan terenkripsi. Spreadsheet: "${meta.data.properties?.title ?? id}".`,
        };
      } catch (err) {
        return { ok: false, message: googleErrorMessage(err) };
      }
    },
  );

  ipcMain.handle('google:configured', async () => {
    const stored = settingsRepo.getSetting(db, 'google_credential', '');
    let hasCredential = false;
    if (stored) {
      try {
        await decryptSecret(stored);
        hasCredential = true;
      } catch {
        hasCredential = false;
      }
    }
    return {
      hasCredential,
      spreadsheetId: settingsRepo.getSetting(db, 'google_spreadsheet_id', '') || null,
      spreadsheetUrl: settingsRepo.getSetting(db, 'google_spreadsheet_url', '') || null,
      encryptionAvailable: await encryptionAvailable(),
    };
  });

  // ---------- Backup & danger zone ----------
  ipcMain.handle('backup:info', () => {
    const dir = settingsRepo.getSetting(db, 'backup_dir', '') || ctx.defaultBackupDir;
    return { dir, files: listBackups(dir) };
  });
  ipcMain.handle('backup:chooseDir', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Pilih folder backup',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const dir = res.filePaths[0];
    settingsRepo.setSetting(db, 'backup_dir', dir);
    return dir;
  });
  ipcMain.handle('backup:runNow', () => {
    const dir = settingsRepo.getSetting(db, 'backup_dir', '') || ctx.defaultBackupDir;
    settingsRepo.setSetting(db, 'backup_dir', dir);
    runBackup(db, dir, false);
  });

  ipcMain.handle('system:resetData', (_e, scope: 'transactions' | 'products', confirmName: string) => {
    const storeName = settingsRepo.getSetting(db, 'store_name', 'GreenMart');
    if ((confirmName ?? '').trim() !== storeName) {
      return { ok: false, message: `Konfirmasi tidak cocok — ketik "${storeName}" persis.` };
    }
    if (scope === 'transactions') {
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM transaction_items').run();
        db.prepare('DELETE FROM transactions').run();
        db.prepare('DELETE FROM daily_summaries').run();
      });
      tx();
      return { ok: true, message: 'Semua transaksi & ringkasan harian telah dihapus.' };
    }
    const soldIds = new Set(
      (db
        .prepare('SELECT DISTINCT product_id FROM transaction_items WHERE product_id IS NOT NULL')
        .all() as { product_id: string }[]).map((r) => r.product_id),
    );
    const all = db.prepare('SELECT id FROM products').all() as { id: string }[];
    let deleted = 0;
    let skipped = 0;
    const tx = db.transaction(() => {
      for (const p of all) {
        if (soldIds.has(p.id)) skipped++;
        else {
          db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
          deleted++;
        }
      }
    });
    tx();
    return {
      ok: true,
      message: `Produk dihapus: ${deleted}. Dilewati (punya riwayat transaksi): ${skipped}.`,
    };
  });
}

function googleErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number }; message?: string };
  const status = e.response?.status;
  if (status === 404) return 'Spreadsheet tidak ditemukan — periksa URL/ID.';
  if (status === 403)
    return 'Akses ditolak — bagikan spreadsheet ke email service account sebagai Editor.';
  if (status === 401) return 'Kredensial ditolak Google — periksa JSON service account.';
  return e.message ?? 'Gagal terhubung ke Google.';
}
