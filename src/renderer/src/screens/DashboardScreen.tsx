// F4 — Dashboard analitik dari SQLite (PRD F5, AC19-AC20) + statistika v1.0.1:
// distribusi per kategori (batang + lingkaran), Top 7 modus, mean omzet harian,
// grafik garis omzet + kuantitas, panel stok menipis.
import { useEffect, useState, type ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CategorySlice,
  DashboardCards,
  HourPoint,
  PeriodStats,
  Product,
  TopProduct,
  TrendPoint,
} from '@shared/types';
import { rupiah } from '@shared/format';

const RANGES = [7, 30, 90] as const;
const PIE_COLORS = ['#157a4a', '#0ea5e9', '#b45309', '#7c3aed', '#db2777', '#65a30d', '#dc2626'];

export default function DashboardScreen(): ReactElement {
  const [days, setDays] = useState<number>(7);
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topBy, setTopBy] = useState<'qty' | 'revenue'>('qty');
  const [top, setTop] = useState<TopProduct[]>([]);
  const [hourly, setHourly] = useState<HourPoint[]>([]);
  const [byCategory, setByCategory] = useState<CategorySlice[]>([]);
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [lowThreshold, setLowThreshold] = useState(5);

  useEffect(() => {
    void (async () => {
      const [c, t, tp, h, cat, st] = await Promise.all([
        window.api.dashboardCards(),
        window.api.dashboardTrend(days),
        window.api.dashboardTop(days, topBy),
        window.api.dashboardHourly(days),
        window.api.dashboardByCategory(days),
        window.api.dashboardStats(days),
      ]);
      setCards(c);
      setTrend(t);
      setTop(tp.slice(0, 7));
      setHourly(h);
      setByCategory(cat);
      setStats(st);
    })();
  }, [days, topBy]);

  useEffect(() => {
    void (async () => {
      const [items, s] = await Promise.all([window.api.dashboardLowStock(), window.api.settingsAll()]);
      setLowStock(items);
      setLowThreshold(Number(s.low_stock_alert ?? '5') || 5);
    })();
  }, []);

  const maxVal = Math.max(1, ...top.map((t) => (topBy === 'qty' ? t.qty : t.revenue)));
  const catMax = Math.max(1, ...byCategory.map((c) => c.revenue));
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

      <div className="cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="panel stat-card">
          <div className="t">Omzet hari ini</div>
          <div className="v">{cards ? rupiah(cards.revenue) : '...'}</div>
        </div>
        <div className="panel stat-card">
          <div className="t">Transaksi hari ini</div>
          <div className="v">{cards ? cards.transaction_count : '...'}</div>
        </div>
        <div className="panel stat-card">
          <div className="t">Item terjual hari ini</div>
          <div className="v">{cards ? cards.items_sold : '...'}</div>
        </div>
        <div className="panel stat-card">
          <div className="t">Rata-rata omzet/hari ({days} hari)</div>
          <div className="v">{stats ? rupiah(stats.mean_daily_revenue) : '...'}</div>
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
          <h3 style={{ marginTop: 0 }}>Omzet & kuantitas harian ({days} hari)</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e2ece6)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rp"
                  fontSize={11}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <YAxis yAxisId="qty" orientation="right" fontSize={11} />
                <Tooltip
                  formatter={(v, name) =>
                    name === 'revenue' ? rupiah(Number(v)) : `${v} pcs`
                  }
                  labelFormatter={(l) => `Tanggal: ${String(l)}`}
                />
                <Legend />
                <Line yAxisId="rp" dataKey="revenue" name="Omzet" stroke="#157a4a" strokeWidth={2} dot={false} />
                <Line yAxisId="qty" dataKey="qty" name="Kuantitas (pcs)" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel panel-pad">
          <h3 style={{ marginTop: 0 }}>Jam ramai (penjualan per jam, {days} hari)</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e2ece6)" />
                <XAxis dataKey="hour" fontSize={11} tickLine={false} interval={1} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v, name) => (name === 'revenue' ? rupiah(Number(v)) : v)} labelFormatter={(l) => `Jam ${String(l)}:00`} />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* Batang per kategori */}
        <div className="panel panel-pad">
          <h3 style={{ marginTop: 0 }}>Penjualan per kategori ({days} hari)</h3>
          {byCategory.length === 0 ? (
            <p className="muted">Belum ada penjualan pada rentang ini.</p>
          ) : (
            <ul className="cat-list">
              {byCategory.map((c, i) => (
                <li key={c.category}>
                  <div className="lbl">
                    <span><b>{c.category}</b> · {c.qty} pcs</span>
                    <span className="num">{rupiah(c.revenue)}</span>
                  </div>
                  <div className="bar-wrap">
                    <div
                      className="bar"
                      style={{ width: `${(c.revenue / catMax) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lingkaran (pie) per kategori */}
        <div className="panel panel-pad">
          <h3 style={{ marginTop: 0 }}>Proporsi kategori ({days} hari)</h3>
          {byCategory.length === 0 ? (
            <p className="muted">Belum ada penjualan pada rentang ini.</p>
          ) : (
            <>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="revenue"
                      nameKey="category"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      {byCategory.map((c, i) => (
                        <Cell key={c.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => rupiah(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend">
                {byCategory.map((c, i) => (
                  <span key={c.category}>
                    <span className="swatch" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {c.category}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel panel-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Modus produk terlaris — Top 7 ({days} hari)</h3>
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

      <div className="panel panel-pad" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>⚠️ Stok menipis (≤ {lowThreshold})</h3>
        {lowStock.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>Semua stok aman.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Nama</th>
                  <th className="num">Sisa stok</th>
                  <th className="num">Harga</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.barcode}</td>
                    <td><b>{p.name}</b></td>
                    <td className="num">
                      <span className={`badge ${p.stock === 0 ? 'badge-out' : 'badge-low'}`}>{p.stock}</span>
                    </td>
                    <td className="num">{rupiah(p.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
