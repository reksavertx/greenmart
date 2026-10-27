// Filter dedup berbasis ID + aturan backoff (PRD §7.4.3) — pure agar mudah diuji.
// Baris yang ID-nya sudah ada di Sheets -> "healed" (ditandai synced tanpa menulis ulang);
// sisanya "fresh" (perlu ditulis).

export interface HasId {
  id: string;
}

export interface PartitionResult<T extends HasId> {
  fresh: T[];
  healed: T[];
}

export function partitionById<T extends HasId>(rows: T[], existingIds: Set<string>): PartitionResult<T> {
  const fresh: T[] = [];
  const healed: T[] = [];
  for (const r of rows) {
    if (existingIds.has(r.id)) healed.push(r);
    else fresh.push(r);
  }
  return { fresh, healed };
}

// ---- Backoff eksponensial 1 -> 5 -> 15 -> 60 menit (PRD §7.4.3 poin 8) ----

const BACKOFF_MINUTES = [1, 5, 15, 60];

export function backoffMinutes(retryCount: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(retryCount, 0), BACKOFF_MINUTES.length - 1)];
}

/** Apakah record boleh dicoba lagi (backoff sejak percobaan terakhir sudah lewat). */
export function isDueForRetry(lastSyncAttempt: string | null, retryCount: number, now = Date.now()): boolean {
  if (!lastSyncAttempt) return true;
  const t = Date.parse(lastSyncAttempt);
  if (Number.isNaN(t)) return true;
  return now - t >= backoffMinutes(retryCount) * 60_000;
}
