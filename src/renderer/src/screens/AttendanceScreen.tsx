// F3 — Absensi jaga kasir via NISN + import CSV siswa (PRD F3, AC10-AC12) + rekap bulanan (v1.0.1).
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AttendanceEntry, AttendanceRecapRow, ImportPreview, ScanIdentity } from '@shared/types';
import { useScanEngine } from '../lib/useScanEngine';
import { beepError, beepOk, beepWarn } from '../lib/beep';
import { useToast } from '../lib/toast';
import Modal from '../components/Modal';

function today(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function thisMonth(): string {
  return today().slice(0, 7);
}

export default function AttendanceScreen({ onCashierChanged }: { onCashierChanged: () => void }): ReactElement {
  const toast = useToast();
  const [tab, setTab] = useState<'harian' | 'rekap'>('harian');
  const [card, setCard] = useState<ScanIdentity | null>(null);
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [recapMonth, setRecapMonth] = useState(thisMonth());
  const [recap, setRecap] = useState<AttendanceRecapRow[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (d: string) => {
    setEntries(await window.api.attendanceByDate(d));
  }, []);

  useEffect(() => {
    void refresh(date);
  }, [date, refresh]);

  useEffect(() => {
    if (tab !== 'rekap') return;
    void window.api.attendanceRecap(recapMonth).then(setRecap);
  }, [tab, recapMonth]);

  const handleStudent = useCallback(
    async (s: { id: string; nisn: string; name: string; class_name: string; gender: 'P' | 'L' }) => {
      try {
        const identity = await window.api.attendanceRecord(s.id);
        beepOk();
        setCard(identity);
        onCashierChanged();
        void refresh(date);
      } catch (e) {
        beepError();
        toast.error(e instanceof Error ? e.message : 'Gagal mencatat absensi.');
      }
    },
    [date, onCashierChanged, refresh, toast],
  );

  const { buffer } = useScanEngine({
    active: true,
    blocked: importOpen,
    mode: 'absensi',
    handlers: {
      onProduct: (p) => {
        beepWarn();
        toast.info(`"${p.name}" discan di mode Absensi — pindah ke Kasir (F1) untuk menjual.`);
      },
      onStudent: (s) => void handleStudent(s),
      onUnknown: (code) => {
        beepWarn();
        toast.warn(`NISN/kode "${code}" tidak ditemukan — import CSV siswa dulu.`);
      },
    },
  });

  const pickAndPreview = async (): Promise<void> => {
    const file = await window.api.pickCsvFile();
    if (!file) return;
    setBusy(true);
    try {
      const pv = await window.api.importPreviewCsv(file.content);
      setPreview(pv);
      setFileName(file.fileName);
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async (): Promise<void> => {
    if (!preview) return;
    const valid = preview.rows.filter((r) => r.status === 'valid');
    if (!valid.length) return void toast.warn('Tidak ada baris valid untuk diimpor.');
    setBusy(true);
    try {
      const res = await window.api.importCommitStudents(valid);
      beepOk();
      toast.ok(`Import selesai: ${res.inserted} siswa masuk, ${res.skipped} dilewati (duplikat).`);
      setImportOpen(false);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Mode Absensi — scan NISN untuk catat kehadiran jaga</h2>
        <div className="header-spacer" />
        <div className="scan-indicator" style={{ minWidth: 260, marginBottom: 0 }}>
          {buffer ? <span>{buffer}</span> : <span className="ph">Scan NISN…</span>}
        </div>
        <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
          ⬆ Import CSV Siswa
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'harian' ? 'active' : ''} onClick={() => setTab('harian')}>
          Hari Ini / Per Tanggal
        </button>
        <button className={tab === 'rekap' ? 'active' : ''} onClick={() => setTab('rekap')}>
          Rekap Bulanan
        </button>
      </div>

      {card && (
        <div className="identity-card">
          <div className="nm">{card.name}</div>
          <div className="meta">
            <span>Kelas: <b>{card.class_name}</b></span>
            <span>NISN: <b className="mono">{card.nisn}</b></span>
            <span>Gender: <b>{card.gender}</b></span>
            <span>Jam scan: <b>{card.scanned_at.slice(11, 19)}</b></span>
          </div>
        </div>
      )}

      {tab === 'rekap' ? (
        <div className="panel">
          <div className="panel-pad" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ fontWeight: 700 }}>Bulan:</label>
            <input
              type="month"
              style={{ width: 200 }}
              value={recapMonth}
              onChange={(e) => e.target.value && setRecapMonth(e.target.value)}
            />
            <span className="muted">{recap.length} siswa pernah absen</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Kelas</th>
                  <th>NISN</th>
                  <th className="num">Hadir (hari)</th>
                  <th className="num">Rata-rata jam datang</th>
                  <th>Tanggal hadir</th>
                </tr>
              </thead>
              <tbody>
                {recap.map((r) => (
                  <tr key={r.student_id}>
                    <td><b>{r.name}</b></td>
                    <td>{r.class_name}</td>
                    <td className="mono">{r.nisn}</td>
                    <td className="num"><span className="badge badge-ok">{r.days_count}</span></td>
                    <td className="num">{r.avg_first_time ?? '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {r.dates.map((d) => d.slice(8)).join(', ')}
                    </td>
                  </tr>
                ))}
                {recap.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <div className="ico">🗓</div>
                        Belum ada kehadiran pada bulan {recapMonth}.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-pad" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ fontWeight: 700 }}>Riwayat tanggal:</label>
            <input
              type="date"
              style={{ width: 200 }}
              value={date}
              onChange={(e) => setDate(e.target.value || today())}
            />
            <span className="muted">{entries.length} siswa tercatat</span>
          </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Kelas</th>
                <th>NISN</th>
                <th>Jam pertama</th>
                <th>Jam terakhir</th>
                <th className="num">Jumlah scan</th>
                <th style={{ width: 190 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((a) => (
                <tr key={a.student_id}>
                  <td><b>{a.name}</b></td>
                  <td>{a.class_name}</td>
                  <td className="mono">{a.nisn}</td>
                  <td>{a.first_scan.slice(11, 19)}</td>
                  <td>{a.last_scan.slice(11, 19)}</td>
                  <td className="num">{a.scan_count}</td>
                  <td>
                    <button className="btn" onClick={() => void window.api.setActiveCashier(a.student_id).then(onCashierChanged)}>
                      Jadikan Kasir Aktif
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="ico">🙋</div>
                      Belum ada yang scan NISN pada tanggal ini.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {importOpen && (
        <Modal
          title="Import CSV Siswa"
          onClose={() => {
            setImportOpen(false);
            setPreview(null);
          }}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  setImportOpen(false);
                  setPreview(null);
                }}
              >
                Batal
              </button>
              <button className="btn btn-primary" disabled={!preview || busy} onClick={() => void commitImport()}>
                {preview ? `Import ${preview.summary.valid} siswa valid` : 'Import'}
              </button>
            </>
          }
        >
          <p className="muted">
            Format kolom (urutan tetap): <b>Kelas, NIS, NISN, NAMA, JenisKelamin</b> — delimiter koma atau
            tab (terdeteksi otomatis). Apostrof di depan NISN otomatis dibuang, leading zero tetap utuh.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={() => void pickAndPreview()}>
            📄 Pilih File CSV…
          </button>
          {fileName && <p className="mono muted" style={{ marginTop: 8 }}>{fileName}</p>}
          {preview && (
            <>
              <p style={{ marginTop: 14 }}>
                <span className="badge badge-ok">{preview.summary.valid} valid</span>{' '}
                <span className="badge badge-low">{preview.summary.duplicates} duplikat (dilewati)</span>{' '}
                <span className="badge badge-out">{preview.summary.errors} error</span>
              </p>
              <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>Kelas</th>
                      <th>NIS</th>
                      <th>NISN</th>
                      <th>Nama</th>
                      <th>JK</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r) => (
                      <tr key={r.line}>
                        <td className="muted">{r.line}</td>
                        <td>{r.className}</td>
                        <td className="mono">{r.nis}</td>
                        <td className="mono">{r.nisn}</td>
                        <td>{r.name}</td>
                        <td>{r.gender}</td>
                        <td>
                          {r.status === 'valid' && <span className="badge badge-ok">valid</span>}
                          {r.status === 'duplicate' && <span className="badge badge-low">duplikat</span>}
                          {r.status === 'error' && (
                            <span className="badge badge-out" title={r.error}>
                              error
                            </span>
                          )}
                          {r.error ? <div className="muted" style={{ fontSize: 12 }}>{r.error}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 50 && (
                <p className="muted">…dan {preview.rows.length - 50} baris lainnya.</p>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
