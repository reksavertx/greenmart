// F6 — Stok opname: catat selisih stok fisik vs sistem; TIDAK mengubah stok (v1.0.1).
// Siklus jaga X hari: opname 'awal' pagi hari ke-1, opname 'akhir' di hari terakhir jaga.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { StockOpnameDetail, StockOpnameSummary } from '@shared/types';
import { rupiah } from '@shared/format';
import { useToast } from '../lib/toast';
import { beepError, beepOk } from '../lib/beep';
import Modal from '../components/Modal';

export default function OpnameScreen({ onFinished }: { onFinished: () => void }): ReactElement {
  const toast = useToast();
  const [current, setCurrent] = useState<StockOpnameDetail | null>(null);
  const [history, setHistory] = useState<StockOpnameSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const [c, h] = await Promise.all([window.api.opnameCurrent(), window.api.opnameHistory()]);
    setCurrent(c);
    setHistory(h);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = async (phase: 'awal' | 'akhir'): Promise<void> => {
    setBusy(true);
    try {
      const d = await window.api.opnameStart(phase);
      setCurrent(d);
      toast.ok(`Sesi opname ${phase} dimulai — ${d.total_count} produk disnapshot.`);
    } catch (e) {
      beepError();
      toast.error(e instanceof Error ? e.message : 'Gagal memulai opname.');
    } finally {
      setBusy(false);
    }
  };

  const setPhysical = async (itemId: string, raw: string): Promise<void> => {
    const qty = raw.trim() === '' ? null : Number(raw);
    try {
      const updated = await window.api.opnameSetPhysical(itemId, qty);
      setCurrent((cur) =>
        cur
          ? {
              ...cur,
              items: cur.items.map((i) => (i.id === itemId ? updated : i)),
              filled_count: cur.items.filter((i) => (i.id === itemId ? updated.physical_stock !== null : i.physical_stock !== null)).length,
              diff_items: cur.items.filter((i) => (i.id === itemId ? (updated.diff_qty ?? 0) !== 0 : (i.diff_qty ?? 0) !== 0)).length,
              diff_value_total: cur.items.reduce((s, i) => s + (i.id === itemId ? (updated.diff_value ?? 0) : (i.diff_value ?? 0)), 0),
            }
          : cur,
      );
    } catch (e) {
      beepError();
      toast.error(e instanceof Error ? e.message : 'Input tidak valid.');
    }
  };

  const fillSystem = async (): Promise<void> => {
    if (!current) return;
    setBusy(true);
    try {
      const n = await window.api.opnameFillSystem(current.id);
      toast.ok(`${n} produk kosong diisi stok sistem (selisih 0).`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!confirmId) return;
    setBusy(true);
    try {
      await window.api.opnameConfirm(confirmId);
      beepOk();
      toast.ok('Opname dikonfirmasi. Stok sistem tidak diubah — selisih hanya tercatat.');
      setConfirmId(null);
      await refresh();
      onFinished();
    } catch (e) {
      beepError();
      toast.error(e instanceof Error ? e.message : 'Gagal mengonfirmasi opname.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!current) return;
    setBusy(true);
    try {
      await window.api.opnameCancel(current.id);
      toast.info('Draft opname dibatalkan.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Stok Opname</h2>
        <div className="header-spacer" />
        {!current && (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => void start('awal')}>
              📦 Mulai Opname Awal
            </button>
            <button className="btn" disabled={busy} onClick={() => void start('akhir')} title="Opname penutup siklus jaga">
              🏁 Mulai Opname Akhir
            </button>
          </>
        )}
      </div>

      <div className="notice-banner info">
        <span>ℹ️</span>
        <span className="grow">
          Opname <b>hanya mencatat</b> selisih stok fisik vs sistem (beserta nilainya) — stok sistem{' '}
          <b>tidak diubah</b>. Petugas otomatis dari siswa yang absen hari ini.
        </span>
      </div>

      {current && (
        <div className="panel">
          <div className="panel-pad" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`phase-pill phase-${current.phase}`}>{current.phase}</span>
            <b>{current.local_date}</b>
            <span className="muted">Petugas: {current.petugas || '—'}</span>
            <span className="badge badge-ok">
              {current.filled_count}/{current.total_count} terisi
            </span>
            <span className={current.diff_value_total === 0 ? 'badge badge-ok' : 'badge badge-low'}>
              selisih: {current.diff_items} item · {rupiah(current.diff_value_total)}
            </span>
            <div className="header-spacer" />
            <button className="btn" disabled={busy} onClick={() => void fillSystem()}>
              Isi Kosong = Stok Sistem
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || current.filled_count < current.total_count}
              onClick={() => setConfirmId(current.id)}
              title={current.filled_count < current.total_count ? 'Isi semua stok fisik dulu' : ''}
            >
              ✅ Konfirmasi
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={() => void cancel()}>
              Batalkan
            </button>
          </div>
          <div className="table-wrap" style={{ maxHeight: '52vh', overflow: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Nama Produk</th>
                  <th className="num">Harga</th>
                  <th className="num">Stok Sistem</th>
                  <th style={{ width: 130 }}>Stok Fisik</th>
                  <th className="num">Selisih</th>
                  <th className="num">Nilai Selisih</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((it) => {
                  const diff = it.diff_qty ?? null;
                  return (
                    <tr key={it.id}>
                      <td className="mono">{it.barcode}</td>
                      <td><b>{it.product_name}</b></td>
                      <td className="num">{rupiah(it.price)}</td>
                      <td className="num">{it.system_stock}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          style={{ minHeight: 38 }}
                          defaultValue={it.physical_stock ?? ''}
                          onBlur={(e) => {
                            if (String(it.physical_stock ?? '') !== e.target.value) {
                              void setPhysical(it.id, e.target.value);
                            }
                          }}
                          placeholder="—"
                        />
                      </td>
                      <td className={`num ${diff === null ? 'muted' : diff > 0 ? 'opname-diff-pos' : diff < 0 ? 'opname-diff-neg' : 'muted'}`}>
                        {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td className="num muted">{it.diff_value === null ? '—' : rupiah(it.diff_value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-pad"><h3 style={{ margin: 0 }}>Riwayat Opname</h3></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Fase</th>
                <th>Petugas</th>
                <th>Status</th>
                <th className="num">Item</th>
                <th className="num">Selisih</th>
                <th className="num">Nilai Selisih</th>
                <th>Sinkron</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.local_date}</td>
                  <td><span className={`phase-pill phase-${h.phase}`}>{h.phase}</span></td>
                  <td className="muted">{h.petugas || '—'}</td>
                  <td>
                    {h.status === 'done' ? (
                      <span className="badge badge-ok">selesai</span>
                    ) : (
                      <span className="badge badge-low">draft</span>
                    )}
                  </td>
                  <td className="num">{h.total_items ?? 0}</td>
                  <td className="num">{h.diff_items ?? 0}</td>
                  <td className="num">{rupiah(h.diff_value_total ?? 0)}</td>
                  <td>{h.synced_at ? '✅' : h.status === 'done' ? '⏳' : '—'}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <div className="ico">📦</div>
                      Belum ada sesi opname. Mulai dengan tombol di atas.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmId && (
        <Modal
          title="Konfirmasi opname?"
          onClose={() => setConfirmId(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmId(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>
                Ya, Konfirmasi
              </button>
            </>
          }
        >
          <p>
            Semua stok fisik sudah terisi. Setelah dikonfirmasi, sesi <b>terkunci</b> dan dijadwalkan
            sinkron ke tab <b>Stok Opname</b> di Google Sheets.
          </p>
          <p className="muted">Stok sistem tidak diubah — keputusan penyesuaian stok tetap di tangan pengurus.</p>
        </Modal>
      )}
    </div>
  );
}
