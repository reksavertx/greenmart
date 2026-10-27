// Test filter dedup ID (PRD §7.4.3 poin 2 — self-heal).
import { describe, expect, it } from 'vitest';
import { partitionById } from '../src/main/sync/dedupe';
import { backoffMinutes, isDueForRetry } from '../src/main/sync/dedupe';

describe('partitionById', () => {
  const rows = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];

  it('ID sudah ada di Sheets -> healed (tidak ditulis ulang)', () => {
    const res = partitionById(rows, new Set(['a']));
    expect(res.healed.map((r) => r.id)).toEqual(['a']);
    expect(res.fresh.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('semua sudah ada -> fresh kosong (AC14: tidak ada duplikat)', () => {
    const res = partitionById(rows, new Set(['a', 'b', 'c']));
    expect(res.fresh).toHaveLength(0);
    expect(res.healed).toHaveLength(3);
  });

  it('semua baru -> healed kosong', () => {
    const res = partitionById(rows, new Set());
    expect(res.fresh).toHaveLength(3);
    expect(res.healed).toHaveLength(0);
  });

  it('set kosong di Sheets (tab baru) -> semua fresh (AC13)', () => {
    const res = partitionById(rows, new Set());
    expect(res.fresh.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('backoff eksponensial (PRD §7.4.3 poin 8: 1 -> 5 -> 15 -> 60 menit)', () => {
  it('urutan backoff benar', () => {
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(1)).toBe(5);
    expect(backoffMinutes(2)).toBe(15);
    expect(backoffMinutes(3)).toBe(60);
    expect(backoffMinutes(10)).toBe(60); // maksimum
  });

  it('belum pernah dicoba -> langsung due', () => {
    expect(isDueForRetry(null, 0)).toBe(true);
  });

  it('baru saja dicoba -> belum due', () => {
    const now = Date.now();
    expect(isDueForRetry(new Date(now - 10_000).toISOString(), 0, now)).toBe(false);
  });

  it('sudah melewati backoff -> due lagi', () => {
    const now = Date.now();
    expect(isDueForRetry(new Date(now - 2 * 60_000).toISOString(), 0, now)).toBe(true);
  });
});
