// Dialog detail sinkronisasi (F8) — status per tabel, error terakhir, retry, buka spreadsheet.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { SyncStatusInfo } from '@shared/types';
import Modal from './Modal';
import { useToast } from '../lib/toast';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SyncDialog({ open, onClose }: Props): ReactElement | null {
  const toast = useToast();
  const [info, setInfo] = useState<SyncStatusInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setInfo(await window.api.syncStatus());
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const off = window.api.onSyncStatus((i) => setInfo(i));
    const offRun = window.api.onSyncRunning((r) => {
      if (!r) void refresh();
    });
    return () => {
      off();
      offRun();
    };
  }, [open, refresh]);

  if (!open) return null;

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>): Promise<void> => {
    setBusy(true);
    try {
      const res = await fn();
      (res.ok ? toast.ok : toast.error)(res.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Sinkronisasi Google Sheets"
      onClose={onClose}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={() => void run(() => window.api.syncRetryFailed())}>
            Coba Ulang Semua Failed
          </button>
          <button className="btn" onClick={() => void window.api.syncOpenSheet()}>
            Buka Spreadsheet
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => window.api.syncNow())}>
            Sinkronisasi Sekarang
          </button>
        </>
      }
    >
      {!info ? (
        <p className="muted">Memuat status…</p>
      ) : (
        <>
          <table className="data">
            <thead>
              <tr>
                <th>Tabel</th>
                <th className="num">Pending</th>
                <th className="num">Failed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Transaksi (+detail)</td>
                <td className="num">{info.transactions.pending}</td>
                <td className="num">{info.transactions.failed}</td>
              </tr>
              <tr>
                <td>Ringkasan Harian</td>
                <td className="num">{info.daily.pending}</td>
                <td className="num">{info.daily.failed}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            Sinkron terakhir: {info.last_sync_at ?? 'belum pernah'} · status:{' '}
            {info.running ? 'sedang berjalan' : 'idle'}
          </p>
          <h3 style={{ marginBottom: 6 }}>Error terakhir</h3>
          {info.recent_errors.length === 0 ? (
            <p className="muted">Tidak ada error tercatat. 🎉</p>
          ) : (
            <table className="data">
              <tbody>
                {info.recent_errors.map((e) => (
                  <tr key={e.id}>
                    <td style={{ width: 130 }} className="mono muted">{e.created_at.slice(11, 19)}</td>
                    <td style={{ width: 110 }}>{e.scope}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{ marginTop: 12 }}>
            Sync berjalan otomatis saat aplikasi dinyalakan, tiap interval (diatur di Pengaturan), saat
            internet kembali, dan saat tombol ditekan. Data tetap tersimpan lokal walau gagal sinkron.
          </p>
        </>
      )}
    </Modal>
  );
}
