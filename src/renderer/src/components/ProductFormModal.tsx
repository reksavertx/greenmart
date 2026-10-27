// Form tambah/edit produk. Field barcode mendukung scan langsung (scanner "mengetik" + Enter).
// v1.0.1: dropdown kategori; stok minimum dihapus (alert pakai batas global di Pengaturan).
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Category, Product, ProductInput } from '@shared/types';
import Modal from './Modal';
import { useToast } from '../lib/toast';
import { beepError, beepOk } from '../lib/beep';

interface Props {
  initial?: Partial<Product> | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}

export default function ProductFormModal({ initial, onClose, onSaved }: Props): ReactElement {
  const toast = useToast();
  const editing = !!initial?.id;
  const [barcode, setBarcode] = useState(initial?.barcode ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(String(initial?.price ?? ''));
  const [stock, setStock] = useState(String(initial?.stock ?? '0'));
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState(initial ? !!initial.is_active : true);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    void window.api.categoriesList().then(setCategories);
  }, []);

  const submit = async (): Promise<void> => {
    const input: ProductInput = {
      barcode: barcode.trim(),
      name: name.trim(),
      price: Number(price),
      stock: Number(stock),
      is_active: active,
      category_id: categoryId || null,
    };
    if (!input.barcode) return void toast.warn('Barcode wajib diisi (boleh discan langsung).');
    if (!input.name) return void toast.warn('Nama produk wajib diisi.');
    for (const [label, v] of [['Harga', input.price], ['Stok', input.stock]] as const) {
      if (!Number.isInteger(v) || v < 0) {
        beepError();
        return void toast.warn(`${label} harus bilangan bulat >= 0.`);
      }
    }
    setSaving(true);
    try {
      const saved = editing
        ? await window.api.productUpdate(initial!.id as string, input)
        : await window.api.productCreate(input);
      beepOk();
      toast.ok(editing ? 'Produk diperbarui.' : `Produk "${saved.name}" tersimpan — siap discan di kasir.`);
      onSaved(saved);
    } catch (e) {
      beepError();
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan produk.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit Produk' : 'Tambah Produk'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Barcode (klik lalu scan / ketik, Enter untuk lanjut)</span>
        <input
          ref={barcodeRef}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              nameRef.current?.focus();
            }
          }}
          className="mono"
          placeholder="8998866200011"
        />
      </label>
      <label className="field">
        <span>Nama produk</span>
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Chiki Jagung" />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Harga (Rp)</span>
          <input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span>Stok</span>
          <input type="number" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
        <label className="field">
          <span>Kategori</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Tanpa kategori —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          style={{ width: 20, height: 20 }}
        />
        Produk aktif (bisa dijual)
      </label>
    </Modal>
  );
}
