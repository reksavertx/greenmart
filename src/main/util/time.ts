// Waktu lokal ISO-8601 dengan offset zona waktu PC kasir (PRD §6).
// Contoh: 2026-10-27T14:05:00+07:00

const p2 = (n: number): string => String(n).padStart(2, '0');

export function toIsoLocal(d: Date = new Date()): string {
  const off = -d.getTimezoneOffset(); // menit; +07:00 => -420
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` +
    `T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` +
    `${sign}${p2(Math.floor(abs / 60))}:${p2(abs % 60)}`
  );
}

/** Tanggal lokal YYYY-MM-DD (kolom local_date / kode transaksi). */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** YYYY-MM-DD -> YYYYMMDD (untuk kode TRX). */
export function compactDate(date: string): string {
  return date.replaceAll('-', '');
}

/** Tanggal lokal N hari sebelum referensi (untuk rentang dashboard). */
export function daysAgo(days: number, ref: Date = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - (days - 1));
  return localDate(d);
}

/** Daftar tanggal lokal dari start sampai end (inklusif), urut naik. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  let cur = new Date(sy, sm - 1, sd);
  const stop = new Date(ey, em - 1, ed);
  while (cur <= stop) {
    out.push(localDate(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}
