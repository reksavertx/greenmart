// Repositori tabel attendances (lokal saja — tidak disinkronkan).
import type { DB } from '../database';
import type { AttendanceEntry } from '@shared/types';
import { uuid } from '../../util/uuid';
import { toIsoLocal, localDate } from '../../util/time';

export function recordAttendance(db: DB, studentId: string): { scanned_at: string } {
  const now = toIsoLocal();
  db.prepare(
    'INSERT INTO attendances (id, student_id, scanned_at, local_date) VALUES (?, ?, ?, ?)',
  ).run(uuid(), studentId, now, localDate());
  return { scanned_at: now };
}

export function listAttendanceByDate(db: DB, date: string): AttendanceEntry[] {
  return db
    .prepare(
      `SELECT a.student_id,
              s.nisn, s.name, s.class_name, s.gender,
              MIN(a.scanned_at) AS first_scan,
              MAX(a.scanned_at) AS last_scan,
              COUNT(*)          AS scan_count
       FROM attendances a
       JOIN students s ON s.id = a.student_id
       WHERE a.local_date = ?
       GROUP BY a.student_id
       ORDER BY s.name COLLATE NOCASE ASC`,
    )
    .all(date) as AttendanceEntry[];
}
