// Perhitungan rentang periode laporan (harian/mingguan/bulanan) — pure, semua tanggal lokal YYYY-MM-DD.

export interface DateRange {
  start: string;
  end: string;
}

function ymd(utc: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${utc.getUTCFullYear()}-${p(utc.getUTCMonth() + 1)}-${p(utc.getUTCDate())}`;
}

/** Selisih hari kalender b - a (contoh: diffDays('2026-01-01','2026-01-03') = 2). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Minggu (Senin–Minggu) yang memuat tanggal tersebut. */
export function weekRange(dateStr: string): DateRange {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const offsetToMonday = (utc.getUTCDay() + 6) % 7; // Senin = 0
  const start = new Date(utc.getTime() - offsetToMonday * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: ymd(start), end: ymd(end) };
}

/** Rentang bulan kalender dari 'YYYY-MM'. */
export function monthRange(ym: string): DateRange {
  const [y, m] = ym.split('-').map(Number);
  const endDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // hari 0 = akhir bulan sebelumnya
  const p = (n: number): string => String(n).padStart(2, '0');
  return { start: `${ym}-01`, end: `${ym}-${p(endDay)}` };
}
