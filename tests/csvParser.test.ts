// Test parser CSV siswa (PRD F3, AC10-AC11).
import { describe, expect, it } from 'vitest';
import { parseStudentsCsv, detectDelimiter, cleanNisn } from '../src/main/csv/importStudents';

const TAB_CSV = [
  'Kelas\tNIS\tNISN\tNAMA\tJenisKelamin',
  "XIPM\t12777\t'0103133511\tAIDA ZULFA KHASNA\tP",
  "XIPM\t12778\t'0103133512\tBUDI SANTOSO\tL",
  "XIIPA1\t12801\t'0103133520\tCITRA DEWI\tP",
].join('\n');

const COMMA_CSV = [
  'Kelas,NIS,NISN,NAMA,JenisKelamin',
  "XIPM,12777,'0103133511,AIDA ZULFA KHASNA,P",
  "XIPM,12778,'0103133512,BUDI SANTOSO,L",
  "XIIPA1,12801,'0103133520,CITRA DEWI,P",
].join('\n');

describe('detectDelimiter', () => {
  it('mendeteksi tab', () => {
    expect(detectDelimiter(TAB_CSV)).toBe('\t');
  });
  it('mendeteksi koma', () => {
    expect(detectDelimiter(COMMA_CSV)).toBe(',');
  });
});

describe('cleanNisn', () => {
  it('membuang apostrof di awal dan leading zero tetap utuh', () => {
    expect(cleanNisn("'0103133511")).toBe('0103133511');
  });
  it('membuang tanda kutip dan spasi', () => {
    expect(cleanNisn(' "0103133511" ')).toBe('0103133511');
  });
});

describe('parseStudentsCsv', () => {
  it('AC10: file delimiter tab — header dilewati, NISN leading zero utuh', () => {
    const res = parseStudentsCsv(TAB_CSV, new Set());
    expect(res.summary).toEqual({ total: 3, valid: 3, duplicates: 0, errors: 0 });
    expect(res.rows[0]).toMatchObject({
      className: 'XIPM',
      nis: '12777',
      nisn: '0103133511',
      name: 'AIDA ZULFA KHASNA',
      gender: 'P',
      status: 'valid',
    });
  });

  it('AC11: file delimiter koma + baris header juga berhasil', () => {
    const res = parseStudentsCsv(COMMA_CSV, new Set());
    expect(res.summary.valid).toBe(3);
    expect(res.rows[2]).toMatchObject({ nisn: '0103133520', name: 'CITRA DEWI', gender: 'P' });
  });

  it('menangani BOM', () => {
    const res = parseStudentsCsv('\uFEFF' + COMMA_CSV, new Set());
    expect(res.summary.valid).toBe(3);
  });

  it('duplikat dalam file: baris kedua dilewati', () => {
    const csv = [
      'Kelas,NIS,NISN,NAMA,JenisKelamin',
      "XIPM,1,'0103133511,AIDA,P",
      "XIPM,2,'0103133511,AIDA KEDUA,P",
    ].join('\n');
    const res = parseStudentsCsv(csv, new Set());
    expect(res.summary).toEqual({ total: 2, valid: 1, duplicates: 1, errors: 0 });
    expect(res.rows[1].status).toBe('duplicate');
  });

  it('duplikat dengan data existing: dilewati, bukan menimpa', () => {
    const res = parseStudentsCsv(COMMA_CSV, new Set(['0103133511']));
    expect(res.summary.valid).toBe(2);
    expect(res.summary.duplicates).toBe(1);
    expect(res.rows[0].status).toBe('duplicate');
  });

  it('gender selain P/L = baris error', () => {
    const csv = "XIPM,1,'0103133599,SISWA X,X\n";
    const res = parseStudentsCsv(csv, new Set());
    expect(res.rows[0].status).toBe('error');
    expect(res.rows[0].error).toContain('P atau L');
  });

  it('kolom kurang dari 5 = error', () => {
    const res = parseStudentsCsv('XIPM,12777,0103133511\n', new Set());
    expect(res.rows[0].status).toBe('error');
    expect(res.rows[0].error).toContain('kolom');
  });
});
