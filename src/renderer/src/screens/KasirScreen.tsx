// F1 — Layar Kasir: scan -> keranjang -> bayar tunai instan (PRD F1) + pencarian manual F9 (v1.0.1).
// v1.0.3: pilih printer struk langsung di overlay konfirmasi (default dari Pengaturan).
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { PaymentResult, Product, ScanStudentRef, Student } from '@shared/types';
import { PRINTER_DIALOG, type PrinterLite } from '@shared/print';
import { rupiah } from '@shared/format';
import { useScanEngine } from '../lib/useScanEngine';
import { beepCash, beepError, beepOk, beepWarn } from '../lib/beep';
import { useToast } from '../lib/toast';
import Modal from '../components/Modal';
import ProductFormModal from '../components/ProductFormModal';
import ManualSearchModal from '../components/ManualSearchModal';

interface CartLine {
  productId: string;
  barcode: string;
  name: string;
  price: number;
  qty: number;
  stock: number; // snapshot stok DB saat terakhir dilihat
}

interface Props {
  onCashierChanged: () => void;
  activeCashier: Student | null;
}

export default function KasirScreen({ onCashierChanged, activeCashier }: Props): ReactElement {
  const toast = useToast();
  const [lines, setLines] = useState<CartLine[]>([]);
  const linesRef = useRef<CartLine[]>([]);
  const setBoth = (next: CartLine[]): void => {
    linesRef.current = next;
    setLines(next);
  };

  const [selZone, setSelZone] = useState<'cart' | 'pay'>('cart');
  const [selIdx, setSelIdx] = useState(-1);
  const [confirm, setConfirm] = useState<PaymentResult | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [registerBarcode, setRegisterBarcode] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // Printer struk (v1.0.3): null = belum termuat (ikuti setting Pengaturan).
  const [printers, setPrinters] = useState<PrinterLite[]>([]);
  const [printerChoice, setPrinterChoice] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);
  // v1.0.1: pencarian manual (F9) + alert stok menipis global
  const [manualOpen, setManualOpen] = useState(false);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [lowThreshold, setLowThreshold] = useState(5);

  // Overlay konfirmasi TIDAK memblokir scan — kasir tetap bisa melayani pelanggan berikutnya
  // saat overlay masih tampil (PRD F1: "siap menerima scan berikutnya").
  const blocked = unknown !== null || registerBarcode !== null || paying || manualOpen;

  useEffect(() => {
    return () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    };
  }, []);

  // Alert stok menipis: satu angka global (setting low_stock_alert).
  useEffect(() => {
    void (async () => {
      const [items, s] = await Promise.all([window.api.dashboardLowStock(), window.api.settingsAll()]);
      setLowStock(items);
      setLowThreshold(Number(s.low_stock_alert ?? '5') || 5);
    })();
  }, []);

  const refreshLowStock = useCallback((): void => {
    void window.api.dashboardLowStock().then(setLowStock);
  }, []);

  // ---- Aksi keranjang (baca/mutasi lewat linesRef agar konsisten) ----
  const addProduct = useCallback(
    (p: { id: string; barcode: string; name: string; price: number; stock: number; is_active: number }) => {
      const cur = linesRef.current;
      const idx = cur.findIndex((l) => l.barcode === p.barcode);
      if (idx >= 0) {
        const line = cur[idx];
        if (p.stock < line.qty + 1) {
          beepWarn();
          toast.warn(`Stok ${p.name} tinggal ${p.stock} (di keranjang ${line.qty}).`);
          return;
        }
        const next = [...cur];
        next[idx] = { ...line, qty: line.qty + 1, stock: p.stock };
        setBoth(next);
        beepOk();
        return;
      }
      if (!p.is_active) {
        beepWarn();
        toast.warn(`Produk ${p.name} sedang tidak aktif.`);
        return;
      }
      if (p.stock < 1) {
        beepWarn();
        toast.warn(`Stok ${p.name} habis.`);
        return;
      }
      setBoth([
        ...cur,
        { productId: p.id, barcode: p.barcode, name: p.name, price: p.price, qty: 1, stock: p.stock },
      ]);
      beepOk();
    },
    [toast],
  );

  const handleStudent = useCallback(
    async (s: ScanStudentRef) => {
      try {
        const identity = await window.api.attendanceRecord(s.id);
        beepOk();
        toast.ok(`Absensi: ${identity.name} — ${identity.class_name} (${identity.scanned_at.slice(11, 16)})`);
        onCashierChanged();
      } catch (e) {
        beepError();
        toast.error(e instanceof Error ? e.message : 'Gagal mencatat absensi.');
      }
    },
    [onCashierChanged, toast],
  );

  const handleUnknown = useCallback(
    (code: string) => {
      beepError();
      setUnknown(code);
    },
    [],
  );

  // ---- Navigasi keyboard (PRD §8: ↓/↑ keranjang <-> tombol bayar, Del, +/-) ----
  const navDown = useCallback(() => {
    const n = linesRef.current.length;
    if (selZone === 'pay') return;
    if (n === 0) {
      setSelZone('pay');
      return;
    }
    if (selIdx + 1 >= n) setSelZone('pay');
    else setSelIdx(selIdx + 1);
  }, [selIdx, selZone]);

  const navUp = useCallback(() => {
    if (selZone === 'pay') {
      setSelZone('cart');
      setSelIdx(Math.max(linesRef.current.length - 1, 0));
      return;
    }
    setSelIdx((i) => Math.max(i - 1, 0));
  }, [selZone]);

  const removeLine = useCallback(
    (index?: number) => {
      const cur = linesRef.current;
      const idx = index ?? selIdx;
      if (idx < 0 || idx >= cur.length) return;
      const next = cur.filter((_, i) => i !== idx);
      setBoth(next);
      setSelIdx((i) => Math.min(i, next.length - 1));
      if (next.length === 0) setSelZone('pay');
    },
    [selIdx],
  );

  const changeQty = useCallback(
    (delta: 1 | -1, index?: number) => {
      const cur = linesRef.current;
      const idx = index ?? selIdx;
      if (idx < 0 || idx >= cur.length) return;
      const line = cur[idx];
      const newQty = line.qty + delta;
      if (newQty <= 0) {
        removeLine(idx);
        return;
      }
      if (delta > 0 && line.stock < newQty) {
        beepWarn();
        toast.warn(`Stok ${line.name} tinggal ${line.stock}.`);
        return;
      }
      const next = [...cur];
      next[idx] = { ...line, qty: newQty };
      setBoth(next);
    },
    [removeLine, selIdx, toast],
  );

  /** Muat daftar printer + setting printer aktif (dipanggil saat mount & saat overlay muncul). */
  const loadPrinters = useCallback(async (): Promise<void> => {
    try {
      const [list, settings] = await Promise.all([window.api.printersList(), window.api.settingsAll()]);
      setPrinters(list);
      setPrinterChoice(settings.receipt_printer ?? '');
    } catch {
      setPrinterChoice((c) => c ?? '');
    }
  }, []);

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  // ---- Bayar tunai instan (uang pas) ----
  const pay = useCallback(async () => {
    const cur = linesRef.current;
    if (!cur.length) return; // keranjang kosong -> tidak melakukan apa-apa (PRD F1)
    setPaying(true);
    try {
      const res = await window.api.createTransaction(cur.map((l) => ({ barcode: l.barcode, qty: l.qty })));
      beepCash();
      setBoth([]);
      setSelZone('cart');
      setSelIdx(-1);
      setConfirm(res);
      void loadPrinters(); // segarkan daftar printer (mis. baru dicolok) untuk overlay
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirm(null), 3000);
    } catch (e) {
      beepError();
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan transaksi.');
    } finally {
      setPaying(false);
    }
  }, [toast, loadPrinters]);
  const { buffer } = useScanEngine({
    active: true,
    blocked,
    mode: 'kasir',
    handlers: {
      onProduct: addProduct,
      onStudent: (s) => void handleStudent(s),
      onUnknown: handleUnknown,
    },
    nav: {
      onDown: navDown,
      onUp: navUp,
      onDelete: () => removeLine(),
      onQty: (d) => changeQty(d),
      onEnterPlain: () => {
        if (selZone === 'pay') void pay();
      },
    },
  });

  // F9 juga saat fokus di elemen biasa (useScanEngine menangkapnya saat scan engine aktif).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F9') {
        e.preventDefault();
        setManualOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Cetak struk transaksi terakhir (dari overlay konfirmasi) — v1.0.3: pilih printer. */
  const printReceipt = useCallback(
    async (id: string): Promise<void> => {
      try {
        const msg = await window.api.printReceipt(id, printerChoice ?? undefined);
        toast.ok(msg);
      } catch (e) {
        beepError();
        toast.error(e instanceof Error ? e.message : 'Gagal mencetak struk.');
      }
    },
    [toast, printerChoice],
  );

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  return (
    <div className="kasir">
      {/* Keranjang */}
      <section className="panel cart-panel">
        <div className="table-wrap cart-list">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: '42%' }}>Nama</th>
                <th className="num">Harga</th>
                <th style={{ width: 150 }}>Qty</th>
                <th className="num">Subtotal</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr
                  key={l.barcode}
                  className={selZone === 'cart' && selIdx === i ? 'sel' : ''}
                  onClick={() => {
                    setSelZone('cart');
                    setSelIdx(i);
                  }}
                >
                  <td>{l.name}</td>
                  <td className="num">{rupiah(l.price)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="btn qty-btn" onClick={() => changeQty(-1, i)} aria-label={`Kurangi ${l.name}`}>−</button>
                      <b style={{ minWidth: 28, textAlign: 'center' }}>{l.qty}</b>
                      <button className="btn qty-btn" onClick={() => changeQty(1, i)} aria-label={`Tambah ${l.name}`}>+</button>
                    </div>
                  </td>
                  <td className="num">{rupiah(l.price * l.qty)}</td>
                  <td>
                    <button className="btn row-del" onClick={() => removeLine(i)} aria-label={`Hapus ${l.name}`}>🗑</button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="ico">🔍</div>
                      Keranjang kosong — scan barcode produk untuk mulai.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="total-bar">
          <span className="label">TOTAL</span>
          <span className="amount">{rupiah(total)}</span>
        </div>
        <div className="pay-zone">
          <button
            className={`btn btn-primary btn-lg btn-block${selZone === 'pay' ? ' pay-btn-focus' : ''}`}
            onClick={() => void pay()}
            disabled={lines.length === 0 || paying}
          >
            💵 Bayar Tunai ({lines.length} item)
          </button>
          <p className="muted" style={{ margin: '8px 0 0', textAlign: 'center' }}>
            Tekan <b>↓</b> lalu <b>Enter</b> untuk bayar tunai uang pas · kasir aktif:{' '}
            <b>{activeCashier ? `${activeCashier.name} (${activeCashier.class_name})` : '—'}</b>
          </p>
        </div>
      </section>

      {/* Panel kanan: indikator scan + petunjuk */}
      <section className="panel panel-pad">
        <h3 style={{ marginTop: 0 }}>Mode Kasir</h3>
        <div className="scan-indicator">
          {buffer ? <span>{buffer}</span> : <span className="ph">Scan barcode / NISN…</span>}
        </div>
        <button className="btn btn-block" style={{ marginBottom: 10 }} onClick={() => setManualOpen(true)}>
          🔍 Cari Produk Manual (F9)
        </button>
        <ul style={{ lineHeight: 2, paddingLeft: 18, margin: 0 }} className="muted">
          <li>Scan produk → masuk keranjang (beep)</li>
          <li>Scan NISN siswa → absensi + kasir aktif</li>
          <li>Barcode tak dikenal → bisa langsung didaftarkan</li>
          <li>↓ / ↑ pilih baris ↔ tombol bayar</li>
          <li>Del hapus baris · + / − ubah qty</li>
          <li>Esc kosongkan buffer scan</li>
        </ul>
        <div style={{ marginTop: 18 }} className="muted">
          <b>Ringkas:</b>
          <p style={{ margin: '6px 0 0' }}>
            {lines.length} item · {lines.reduce((s, l) => s + l.qty, 0)} pcs
          </p>
        </div>
        {lowStock.length > 0 && (
          <div className="notice-banner warn" style={{ marginTop: 16, marginBottom: 0 }}>
            <span>⚠️</span>
            <span className="grow" style={{ fontSize: 13 }}>
              <b>{lowStock.length}</b> produk stok ≤ {lowThreshold}:{' '}
              {lowStock.slice(0, 5).map((p) => `${p.name} (${p.stock})`).join(', ')}
              {lowStock.length > 5 ? `, +${lowStock.length - 5} lainnya` : ''}
            </span>
          </div>
        )}
      </section>

      {/* Konfirmasi singkat <= 3 detik */}
      {confirm && (
        <div className="confirm-overlay">
          <div className="confirm-card">
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green-dark)' }}>✅ Transaksi tersimpan</div>
            <div className="amount">{rupiah(confirm.total)}</div>
            <div className="code">{confirm.code}</div>
            <div className="confirm-actions">
              <button
                className="btn"
                onClick={() => {
                  setConfirm(null);
                  refreshLowStock();
                }}
              >
                Tutup
              </button>
              <select
                value={printerChoice ?? ''}
                onChange={(e) => setPrinterChoice(e.target.value)}
                title="Printer struk"
                style={{ maxWidth: 210 }}
              >
                <option value="">🖨 Default sistem</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}
                  </option>
                ))}
                <option value={PRINTER_DIALOG}>Pilih saat cetak (dialog)…</option>
              </select>
              <button
                className="btn btn-primary"
                onClick={() => void printReceipt(confirm.id)}
                title="Cetak struk thermal"
              >
                🧾 Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode tak terdaftar */}
      {unknown && (
        <Modal
          title="⚠️ Produk belum terdaftar"
          onClose={() => setUnknown(null)}
          footer={
            <>
              <button className="btn" onClick={() => setUnknown(null)}>Tutup</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setRegisterBarcode(unknown);
                  setUnknown(null);
                }}
              >
                Daftarkan Sekarang
              </button>
            </>
          }
        >
          <p style={{ fontSize: 17 }}>
            Kode berikut belum terdaftar sebagai produk:
          </p>
          <p className="mono big" style={{ background: 'var(--amber-soft)', padding: '10px 14px', borderRadius: 10 }}>
            {unknown}
          </p>
          <p className="muted">Daftarkan sekarang agar bisa langsung dijual.</p>
        </Modal>
      )}

      {registerBarcode !== null && (
        <ProductFormModal
          initial={{ barcode: registerBarcode }}
          onClose={() => setRegisterBarcode(null)}
          onSaved={() => setRegisterBarcode(null)}
        />
      )}

      {/* Pencarian produk manual (F9) — untuk produk tanpa barcode */}
      {manualOpen && (
        <ManualSearchModal
          onClose={() => setManualOpen(false)}
          onPick={(p) => addProduct(p)}
        />
      )}
    </div>
  );
}
