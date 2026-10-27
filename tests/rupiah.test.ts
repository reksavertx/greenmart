// Test formatter rupiah (PRD §14 poin 4: tanpa desimal, format Rp12.500).
import { describe, expect, it } from 'vitest';
import { rupiah } from '../src/shared/format';

describe('rupiah', () => {
  it('format dasar dengan pemisah ribuan titik', () => {
    expect(rupiah(12500)).toBe('Rp12.500');
  });

  it('tanpa desimal — pecahan dibulatkan', () => {
    expect(rupiah(12500.6)).toBe('Rp12.501');
    expect(rupiah(12500.4)).toBe('Rp12.500');
  });

  it('nol dan angka kecil', () => {
    expect(rupiah(0)).toBe('Rp0');
    expect(rupiah(500)).toBe('Rp500');
  });

  it('angka jutaan', () => {
    expect(rupiah(1250000)).toBe('Rp1.250.000');
  });
});
