// Repositori tabel products.
import type { DB } from '../database';
import type { Product, ProductFilter, ProductInput } from '@shared/types';
import { uuid } from '../../util/uuid';
import { toIsoLocal } from '../../util/time';

export function validateProductInput(input: ProductInput): ProductInput {
  const barcode = input.barcode.trim();
  const name = input.name.trim();
  if (!barcode) throw new Error('Barcode wajib diisi.');
  if (!name) throw new Error('Nama produk wajib diisi.');
  for (const [label, v] of [
    ['Harga', input.price],
    ['Stok', input.stock],
    ['Stok minimum', input.min_stock],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${label} harus bilangan bulat >= 0.`);
  }
  return { ...input, barcode, name };
}

export function listProducts(
  db: DB,
  q: { search?: string; filter?: ProductFilter },
): Product[] {
  const conds: string[] = [];
  const params: (string | number)[] = [];
  if (q.filter === 'active') conds.push('is_active = 1');
  if (q.filter === 'inactive') conds.push('is_active = 0');
  if (q.search && q.search.trim()) {
    conds.push('(name LIKE ? OR barcode LIKE ?)');
    const like = `%${q.search.trim()}%`;
    params.push(like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM products ${where} ORDER BY name COLLATE NOCASE ASC`)
    .all(...params) as Product[];
}

export function getProductByBarcode(db: DB, barcode: string): Product | null {
  return (db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode.trim()) as
    | Product
    | undefined) ?? null;
}

export function getProductById(db: DB, id: string): Product | null {
  return (db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined) ?? null;
}

export function hasSales(db: DB, productId: string): boolean {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM transaction_items WHERE product_id = ?')
    .get(productId) as { c: number };
  return row.c > 0;
}

function constraintMessage(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    if (code.startsWith('SQLITE_CONSTRAINT')) {
      if (code.includes('UNIQUE')) return 'Barcode sudah terdaftar untuk produk lain.';
      return 'Data tidak valid (melanggar aturan database).';
    }
  }
  return null;
}

export function createProduct(db: DB, input: ProductInput): Product {
  const v = validateProductInput(input);
  const now = toIsoLocal();
  const id = uuid();
  try {
    db.prepare(
      `INSERT INTO products (id, barcode, name, price, stock, min_stock, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, v.barcode, v.name, v.price, v.stock, v.min_stock, v.is_active ? 1 : 0, now, now);
  } catch (err) {
    const msg = constraintMessage(err);
    if (msg) throw new Error(msg);
    throw err;
  }
  return getProductById(db, id) as Product;
}

export function updateProduct(db: DB, id: string, input: ProductInput): Product {
  const v = validateProductInput(input);
  const existing = getProductById(db, id);
  if (!existing) throw new Error('Produk tidak ditemukan.');
  const now = toIsoLocal();
  try {
    db.prepare(
      `UPDATE products SET barcode = ?, name = ?, price = ?, stock = ?, min_stock = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    ).run(v.barcode, v.name, v.price, v.stock, v.min_stock, v.is_active ? 1 : 0, now, id);
  } catch (err) {
    const msg = constraintMessage(err);
    if (msg) throw new Error(msg);
    throw err;
  }
  return getProductById(db, id) as Product;
}

/**
 * Hapus produk sesuai PRD F2:
 * - pernah terjual -> soft delete (is_active = 0)
 * - belum pernah terjual -> hard delete
 * Mode yang diminta diverifikasi ulang di sini; hasil mode aktual dikembalikan.
 */
export function deleteProduct(
  db: DB,
  id: string,
  mode: 'soft' | 'hard',
): { mode: 'soft' | 'hard' } {
  const existing = getProductById(db, id);
  if (!existing) throw new Error('Produk tidak ditemukan.');
  const sold = hasSales(db, id);
  const now = toIsoLocal();
  if (mode === 'hard' && !sold) {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return { mode: 'hard' };
  }
  db.prepare('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id);
  return { mode: 'soft' };
}
