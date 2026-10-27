// Repositori tabel attendances (lokal saja — tidak disinkronkan).
import type { DB } from '../database';
import type { AttendanceEntry, AttendanceRecapRow, Gender } from '@shared/types';
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

/** Rekap kehadiran per siswa untuk satu bulan ('YYYY-MM') — v1.0.1. */
export function recapByMonth(db: DB, month: string): AttendanceRecapRow[] {
  const rows = db
    .prepare(
      `SELECT a.student_id,
              s.nisn, s.name, s.class_name, s.gender,
              a.local_date,
              MIN(a.scanned_at) AS first_scan
       FROM attendances a
       JOIN students s ON s.id = a.student_id
       WHERE substr(a.local_date, 1, 7) = ?
       GROUP BY a.student_id, a.local_date
       ORDER BY s.name COLLATE NOCASE ASC, a.local_date ASC`,
    )
    .all(month) as {
    student_id: string;
    nisn: string;
    name: string;
    class_name: string;
    gender: Gender;
    local_date: string;
    first_scan: string;
  }[];

  const byStudent = new Map<string, AttendanceRecapRow>();
  for (const r of rows) {
    let rec = byStudent.get(r.student_id);
    if (!rec) {
      rec = {
        student_id: r.student_id,
        nisn: r.nisn,
        name: r.name,
        class_name: r.class_name,
        gender: r.gender,
        days_count: 0,
        dates: [],
        avg_first_time: null,
      };
      byStudent.set(r.student_id, rec);
    }
    rec.dates.push(r.local_date);
    rec.days_count++;
  }
  // rata-rata jam datang dihitung dari menit "HH:MM" tiap hari
  for (const rec of byStudent.values()) {
    const perDate = rows.filter((r) => r.student_id === rec.student_id);
    const minutes = perDate
      .map((r) => r.first_scan.slice(11, 16))
      .filter(Boolean)
      .map((hm) => {
        const [h, m] = hm.split(':').map(Number);
        return h * 60 + m;
      });
    if (minutes.length) {
      const avg = Math.round(minutes.reduce((s, m) => s + m, 0) / minutes.length);
      const p = (n: number): string => String(n).padStart(2, '0');
      rec.avg_first_time = `${p(Math.floor(avg / 60))}:${p(avg % 60)}`;
    }
  }
  return Array.from(byStudent.values()).sort(
    (a, b) => b.days_count - a.days_count || a.name.localeCompare(b.name),
  );
}
