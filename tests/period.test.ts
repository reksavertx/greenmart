// Test util periode laporan (v1.0.1).
import { describe, expect, it } from 'vitest';
import { diffDays, monthRange, weekRange } from '../src/shared/period';

describe('period', () => {
  it('diffDays: selisih hari kalender', () => {
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(diffDays('2026-01-01', '2026-01-03')).toBe(2);
    expect(diffDays('2026-01-03', '2026-01-01')).toBe(-2);
    expect(diffDays('2026-01-31', '2026-02-01')).toBe(1);
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2); // tahun kabisat
  });

  it('weekRange: minggu Senin-Minggu', () => {
    // 2026-01-05 adalah Senin
    expect(weekRange('2026-01-05')).toEqual({ start: '2026-01-05', end: '2026-01-11' });
    // 2026-01-07 Rabu → minggu yang sama
    expect(weekRange('2026-01-07')).toEqual({ start: '2026-01-05', end: '2026-01-11' });
    // 2026-01-04 adalah Minggu → minggu sebelumnya
    expect(weekRange('2026-01-04')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
    // 2026-01-01 Kamis → minggu Senin 2025-12-29
    expect(weekRange('2026-01-01')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
  });

  it('monthRange: akhir bulan benar (inkl. kabisat)', () => {
    expect(monthRange('2026-01')).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' }); // kabisat
    expect(monthRange('2026-04')).toEqual({ start: '2026-04-01', end: '2026-04-30' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});
