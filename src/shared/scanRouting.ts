// Routing hasil scan barcode/NISN — pure function agar mudah diuji (PRD §12).
import type { ScanMode, ScanResult, ScanStudentRef, ScanProductRef } from './types';

/** Ambil digit saja: "'0103133511 " -> "0103133511" */
export function normalizeNisn(raw: string): string {
  return raw.replace(/\D+/g, '');
}

export interface ScanLookup {
  findProduct(barcode: string): ScanProductRef | null;
  findStudent(nisn: string): ScanStudentRef | null;
}

/**
 * Routing kode hasil scan sesuai PRD §F1.2:
 * - Mode Kasir: cocokkan ke products.barcode dulu, lalu students.nisn (dinormalisasi digit).
 * - Mode Absensi: cek students.nisn dulu, lalu produk.
 * - Tidak keduanya -> unknown.
 */
export function routeScan(rawCode: string, mode: ScanMode, lookup: ScanLookup): ScanResult {
  const code = rawCode.trim();
  if (!code) return { type: 'empty' };

  if (mode === 'kasir') {
    const product = lookup.findProduct(code);
    if (product) return { type: 'product', product };
    const student = lookup.findStudent(normalizeNisn(code));
    if (student) return { type: 'student', student };
    return { type: 'unknown', code };
  }

  // mode absensi
  const student = lookup.findStudent(normalizeNisn(code));
  if (student) return { type: 'student', student };
  const product = lookup.findProduct(code);
  if (product) return { type: 'product', product };
  return { type: 'unknown', code };
}

// ---- Varian async (dipakai renderer via IPC; urutan prioritas identik) ----

export interface AsyncScanLookup {
  findProduct(barcode: string): Promise<ScanProductRef | null>;
  findStudent(nisn: string): Promise<ScanStudentRef | null>;
}

export async function routeScanAsync(rawCode: string, mode: ScanMode, lookup: AsyncScanLookup): Promise<ScanResult> {
  const code = rawCode.trim();
  if (!code) return { type: 'empty' };

  if (mode === 'kasir') {
    const product = await lookup.findProduct(code);
    if (product) return { type: 'product', product };
    const student = await lookup.findStudent(normalizeNisn(code));
    if (student) return { type: 'student', student };
    return { type: 'unknown', code };
  }

  const student = await lookup.findStudent(normalizeNisn(code));
  if (student) return { type: 'student', student };
  const product = await lookup.findProduct(code);
  if (product) return { type: 'product', product };
  return { type: 'unknown', code };
}
