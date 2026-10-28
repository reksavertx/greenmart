// Dialog generate & cetak label barcode Code 128 (PRD F2, AC9).
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import JsBarcode from 'jsbarcode';
import type { Product } from '@shared/types';
import { rupiah } from '@shared/format';
import Modal from './Modal';
import { useToast } from '../lib/toast';

interface Props {
  products: Product[];
  onClose: () => void;
}

function LabelSvg({ code }: { code: string }): ReactElement {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      try {
        JsBarcode(ref.current, code, {
          format: 'CODE128',
          displayValue: false,
          height: 42,
          width: 1.4,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        // teks tidak valid untuk CODE128 — biarkan kosong
      }
    }
  }, [code]);
  return <svg ref={ref} style={{ width: '92%', height: 34 }} />;
}

export default function LabelDialog({ products, onClose }: Props): ReactElement {
  const toast = useToast();
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(4);
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);

  const labels = useMemo(() => {
    const out: { product: Product; copy: number }[] = [];
    for (const p of products) {
      for (let c = 0; c < copies; c++) out.push({ product: p, copy: c });
    }
    return out;
  }, [products, copies]);

  const buildHtml = (): string => {
    // Ambil SVG barcode yang sudah dirender dari preview DOM.
    const preview = document.getElementById('label-preview');
    const inner = preview ? preview.innerHTML : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Label GreenMart</title><style>
      @page { size: A4; margin: 8mm; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      .label-grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 0; }
      .label-cell { border: 1px dashed #ccc; height: ${Math.floor(281 / Math.max(rows, 1))}mm; box-sizing: border-box;
        display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2mm; text-align: center; }
      .label-cell .nm { font-size: 9pt; font-weight: bold; max-width: 100%; overflow: hidden; }
      .label-cell .pr { font-size: 9pt; }
      .label-cell .cd { font-size: 6pt; color: #444; }
      .label-cell svg { width: 90%; height: 13mm; }
    </style></head><body><div class="label-grid">${inner}</div></body></html>`;
  };

  const print = async (): Promise<void> => {
    if (!labels.length) return void toast.warn('Tidak ada label untuk dicetak.');
    setPrinting(true);
    try {
      const msg = await window.api.printLabels(buildHtml(), labels.length);
      toast.ok(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencetak label.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      title={`Cetak Label Barcode (${labels.length} label)`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Tutup</button>
          <button className="btn btn-primary" disabled={printing} onClick={() => void print()}>
            {printing ? 'Menyiapkan…' : '🖨 Cetak'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <label className="field">
          <span>Kolom per halaman</span>
          <input type="number" min={1} max={8} value={cols} onChange={(e) => setCols(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          <span>Baris per halaman</span>
          <input type="number" min={1} max={12} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          <span>Salinan per produk</span>
          <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
        </label>
      </div>
      <div
        id="label-preview"
        className="label-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxHeight: 320, overflow: 'auto' }}
      >
        {labels.map(({ product }) => (
          <div className="label-cell" key={product.id}>
            <div className="nm">{product.name}</div>
            <LabelSvg code={product.barcode} />
            <div className="pr">{rupiah(product.price)}</div>
            <div className="cd">{product.barcode}</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        Default 3×4 = 12 label per halaman A4. Pastikan printer label/sheet sudah terpasang — dialog print
        sistem akan muncul.
      </p>
    </Modal>
  );
}
