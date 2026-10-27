// Algoritma sinkronisasi idempoten SQLite -> Google Sheets (PRD §7.4.3).
import type { sheets_v4 } from 'googleapis';
import type { DB } from '../db/database';
import type { Product } from '@shared/types';
import {
  buildSheetsClient,
  classifySyncError,
  extractSpreadsheetId,
  validateCredentialJson,
  type SheetsClient,
} from './google';
import { getAllSettings, setSetting } from '../db/repositories/settings';
import { addSyncLog } from '../db/repositories/syncLog';
import { decryptSecret } from '../util/secret';
import { toIsoLocal } from '../util/time';
import { isDueForRetry } from './dedupe';

export const TABS = {
  transaksi: { title: 'Transaksi', headers: ['id', 'kode', 'waktu_transaksi', 'nama_kasir', 'kelas_kasir', 'jumlah_item', 'total', 'metode'] },
  detail: { title: 'Detail Transaksi', headers: ['item_id', 'transaction_id', 'kode_transaksi', 'waktu', 'barcode', 'nama_produk', 'harga_satuan', 'qty', 'subtotal'] },
  ringkasan: { title: 'Ringkasan Harian', headers: ['tanggal', 'omzet', 'jumlah_transaksi', 'item_terjual', 'updated_at'] },
  produk: { title: 'Produk', headers: ['id', 'barcode', 'nama', 'harga', 'stok', 'aktif', 'updated_at'] },
} as const;

type TabKey = keyof typeof TABS;

interface TrxRow {
  id: string;
  code: string;
  total: number;
  item_count: number;
  payment_method: string;
  cashier_student_id: string | null;
  sold_at: string;
  sync_status: string;
  retry_count: number;
  last_sync_attempt: string | null;
}

interface ItemRow {
  id: string;
  transaction_id: string;
  barcode: string;
  product_name: string;
  price: number;
  qty: number;
  subtotal: number;
}

interface DailyRow {
  local_date: string;
  revenue: number;
  transaction_count: number;
  items_sold: number;
  sync_status: string;
  retry_count: number;
  last_sync_attempt: string | null;
}

export interface SyncCounts {
  transactions: number;
  details: number;
  summaries: number;
  productsAdded: number;
  productsUpdated: number;
}

export interface SyncResult {
  ok: boolean;
  configError: boolean;
  message: string;
  counts: SyncCounts;
}

const EMPTY_COUNTS: SyncCounts = { transactions: 0, details: 0, summaries: 0, productsAdded: 0, productsUpdated: 0 };

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function readRows(client: SheetsClient, tabTitle: string, colCount: number): Promise<string[][]> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `'${tabTitle}'!A2:${colLetter(colCount)}`,
  });
  return res.data.values ?? [];
}

function valsEqual(a: string[], b: string[]): boolean {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if ((a[i] ?? '') !== (b[i] ?? '')) return false;
  }
  return true;
}

// ---- Status helper (transactions & daily_summaries) ----

function markTrxSynced(db: DB, ids: string[]): void {
  if (!ids.length) return;
  const now = toIsoLocal();
  const stmt = db.prepare(
    "UPDATE transactions SET sync_status = 'synced', synced_at = ?, sync_error = NULL, retry_count = 0, last_sync_attempt = NULL WHERE id = ?",
  );
  const tx = db.transaction((list: string[]) => {
    for (const id of list) stmt.run(now, id);
  });
  tx(ids);
}

function markTrxPendingAttempt(db: DB, ids: string[], message: string): void {
  if (!ids.length) return;
  const now = toIsoLocal();
  const stmt = db.prepare(
    "UPDATE transactions SET sync_error = ?, retry_count = retry_count + 1, last_sync_attempt = ? WHERE id = ?",
  );
  const tx = db.transaction((list: string[]) => {
    for (const id of list) stmt.run(message, now, id);
  });
  tx(ids);
}

function markTrxFailed(db: DB, ids: string[], message: string): void {
  if (!ids.length) return;
  const now = toIsoLocal();
  const stmt = db.prepare(
    "UPDATE transactions SET sync_status = 'failed', sync_error = ?, retry_count = retry_count + 1, last_sync_attempt = ? WHERE id = ?",
  );
  const tx = db.transaction((list: string[]) => {
    for (const id of list) stmt.run(message, now, id);
  });
  tx(ids);
}

function markDailyStatus(db: DB, dates: string[], status: 'synced' | 'failed', message: string | null): void {
  if (!dates.length) return;
  const now = toIsoLocal();
  const stmt =
    status === 'synced'
      ? db.prepare("UPDATE daily_summaries SET sync_status = 'synced', synced_at = ?, sync_error = NULL, retry_count = 0, last_sync_attempt = NULL WHERE local_date = ?")
      : db.prepare("UPDATE daily_summaries SET sync_status = 'failed', sync_error = ?, retry_count = retry_count + 1, last_sync_attempt = ? WHERE local_date = ?");
  const tx = db.transaction((list: string[]) => {
    for (const d of list) {
      if (status === 'synced') stmt.run(now, d);
      else stmt.run(message, now, d);
    }
  });
  tx(dates);
}

function markDailyPendingAttempt(db: DB, dates: string[], message: string): void {
  if (!dates.length) return;
  const now = toIsoLocal();
  const stmt = db.prepare('UPDATE daily_summaries SET sync_error = ?, retry_count = retry_count + 1, last_sync_attempt = ? WHERE local_date = ?');
  const tx = db.transaction((list: string[]) => {
    for (const d of list) stmt.run(message, now, d);
  });
  tx(dates);
}

/** Buat tab yang belum ada (beserta header di-bold) — PRD §7.4.2. */
export async function ensureTabs(client: SheetsClient): Promise<void> {
  const meta = await client.sheets.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
    fields: 'sheets.properties(title,sheetId)',
  });
  const existing = new Set<string>();
  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title;
    if (title) existing.add(title);
  }
  const missing = (Object.keys(TABS) as TabKey[]).filter((k) => !existing.has(TABS[k].title));
  if (!missing.length) return;

  const addRes = await client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: {
      requests: missing.map((k) => ({ addSheet: { properties: { title: TABS[k].title } } })),
    },
  });

  const boldReqs: sheets_v4.Schema$Request[] = [];
  const replies = addRes.data.replies ?? [];
  replies.forEach((r, _i) => {
    const sheetId = r.addSheet?.properties?.sheetId;
    if (typeof sheetId === 'number') {
      boldReqs.push({
        repeatCell: {
          range: { sheetId },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      });
    }
  });

  const headerWrites = missing.map((k) =>
    client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `'${TABS[k].title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[...TABS[k].headers]] },
    }),
  );

  if (boldReqs.length) {
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { requests: boldReqs },
    });
  }
  await Promise.all(headerWrites);
}

async function appendValues(client: SheetsClient, tabTitle: string, values: string[][]): Promise<void> {
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: `'${tabTitle}'!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

async function batchUpdateRows(
  client: SheetsClient,
  data: { range: string; values: string[][] }[],
): Promise<void> {
  await client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

export interface SyncDeps {
  db: DB;
  /** manual = abaikan backoff (tombol [Sinkronisasi Sekarang] / [Coba Ulang Semua Failed]) */
  manual: boolean;
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const { db, manual } = deps;
  const counts: SyncCounts = { ...EMPTY_COUNTS };
  const nowIso = toIsoLocal();

  // 0. Konfigurasi
  const settings = getAllSettings(db);
  const credStored = settings.google_credential ?? '';
  const spreadsheetInput = settings.google_spreadsheet_id ?? '';
  if (!credStored || !spreadsheetInput) {
    return {
      ok: false,
      configError: true,
      message: 'Sinkronisasi belum dikonfigurasi — buka menu Pengaturan.',
      counts,
    };
  }
  const spreadsheetId = extractSpreadsheetId(spreadsheetInput) ?? spreadsheetInput;

  let credentialJson: string;
  try {
    credentialJson = await decryptSecret(credStored);
  } catch {
    return {
      ok: false,
      configError: true,
      message: 'Kredensial tidak dapat dibaca — simpan ulang di Pengaturan.',
      counts,
    };
  }
  const credCheck = validateCredentialJson(credentialJson);
  if (!credCheck.ok) {
    return { ok: false, configError: true, message: credCheck.message, counts };
  }

  let client: SheetsClient;
  try {
    client = buildSheetsClient(credentialJson, spreadsheetId);
  } catch (err) {
    const { message } = classifySyncError(err);
    return { ok: false, configError: true, message: `Kredensial tidak valid: ${message}`, counts };
  }

  // 1. Pastikan semua tab ada (dengan header bold).
  try {
    await ensureTabs(client);
  } catch (err) {
    const { cls, message } = classifySyncError(err);
    addSyncLog(db, cls === 'config' ? 'auth' : 'network', 'error', message);
    return { ok: false, configError: cls === 'config', message, counts };
  }

  // 2. Kumpulkan batch transaksi (limit 100 per run, hormati backoff kecuali manual).
  const candidates = db
    .prepare("SELECT * FROM transactions WHERE sync_status != 'synced' ORDER BY sold_at ASC LIMIT 500")
    .all() as TrxRow[];
  const due = manual ? candidates : candidates.filter((r) => isDueForRetry(r.last_sync_attempt, r.retry_count));
  const batch = due.slice(0, 100);

  const itemsByTrx = new Map<string, ItemRow[]>();
  if (batch.length) {
    const ids = batch.map((b) => b.id);
    const ph = ids.map(() => '?').join(',');
    const items = db
      .prepare(`SELECT * FROM transaction_items WHERE transaction_id IN (${ph})`)
      .all(...ids) as ItemRow[];
    for (const it of items) {
      const arr = itemsByTrx.get(it.transaction_id) ?? [];
      arr.push(it);
      itemsByTrx.set(it.transaction_id, arr);
    }
  }

  const cashierStmt = db.prepare('SELECT name, class_name FROM students WHERE id = ?');

  // 3. Baca kolom ID existing untuk dedup + self-heal.
  let trxIdSet = new Set<string>();
  let itemIdSet = new Set<string>();
  try {
    const [tRows, dRows] = await Promise.all([
      readRows(client, TABS.transaksi.title, 1),
      readRows(client, TABS.detail.title, 1),
    ]);
    trxIdSet = new Set(tRows.map((r) => r[0]).filter(Boolean));
    itemIdSet = new Set(dRows.map((r) => r[0]).filter(Boolean));
  } catch (err) {
    const { cls, message } = classifySyncError(err);
    addSyncLog(db, cls === 'config' ? 'auth' : 'network', 'error', message);
    return { ok: false, configError: cls === 'config', message, counts };
  }

  // 4. Self-heal: ID sudah ada di Sheets -> tandai synced tanpa menulis ulang.
  const trxRowsToWrite: string[][] = [];
  const detailRowsToWrite: string[][] = [];
  const healedIds: string[] = [];
  const remaining: TrxRow[] = [];

  for (const t of batch) {
    const items = itemsByTrx.get(t.id) ?? [];
    const cashier = t.cashier_student_id
      ? ((cashierStmt.get(t.cashier_student_id) as { name: string; class_name: string } | undefined) ?? null)
      : null;
    if (trxIdSet.has(t.id)) {
      // header sudah terkirim — pastikan detailnya tidak hilang (crash mid-sync)
      healedIds.push(t.id);
      for (const it of items) {
        if (!itemIdSet.has(it.id)) {
          detailRowsToWrite.push([it.id, it.transaction_id, t.code, t.sold_at, it.barcode, it.product_name, String(it.price), String(it.qty), String(it.subtotal)]);
        }
      }
      continue;
    }
    remaining.push(t);
    trxRowsToWrite.push([
      t.id,
      t.code,
      t.sold_at,
      cashier?.name ?? '',
      cashier?.class_name ?? '',
      String(t.item_count),
      String(t.total),
      t.payment_method,
    ]);
    for (const it of items) {
      if (!itemIdSet.has(it.id)) {
        detailRowsToWrite.push([it.id, it.transaction_id, t.code, t.sold_at, it.barcode, it.product_name, String(it.price), String(it.qty), String(it.subtotal)]);
      }
    }
  }
  markTrxSynced(db, healedIds);

  // 5. Tulis sisa baris — satu panggilan values:append per tab.
  if (trxRowsToWrite.length || detailRowsToWrite.length) {
    try {
      if (trxRowsToWrite.length) await appendValues(client, TABS.transaksi.title, trxRowsToWrite);
      if (detailRowsToWrite.length) await appendValues(client, TABS.detail.title, detailRowsToWrite);
      markTrxSynced(db, remaining.map((r) => r.id));
      counts.transactions = remaining.length;
      counts.details = detailRowsToWrite.length;
      addSyncLog(db, 'transactions', 'ok', `${remaining.length} transaksi, ${detailRowsToWrite.length} detail terkirim.`);
    } catch (err) {
      const { cls, message } = classifySyncError(err);
      if (cls === 'config') {
        markTrxFailed(db, remaining.map((r) => r.id), message);
      } else {
        markTrxPendingAttempt(db, remaining.map((r) => r.id), message);
      }
      addSyncLog(db, cls === 'config' ? 'auth' : 'network', 'error', message);
      return { ok: false, configError: cls === 'config', message, counts };
    }
  }

  // 6. Ringkasan harian — upsert by tanggal.
  const dailyCandidates = db
    .prepare("SELECT * FROM daily_summaries WHERE sync_status != 'synced'")
    .all() as DailyRow[];
  const dailyDue = manual ? dailyCandidates : dailyCandidates.filter((d) => isDueForRetry(d.last_sync_attempt, d.retry_count));
  if (dailyDue.length) {
    try {
      const rows = await readRows(client, TABS.ringkasan.title, 5);
      const byDate = new Map<string, number>();
      rows.forEach((r, i) => {
        if (r[0]) byDate.set(r[0], i + 2);
      });
      const updates: { range: string; values: string[][] }[] = [];
      const appends: string[][] = [];
      for (const d of dailyDue) {
        const vals = [d.local_date, String(d.revenue), String(d.transaction_count), String(d.items_sold), nowIso];
        const row = byDate.get(d.local_date);
        if (row) updates.push({ range: `'${TABS.ringkasan.title}'!A${row}:E${row}`, values: [vals] });
        else appends.push(vals);
      }
      if (appends.length) await appendValues(client, TABS.ringkasan.title, appends);
      if (updates.length) await batchUpdateRows(client, updates);
      markDailyStatus(db, dailyDue.map((d) => d.local_date), 'synced', null);
      counts.summaries = dailyDue.length;
      addSyncLog(db, 'daily', 'ok', `${dailyDue.length} ringkasan harian terkirim.`);
    } catch (err) {
      const { cls, message } = classifySyncError(err);
      if (cls === 'config') markDailyStatus(db, dailyDue.map((d) => d.local_date), 'failed', message);
      else markDailyPendingAttempt(db, dailyDue.map((d) => d.local_date), message);
      addSyncLog(db, cls === 'config' ? 'auth' : 'network', 'error', `Ringkasan: ${message}`);
      if (cls === 'config') {
        setSetting(db, 'last_sync_at', nowIso);
        return { ok: false, configError: true, message, counts };
      }
    }
  }

  // 7. Produk — snapshot terkini, upsert by id (ADR: dipilih upsert, bukan clear+rewrite).
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY name').all() as Product[];
    const rows = await readRows(client, TABS.produk.title, 7);
    const byId = new Map<string, { row: number; vals: string[] }>();
    rows.forEach((r, i) => {
      if (r[0]) byId.set(r[0], { row: i + 2, vals: r });
    });
    const updates: { range: string; values: string[][] }[] = [];
    const appends: string[][] = [];
    for (const p of products) {
      const vals = [p.id, p.barcode, p.name, String(p.price), String(p.stock), p.is_active ? '1' : '0', p.updated_at];
      const ex = byId.get(p.id);
      if (!ex) appends.push(vals);
      else if (!valsEqual(ex.vals, vals)) updates.push({ range: `'${TABS.produk.title}'!A${ex.row}:G${ex.row}`, values: [vals] });
    }
    if (appends.length) await appendValues(client, TABS.produk.title, appends);
    if (updates.length) await batchUpdateRows(client, updates);
    counts.productsAdded = appends.length;
    counts.productsUpdated = updates.length;
    addSyncLog(db, 'products', 'ok', `Snapshot produk: ${appends.length} baru, ${updates.length} diperbarui.`);
  } catch (err) {
    const { cls, message } = classifySyncError(err);
    addSyncLog(db, cls === 'config' ? 'auth' : 'network', 'error', `Produk: ${message}`);
    if (cls === 'config') {
      setSetting(db, 'last_sync_at', nowIso);
      return { ok: false, configError: true, message, counts };
    }
  }

  setSetting(db, 'last_sync_at', nowIso);
  const okMessage = `Sinkron selesai: ${counts.transactions} transaksi, ${counts.details} detail, ${counts.summaries} ringkasan, produk ${counts.productsAdded} baru / ${counts.productsUpdated} diperbarui.`;
  return { ok: true, configError: false, message: okMessage, counts };
}

/** Reset backoff untuk semua record failed (tombol [Coba Ulang Semua Failed]). */
export function resetFailedBackoff(db: DB): void {
  db.prepare(
    "UPDATE transactions SET retry_count = 0, last_sync_attempt = NULL WHERE sync_status = 'failed'",
  ).run();
  db.prepare(
    "UPDATE daily_summaries SET retry_count = 0, last_sync_attempt = NULL WHERE sync_status = 'failed'",
  ).run();
}
