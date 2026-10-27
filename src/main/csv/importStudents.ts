// Parser CSV siswa — toleran sesuai PRD F3:
// - delimiter koma ATAU tab (terdeteksi per file, konsisten)
// - buang BOM, trim spasi
// - buang apostrof/tanda kutip di awal NISN (artefak Excel leading zero)
// - NISN disimpan sebagai TEXT; gender dinormalisasi ke P/L (selain itu = baris error)
// - baris header dilewati
// - NISN duplikat (dalam file / dengan data existing) -> baris kedua dilewati
import type { Gender, ImportPreview, ImportRow } from '@shared/types';

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export function detectDelimiter(text: string): '\t' | ',' {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let tabs = 0;
  let commas = 0;
  for (const line of lines.slice(0, 10)) {
    tabs += (line.match(/\t/g) ?? []).length;
    commas += (line.match(/,/g) ?? []).length;
  }
  return tabs >= commas ? '\t' : ',';
}

/** Buang apostrof/kutip di awal & akhir NISN lalu trim: "'0103133511" -> "0103133511" */
export function cleanNisn(raw: string): string {
  return raw
    .trim()
    .replace(/^['"]+/, '')
    .replace(/['"]+$/, '')
    .trim();
}

function isHeader(fields: string[]): boolean {
  const first = fields[0].trim().toLowerCase();
  return first === 'kelas' || first === 'kelas,' || ['nis', 'nisn', 'nama'].includes(first);
}

export function parseStudentsCsv(text: string, existingNisns: Set<string>): ImportPreview {
  const delim = detectDelimiter(text);
  const lines = stripBom(text).split(/\r?\n/);
  const rows: ImportRow[] = [];
  const seen = new Set<string>();

  let total = 0;
  let valid = 0;
  let duplicates = 0;
  let errors = 0;

  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    if (!rawLine.trim()) return;

    const fields = rawLine.split(delim);
    if (fields.length < 5) {
      total++;
      errors++;
      rows.push({
        line,
        className: '',
        nis: '',
        nisn: '',
        name: '',
        gender: '',
        status: 'error',
        error: `Jumlah kolom (${fields.length}) kurang dari 5 — delimiter mungkin salah.`,
      });
      return;
    }
    if (fields.length > 5) {
      total++;
      errors++;
      rows.push({
        line,
        className: '',
        nis: '',
        nisn: '',
        name: '',
        gender: '',
        status: 'error',
        error: `Jumlah kolom (${fields.length}) lebih dari 5.`,
      });
      return;
    }
    if (isHeader(fields)) return; // header dilewati, tidak dihitung

    total++;
    const className = fields[0].trim();
    const nis = cleanNisn(fields[1]);
    const nisn = cleanNisn(fields[2]);
    const name = fields[3].trim();
    const genderRaw = fields[4].trim().toUpperCase();
    const gender: Gender | '' = genderRaw === 'P' || genderRaw === 'L' ? (genderRaw as Gender) : '';

    let error: string | undefined;
    if (!nisn) error = 'NISN kosong.';
    else if (!/^\d+$/.test(nisn)) error = 'NISN harus berupa angka.';
    else if (!name) error = 'Nama kosong.';
    else if (!className) error = 'Kelas kosong.';
    else if (!gender) error = `Jenis kelamin harus P atau L (terbaca: "${fields[4].trim()}").`;

    if (error) {
      errors++;
      rows.push({ line, className, nis, nisn, name, gender, status: 'error', error });
      return;
    }
    if (seen.has(nisn) || existingNisns.has(nisn)) {
      duplicates++;
      rows.push({
        line,
        className,
        nis,
        nisn,
        name,
        gender,
        status: 'duplicate',
        error: existingNisns.has(nisn) ? 'NISN sudah ada di database — dilewati.' : 'Duplikat dalam file — baris kedua dilewati.',
      });
      return;
    }

    seen.add(nisn);
    valid++;
    rows.push({ line, className, nis, nisn, name, gender, status: 'valid' });
  });

  return { rows, summary: { total, valid, duplicates, errors } };
}
