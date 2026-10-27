// Test logika pengingat stok opname (v1.0.1).
import { describe, expect, it } from 'vitest';
import { computeOpnameReminder, normalizeCycleDays } from '../src/shared/opname';

describe('opname reminder', () => {
  it('tanpa riwayat opname → due awal (baseline)', () => {
    const r = computeOpnameReminder(null, 3, '2026-01-10');
    expect(r.due).toBe('awal');
    expect(r.cycleDay).toBe(1);
    expect(r.lastDate).toBeNull();
  });

  it('opname terakhir HARI INI → tidak ada yang due', () => {
    expect(computeOpnameReminder({ date: '2026-01-10', phase: 'awal' }, 3, '2026-01-10').due).toBeNull();
    expect(computeOpnameReminder({ date: '2026-01-10', phase: 'akhir' }, 3, '2026-01-10').due).toBeNull();
  });

  it("setelah opname 'akhir' → opname 'awal' due besoknya (siklus baru)", () => {
    const r = computeOpnameReminder({ date: '2026-01-10', phase: 'akhir' }, 3, '2026-01-11');
    expect(r.due).toBe('awal');
    expect(r.cycleDay).toBe(1);
  });

  it("setelah opname 'awal' → 'akhir' due pada hari ke-cycleDays", () => {
    // cycleDays=3: awal hari ke-1 (2026-01-10), akhir due hari ke-3 = 2026-01-12
    expect(computeOpnameReminder({ date: '2026-01-10', phase: 'awal' }, 3, '2026-01-11').due).toBeNull();
    const r = computeOpnameReminder({ date: '2026-01-10', phase: 'awal' }, 3, '2026-01-12');
    expect(r.due).toBe('akhir');
    expect(r.cycleDay).toBe(3);
  });

  it('telat tetap nag (due tetap muncul)', () => {
    const r = computeOpnameReminder({ date: '2026-01-10', phase: 'awal' }, 3, '2026-01-15');
    expect(r.due).toBe('akhir');
    expect(r.cycleDay).toBe(6);
    const r2 = computeOpnameReminder({ date: '2026-01-10', phase: 'akhir' }, 3, '2026-01-15');
    expect(r2.due).toBe('awal');
  });

  it('siklus 2 hari: akhir due besoknya setelah awal', () => {
    expect(computeOpnameReminder({ date: '2026-01-10', phase: 'awal' }, 2, '2026-01-11').due).toBe('akhir');
  });

  it('normalizeCycleDays: clamp ke [2..31], fallback 3', () => {
    expect(normalizeCycleDays(3)).toBe(3);
    expect(normalizeCycleDays(1)).toBe(3);
    expect(normalizeCycleDays(0)).toBe(3);
    expect(normalizeCycleDays(100)).toBe(31);
    expect(normalizeCycleDays(2.7)).toBe(2);
    expect(normalizeCycleDays(NaN)).toBe(3);
  });
});
