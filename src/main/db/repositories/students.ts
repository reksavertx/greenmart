// Repositori tabel students.
import type { DB } from '../database';
import type { Gender, Student } from '@shared/types';
import { uuid } from '../../util/uuid';
import { toIsoLocal } from '../../util/time';

export function getStudentByNisn(db: DB, nisn: string): Student | null {
  return (db.prepare('SELECT * FROM students WHERE nisn = ?').get(nisn) as Student | undefined) ?? null;
}

export function getStudentById(db: DB, id: string): Student | null {
  return (db.prepare('SELECT * FROM students WHERE id = ?').get(id) as Student | undefined) ?? null;
}

export interface NewStudentRow {
  className: string;
  nis: string;
  nisn: string;
  name: string;
  gender: Gender;
}

/** Insert transactional; NISN duplikat dilewati (bukan menimpa). */
export function insertStudents(
  db: DB,
  rows: NewStudentRow[],
): { inserted: number; skipped: number } {
  const now = toIsoLocal();
  let inserted = 0;
  let skipped = 0;
  const insert = db.prepare(
    `INSERT INTO students (id, nis, nisn, name, gender, class_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const exists = db.prepare('SELECT 1 FROM students WHERE nisn = ?');
  const run = db.transaction((list: NewStudentRow[]) => {
    for (const r of list) {
      if (exists.get(r.nisn)) {
        skipped++;
        continue;
      }
      insert.run(uuid(), r.nis || null, r.nisn, r.name, r.gender, r.className, now, now);
      inserted++;
    }
  });
  run(rows);
  return { inserted, skipped };
}
