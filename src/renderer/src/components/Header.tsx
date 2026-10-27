// Header: logo sekolah, brand, kasir aktif (dropdown daftar hadir hari ini), chip status sinkron,
// toggle tema terang/gelap (v1.0.1).
import { useEffect, useState, type ReactElement } from 'react';
import type { AttendanceEntry, Student, SyncStatusInfo } from '@shared/types';
import logoUrl from '../assets/logo-sekolah.webp';

interface Props {
  storeName: string;
  attendees: AttendanceEntry[];
  activeCashier: Student | null;
  onPickCashier: (studentId: string) => void;
  syncInfo: SyncStatusInfo | null;
  syncRunning: boolean;
  onOpenSync: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function syncChipText(info: SyncStatusInfo | null, running: boolean): string {
  if (running) return 'Sinkron: sedang berjalan...';
  if (!info) return 'Sinkron: ...';
  const n = info.transactions.pending + info.transactions.failed + info.daily.pending + info.daily.failed;
  const t = info.last_sync_at ? info.last_sync_at.slice(11, 16) : 'belum pernah';
  return `Sinkron: ${n} menunggu · terakhir ${t}`;
}

export default function Header(props: Props): ReactElement {
  const {
    storeName, attendees, activeCashier, onPickCashier, syncInfo, syncRunning, onOpenSync,
    theme, onToggleTheme,
  } = props;
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = (): void => setClock(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const fail = (syncInfo?.transactions.failed ?? 0) + (syncInfo?.daily.failed ?? 0);
  const cls = syncRunning ? 'st-running' : fail > 0 ? 'st-fail' : 'st-ok';

  return (
    <header className="header">
      <div className="brand">
        <img src={logoUrl} alt="Logo sekolah" />
        <div>
          {storeName || 'GreenMart'}
          <small>Kasir Koperasi Sekolah · {clock}</small>
        </div>
      </div>
      <div className="header-spacer" />
      <div className="cashier-box">
        <label htmlFor="cashier-select">Kasir aktif</label>
        <select
          id="cashier-select"
          value={activeCashier?.id ?? ''}
          onChange={(e) => onPickCashier(e.target.value)}
        >
          <option value="">— (tanpa kasir)</option>
          {attendees.map((a) => (
            <option key={a.student_id} value={a.student_id}>
              {a.name} · {a.class_name}
            </option>
          ))}
        </select>
      </div>
      <button className={`sync-chip ${cls}`} onClick={onOpenSync} title="Buka detail sinkronisasi (F8)">
        <span className="dot" />
        {syncChipText(syncInfo, syncRunning)}
      </button>
      <button
        className="theme-toggle"
        onClick={onToggleTheme}
        title="Ganti tema (terang/gelap)"
        aria-label="Ganti tema"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </header>
  );
}
