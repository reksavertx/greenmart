// F5 — Laporan penjualan harian/mingguan/bulanan + ekspor CSV (v1.0.1).
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ReportMode, SalesReportRow } from '@shared/types';
import { rupiah } from '@shared/format';
import { weekRange, monthRange } from '@shared/period';
import { useToast } from '../lib/toast';
import { beepOk } from '../lib/beep';

function today(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function thisMonth(): string {
  return today().slice(0, 7);
}

const MODES: { key: ReportMode; label: string }[] = [
  { key: 'harian', label: 'Harian' },
  { key: 'mingguan', label: 'Mingguan' },
  { key: 'bulanan', label: 'Bulanan' },
];

function anchorLabel(mode: ReportMode, anchor: string): string {
  if (mode === 'bulanan') {
    const { start, end } = monthRange(anchor);
    return `${start} s.d. ${end}`;
  }
  if (mode === 'mingguan') {
    const { start, end } = weekRange(anchor);
    return `${start} s.d. ${end}`;
  }
  return anchor;
}

function stepAnchor(mode: ReportMode, anchor: string, delta: number): string {
  const [y, m, d] = anchor.split('-').map(Number);
  if (mode === 'bulanan') {
    const ny = delta < 0 && m === 1 ? y - 1 : delta > 0 && m === 12 ? y + 1 : y;
    const nm = ((m - 1 + delta + 12) % 12) + 1;
    return `${ny}-${String(nm).padStart(2, '0')}`;
  }
  const dt = new Date(Date.UTC(y, m - 1, d + (mode === 'mingguan' ? delta * 7 : delta)));
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export default function ReportsScreen(): ReactElement {
  const toast = useToast();
  const [mode, setMode] = useState<ReportMode>('harian');
  const [anchor, setAnchor] = useState(today());
  const [rows, setRows] = useState<SalesReportRow[]>([]);
  const [range, setRange] = useState<{ start: string; end: string }>({ start: today(), end: today() });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (m: ReportMode, a: string) => {
    const res = await window.api.reportRows(m, a);
    setRows(res.rows);
    setRange(res.range);
  }, []);

  useEffect(() => {
    void load(mode, anchor);
  }, [mode, anchor, load]);

  const exportCsv = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await window.api.reportExportCsv(mode, anchor);
      (res.ok ? beepOk : () => {})();
      (res.ok ? toast.ok : toast.warn)(res.message);
    } finally {
      setBusy(false);
    }
  };

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Laporan Penjualan</h2>
        <div className="header-spacer" />
        <div style={{ display: 'flex', gap: 6 }}>
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`btn${mode === m.key ? ' btn-primary' : ''}`}
              onClick={() => {
                setMode(m.key);
                setAnchor(m.key === 'bulanan' ? thisMonth() : today());
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={() => setAnchor(stepAnchor(mode, anchor, -1))} title="Periode sebelumnya">
          ◀ Sebelumnya
        </button>
        <input
          type={mode === 'bulanan' ? 'month' : 'date'}
          style={{ width: 200 }}
          value={anchor}
          onChange={(e) => e.target.value && setAnchor(e.target.value)}
        />
        <button className="btn" onClick={() => setAnchor(stepAnchor(mode, anchor, 1))} title="Periode berikutnya">
          Berikutnya ▶
        </button>
        <button className="btn" onClick={() => setAnchor(mode === 'bulanan' ? thisMonth() : today())}>
          Hari ini
        </button>
        <span className="range-chip">
          Periode: <b>{anchorLabel(mode, anchor)}</b>
        </span>
        <div className="header-spacer" />
        <button className="btn btn-primary" disabled={busy} onClick={() => void exportCsv()}>
          ⬇ Ekspor CSV
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Nama Produk</th>
                <th>Kategori</th>
                <th className="num">Qty</th>
                <th className="num">Omzet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.barcode}>
                  <td className="mono">{r.barcode}</td>
                  <td><b>{r.product_name}</b></td>
                  <td className="muted">{r.category_name ?? 'Tanpa Kategori'}</td>
                  <td className="num">{r.qty}</td>
                  <td className="num">{rupiah(r.revenue)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="ico">🧾</div>
                      Tidak ada penjualan pada periode {anchorLabel(mode, anchor)}.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 800 }}>TOTAL ({rows.length} produk)</td>
                  <td className="num" style={{ fontWeight: 800 }}>{totalQty}</td>
                  <td className="num" style={{ fontWeight: 800 }}>{rupiah(totalRev)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Rentang laporan: <b>{range.start}</b> s.d. <b>{range.end}</b>. Rekap per item juga tersinkron otomatis ke
        tab <b>Rekap Harian Item</b> di Google Sheets.
      </p>
    </div>
  );
}
