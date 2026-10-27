// F5 — Dashboard analitik dari SQLite (PRD F5, AC19-AC20).
import { useEffect, useState, type ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardCards, HourPoint, TopProduct, TrendPoint } from '@shared/types';
import { rupiah } from '@shared/format';

const RANGES = [7, 30, 90] as const;

export default function DashboardScreen(): ReactElement {
  const [days, setDays] = useState<number>(7);
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topBy, setTopBy] = useState<'qty' | 'revenue'>('qty');
  const [top, setTop] = useState<TopProduct[]>([]);
  const [hourly, setHourly] = useState<HourPoint[]>([]);

  useEffect(() => {
    void (async () => {
      const [c, t, tp, h] = await Promise.all([
        window.api.dashboardCards(),
        window.api.dashboardTrend(days),
        window.api.dashboardTop(days, topBy),
        window.api.dashboardHourly(days),
      ]);
      setCards(c);
      setTrend(t);
      setTop(tp);
      setHourly(h);
    })();
  }, [days, topBy]);

  const maxVal = Math.max(1, ...top.map((t) => (topBy === 'qty' ? t.qty : t.revenue)));
  const hasAnyData = (cards?.transaction_count ?? 0) > 0 || trend.some((t) => t.revenue > 0);

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <div className="header-spacer" />
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map((r) => (
            <button key={r} className={`btn${days === r ? ' btn-primary' : ''}`} onClick={() => setDays(r)}>
              {r} hari
            </button>
          ))}
        </div>
      </div>

      <div className="cards">
        <div className="panel stat-card">
          <div className="t">Omzet hari ini</div>
          <div className="v">{cards ? rupiah(cards.revenue) : '…'}</div>
        </div>
        <div className="panel stat-card">
          <div className="t">Transaksi hari ini</div>
          <div className="v">{cards ? cards.transaction_count : '…'}</div>
        </div>
        <div className="panel stat-card">
          <div className="t">Item terjual hari ini</div>
          <div className="v">{cards ? cards.items_sold : '…'}</div>
        </div>
      </div>

      {!hasAnyData && (
        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <div className="empty-state">
            <div className="ico">📊</div>
            Belum ada data penjualan. Grafik akan terisi otomatis setelah transaksi pertama.
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="panel panel-pad">
          <h3 style={{ marginTop: 0 }}>Tren omzet harian ({days} hari)</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2ece6" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis fontSize={11} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip
                  formatter={(v) => rupiah(Number(v))}
                  labelFormatter={(l) => `Tanggal: ${String(l)}`}
                />
                <Bar dataKey="revenue" fill="#157a4a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel panel-pad">
          <h3 style={{ marginTop: 0 }}>Jam ramai (penjualan per jam, {days} hari)</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2ece6" />
                <XAxis dataKey="hour" fontSize={11} tickLine={false} interval={1} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v, name) => (name === 'revenue' ? rupiah(Number(v)) : v)} labelFormatter={(l) => `Jam ${String(l)}:00`} />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel panel-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Produk terlaris ({days} hari)</h3>
          <div className="header-spacer" />
          <button className={`btn${topBy === 'qty' ? ' btn-primary' : ''}`} onClick={() => setTopBy('qty')}>
            Berdasar Qty
          </button>
          <button className={`btn${topBy === 'revenue' ? ' btn-primary' : ''}`} onClick={() => setTopBy('revenue')}>
            Berdasar Omzet
          </button>
        </div>
        {top.length === 0 ? (
          <p className="muted">Belum ada penjualan pada rentang ini.</p>
        ) : (
          <ol className="top-list">
            {top.map((t, i) => {
              const val = topBy === 'qty' ? t.qty : t.revenue;
              return (
                <li key={t.name}>
                  <span className="rank">{i + 1}</span>
                  <span style={{ flex: '0 0 220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{t.name}</b>
                  </span>
                  <span className="bar-wrap">
                    <span className="bar" style={{ width: `${(val / maxVal) * 100}%` }} />
                  </span>
                  <span style={{ width: 150, textAlign: 'right' }} className={topBy === 'qty' ? 'num' : ''}>
                    {topBy === 'qty' ? `${t.qty} pcs` : rupiah(t.revenue)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
