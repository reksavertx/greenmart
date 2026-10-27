// F2 — Manajemen produk: CRUD + label (PRD F2, AC7-AC9) + filter kategori (v1.0.1).
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Category, Product, ProductFilter } from '@shared/types';
import { rupiah } from '@shared/format';
import Modal from '../components/Modal';
import ProductFormModal from '../components/ProductFormModal';
import LabelDialog from '../components/LabelDialog';
import { useToast } from '../lib/toast';
import { beepOk } from '../lib/beep';

export default function ProductsScreen(): ReactElement {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [categoryId, setCategoryId] = useState('');
  const [lowThreshold, setLowThreshold] = useState(5);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelOpen, setLabelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteMode, setDeleteMode] = useState<'soft' | 'hard'>('soft');
  const [deleteReason, setDeleteReason] = useState('');

  const refresh = useCallback(async () => {
    const [ps, cs, s] = await Promise.all([
      window.api.productsList({ search, filter, categoryId: categoryId || undefined }),
      window.api.categoriesList(),
      window.api.settingsAll(),
    ]);
    setProducts(ps);
    setCategories(cs);
    setLowThreshold(Number(s.low_stock_alert ?? '5') || 5);
  }, [search, filter, categoryId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const catName = (p: Product): string => categories.find((c) => c.id === p.category_id)?.name ?? '—';

  const stockBadge = (p: Product): ReactElement => {
    if (!p.is_active) return <span className="badge badge-off">nonaktif</span>;
    if (p.stock === 0) return <span className="badge badge-out">habis</span>;
    if (p.stock <= lowThreshold) return <span className="badge badge-low">menipis ({p.stock})</span>;
    return <span className="badge badge-ok">stok {p.stock}</span>;
  };

  const askDelete = async (p: Product): Promise<void> => {
    const sold = await window.api.productHasSales(p.id);
    setDeleteTarget(p);
    setDeleteMode(sold ? 'soft' : 'hard');
    setDeleteReason(
      sold
        ? 'Produk punya riwayat transaksi — hanya bisa DINONAKTIFKAN (soft delete) agar data penjualan tetap utuh.'
        : 'Produk belum pernah terjual — aman dihapus permanen.',
    );
  };

  const doDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      const res = await window.api.productDelete(deleteTarget.id, deleteMode);
      beepOk();
      toast.ok(res.mode === 'hard' ? 'Produk dihapus permanen.' : 'Produk dinonaktifkan (soft delete).');
      setSelected(new Set());
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus produk.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const labelProducts = useMemo(
    () => products.filter((p) => selected.has(p.id)),
    [products, selected],
  );

  return (
    <div>
      <div className="toolbar">
        <div className="grow">
          <input
            placeholder="Cari nama / barcode… (scan barcode saat fokus di sini juga berfungsi)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value as ProductFilter)}>
          <option value="all">Semua status</option>
          <option value="active">Aktif saja</option>
          <option value="inactive">Nonaktif saja</option>
        </select>
        <select style={{ width: 180 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Semua kategori</option>
          <option value="none">Tanpa kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          className="btn"
          disabled={selected.size === 0}
          onClick={() => setLabelOpen(true)}
          title="Generate label barcode produk terpilih"
        >
          🏷 Label ({selected.size})
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Tambah Produk
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={labelProducts.length > 0 && labelProducts.length === products.length}
                    onChange={(e) => {
                      setSelected(e.target.checked ? new Set(products.map((p) => p.id)) : new Set());
                    }}
                  />
                </th>
                <th>Barcode</th>
                <th>Nama</th>
                <th>Kategori</th>
                <th className="num">Harga</th>
                <th>Stok</th>
                <th style={{ width: 190 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="mono">{p.barcode}</td>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td className="muted">{catName(p)}</td>
                  <td className="num">{rupiah(p.price)}</td>
                  <td>{stockBadge(p)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn"
                        onClick={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button className="btn btn-danger" onClick={() => void askDelete(p)}>
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="ico">📦</div>
                      Belum ada produk. Klik <b>+ Tambah Produk</b> — barcode bisa diisi dengan scan langsung.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <ProductFormModal
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void refresh();
          }}
        />
      )}

      {labelOpen && <LabelDialog products={labelProducts} onClose={() => setLabelOpen(false)} />}

      {deleteTarget && (
        <Modal
          title={deleteMode === 'hard' ? 'Hapus produk?' : 'Nonaktifkan produk?'}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDeleteTarget(null)}>Batal</button>
              <button className="btn btn-danger" onClick={() => void doDelete()}>
                {deleteMode === 'hard' ? 'Hapus Permanen' : 'Ya, Nonaktifkan'}
              </button>
            </>
          }
        >
          <p>
            <b>{deleteTarget.name}</b> ({deleteTarget.barcode})
          </p>
          <p className="muted">{deleteReason}</p>
        </Modal>
      )}
    </div>
  );
}
