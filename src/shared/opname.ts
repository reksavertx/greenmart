// Logika pengingat stok opname (v1.0.1) — pure & testable.
//
// Siklus jaga X hari (contoh user: jaga 3 hari):
//   - opname "awal" di pagi hari ke-1 siklus
//   - opname "akhir" di hari ke-X (akhir jaga)
// Urutan opname selalu berselang: ... akhir → awal → akhir → awal ...
// Hari siklus dihitung dari opname terakhir yang selesai (done).

import { diffDays } from './period';

export type OpnamePhase = 'awal' | 'akhir';

export interface OpnameReminder {
  /** 'awal'/'akhir' = saatnya opname (termasuk telat/nag), null = belum perlu. */
  due: OpnamePhase | null;
  /** Hari ke berapa dalam siklus jaga saat ini (0 bila baru selesai opname hari ini). */
  cycleDay: number;
  cycleDays: number;
  lastDate: string | null;
}

export function normalizeCycleDays(raw: number): number {
  const n = Math.floor(raw);
  return Number.isFinite(n) && n >= 2 ? Math.min(n, 31) : 3;
}

export function computeOpnameReminder(
  last: { date: string; phase: OpnamePhase } | null,
  cycleDaysRaw: number,
  today: string,
): OpnameReminder {
  const cycleDays = normalizeCycleDays(cycleDaysRaw);
  if (!last) {
    // Belum pernah opname → sarankan opname awal (baseline stok).
    return { due: 'awal', cycleDay: 1, cycleDays, lastDate: null };
  }
  const d = diffDays(last.date, today);
  if (d <= 0) {
    // Baru selesai opname hari ini (atau tanggal aneh) → tidak ada yang due.
    return { due: null, cycleDay: 0, cycleDays, lastDate: last.date };
  }
  if (last.phase === 'akhir') {
    // Siklus baru dimulai besoknya akhir: hari ke-1 = 1 hari setelah opname akhir.
    const cycleDay = d;
    return { due: cycleDay >= 1 ? 'awal' : null, cycleDay, cycleDays, lastDate: last.date };
  }
  // last = 'awal': opname akhir jatuh di hari ke-cycleDays siklus (hari ke-1 = hari opname awal).
  const cycleDay = d + 1;
  return { due: cycleDay >= cycleDays ? 'akhir' : null, cycleDay, cycleDays, lastDate: last.date };
}
