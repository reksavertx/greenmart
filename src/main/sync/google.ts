// Klien Google Sheets (Service Account + Sheets API v4 — Opsi A di PRD §7.4.4).
import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';

export interface SheetsClient {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

/** Terima URL lengkap atau ID mentah; kembalikan ID spreadsheet. */
export function extractSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

/** Validasi struktur JSON service account (tanpa menyentuh jaringan). */
export function validateCredentialJson(json: string): { ok: boolean; message: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return { ok: false, message: 'Isi bukan JSON yang valid.' };
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.client_email !== 'string' || !o.client_email.includes('@')) {
    return { ok: false, message: 'JSON tidak memiliki field "client_email" — pastikan ini file key Service Account.' };
  }
  if (typeof o.private_key !== 'string' || !o.private_key.includes('PRIVATE KEY')) {
    return { ok: false, message: 'JSON tidak memiliki field "private_key" — pastikan ini file key Service Account.' };
  }
  return { ok: true, message: 'Struktur kredensial valid.' };
}

export function buildSheetsClient(credentialsJson: string, spreadsheetId: string): SheetsClient {
  const credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
  const auth = new google.auth.GoogleAuth({
    credentials: credentials as { client_email: string; private_key: string },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId };
}

export type SyncErrorClass = 'config' | 'network';

export interface ClassifiedError {
  cls: SyncErrorClass;
  message: string;
}

/**
 * Klasifikasi error sesuai PRD §7.4.3 poin 7:
 * - 401/403/404, kredensial invalid, spreadsheet tidak ditemukan -> 'config' (status failed)
 * - jaringan/timeout/5xx -> 'network' (status tetap pending)
 */
export function classifySyncError(err: unknown): ClassifiedError {
  const e = err as {
    code?: unknown;
    status?: unknown;
    response?: { status?: number };
    message?: string;
  };
  let status: number | undefined;
  if (typeof e.code === 'number') status = e.code;
  else if (typeof e.status === 'number') status = e.status;
  else if (e.response && typeof e.response.status === 'number') status = e.response.status;

  const msg = String(e.message ?? err ?? 'Error tidak diketahui');

  if (status === 401) return { cls: 'config', message: 'Kredensial tidak valid/kedaluwarsa — buka Pengaturan dan simpan ulang JSON service account.' };
  if (status === 403) return { cls: 'config', message: 'Akses ditolak — bagikan spreadsheet ke email service account sebagai Editor.' };
  if (status === 404) return { cls: 'config', message: 'Spreadsheet tidak ditemukan — periksa ID/URL spreadsheet di Pengaturan.' };
  if (/invalid_grant|invalid jwt|service account|permission|UNAUTHENTICATED/i.test(msg)) {
    return { cls: 'config', message: `Kredensial/otorisasi bermasalah: ${msg}` };
  }
  return { cls: 'network', message: msg };
}
