// Modal pencarian produk manual (F9, v1.0.1) — untuk UMKM yang jualan tanpa barcode.
// Kode persis 3-5 digit yang cocok barcode/nama → langsung masuk keranjang.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Product } from '@shared/types';
import { rupiah } from '@shared/format';
import Modal from './Modal';

interface Props {
  onPick: (p: Product) => void;
  onClose: () => void;
}

export default function ManualSearchModal({ onPick, onClose }: Props): ReactElement {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [sel, setSel] = useState(0);
  const [all, setAll] = useState<Product[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Muat produk aktif sekali — filter dilakukan di sisi renderer agar responsif.
  useEffect(() => {
    void window.api.productsList({ filter: 'active' }).then(setAll);
  }, []);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (!term) {
      setResults([]);
      setSel(0);
      return;
    }
    setResults(all.filter((p) => p.barcode.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)).slice(0, 12));
    setSel(0);
  }, [q, all]);

  const pick = (p: Product | undefined): void => {
    if (!p) return;
    onPick(p);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[sel]);
    }
  };

  const exactCode = /^\d{3,5}$/.test(q.trim());
  const exactMatch = exactCode ? all.find((p) => p.barcode === q.trim()) : undefined;

  return (
    <Modal
      title="🔍 Cari Produk Manual"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Tutup (Esc)</button>
          <button className="btn btn-primary" disabled={!results.length} onClick={() => pick(results[sel])}>
            + Masukkan Keranjang (Enter)
          </button>
        </>
      }
    >
      <label className="field">
        <span>Ketik nama produk atau kode (3-5 digit) — ↓↑ pilih, Enter masukkan</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="mis. 101 atau chiki"
          className="mono"
          autoComplete="off"
        />
      </label>

      {exactMatch ? (
        <p style={{ fontSize: 16 }}>
          <span className="badge badge-ok">kode persis</span> <b>{exactMatch.name}</b> · {rupiah(exactMatch.price)} —
          tekan <b>Enter</b> untuk langsung masuk keranjang.
        </p>
      ) : (
        exactCode && (
          <p className="muted">Kode {q.trim()} belum terdaftar — daftarkan lewat layar Produk (F2).</p>
        )
      )}

      {q.trim() && !exactMatch && (
        <div className="search-results">
          {results.map((p, i) => (
            <button
              key={p.id}
              className={`result${i === sel ? ' sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => pick(p)}
            >
              <span className="mono muted">{p.barcode}</span>
              <b>{p.name}</b>
              <span className={p.stock <= 0 ? 'badge badge-out' : 'badge badge-ok'}>stok {p.stock}</span>
              <span className="pr">{rupiah(p.price)}</span>
            </button>
          ))}
          {results.length === 0 && <p className="muted">Tidak ada produk yang cocok.</p>}
        </div>
      )}
      {!q.trim() && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Mulai mengetik untuk mencari. Untuk UMKM tanpa barcode: beri kode angka 3-5 digit saat
          mendaftarkan produk (mis. 101, 102), lalu ketik kodenya di sini.
        </p>
      )}
    </Modal>
  );
}
