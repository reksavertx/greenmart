// Test routing scan (PRD F1.2, AC3).
import { describe, expect, it } from 'vitest';
import { routeScan, normalizeNisn } from '../src/shared/scanRouting';
import type { ScanProductRef, ScanStudentRef } from '../src/shared/types';

const product: ScanProductRef = {
  id: 'p1',
  barcode: '8998866200011',
  name: 'Chiki Jagung',
  price: 5000,
  stock: 20,
  is_active: 1,
};

const student: ScanStudentRef = {
  id: 's1',
  nisn: '0103133511',
  name: 'AIDA ZULFA KHASNA',
  class_name: 'XIPM',
  gender: 'P',
};

function lookup(barcodeHit: string | null, nisnHit: string | null) {
  return {
    findProduct: (bc: string) => (bc === barcodeHit ? product : null),
    findStudent: (n: string) => (n === nisnHit ? student : null),
  };
}

describe('normalizeNisn', () => {
  it('mengambil digit saja', () => {
    expect(normalizeNisn("'0103133511")).toBe('0103133511');
    expect(normalizeNisn('abc123def45')).toBe('12345');
  });
});

describe('routeScan mode kasir', () => {
  it('produk ditemukan -> product', () => {
    const res = routeScan('8998866200011', 'kasir', lookup('8998866200011', '0103133511'));
    expect(res).toEqual({ type: 'product', product });
  });

  it('bukan produk tapi NISN -> student', () => {
    const res = routeScan('0103133511', 'kasir', lookup(null, '0103133511'));
    expect(res).toEqual({ type: 'student', student });
  });

  it('NISN dengan karakter non-digit (apostrof) tetap dikenali', () => {
    const res = routeScan("'0103133511", 'kasir', lookup(null, '0103133511'));
    expect(res).toEqual({ type: 'student', student });
  });

  it('tidak keduanya -> unknown dengan kode asli (AC3)', () => {
    const res = routeScan('999999', 'kasir', lookup(null, null));
    expect(res).toEqual({ type: 'unknown', code: '999999' });
  });

  it('buffer kosong -> empty', () => {
    expect(routeScan('', 'kasir', lookup(null, null))).toEqual({ type: 'empty' });
    expect(routeScan('   ', 'kasir', lookup(null, null))).toEqual({ type: 'empty' });
  });

  it('prioritas: barcode menang sebelum NISN di mode kasir', () => {
    // kode 8998866200011 tidak cocok NISN mana pun, tapi urutan tetap diuji:
    const res = routeScan('8998866200011', 'kasir', {
      findProduct: (bc) => (bc === '8998866200011' ? product : null),
      findStudent: () => student,
    });
    expect(res.type).toBe('product');
  });
});

describe('routeScan mode absensi', () => {
  it('NISN diprioritaskan sebelum produk', () => {
    const res = routeScan('0103133511', 'absensi', {
      findProduct: () => product, // produk "selalu match" — NISN tetap harus menang
      findStudent: (n) => (n === '0103133511' ? student : null),
    });
    expect(res.type).toBe('student');
  });

  it('bukan NISN -> cek produk', () => {
    const res = routeScan('8998866200011', 'absensi', {
      findProduct: (bc) => (bc === '8998866200011' ? product : null),
      findStudent: () => null,
    });
    expect(res).toEqual({ type: 'product', product });
  });

  it('tidak keduanya -> unknown', () => {
    const res = routeScan('X1', 'absensi', lookup(null, null));
    expect(res).toEqual({ type: 'unknown', code: 'X1' });
  });
});
