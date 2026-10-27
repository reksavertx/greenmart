// Repositori tabel categories (v1.0.1).
import type { DB } from '../database';
import type { Category } from '@shared/types';
import { uuid } from '../../util/uuid';
import { toIsoLocal } from '../../util/time';

export function listCategories(db: DB): Category[] {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE ASC`,
    )
    .all() as Category[];
}

export function createCategory(db: DB, name: string): Category {
  const n = name.trim();
  if (!n) throw new Error('Nama kategori wajib diisi.');
  const dup = db.prepare('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE').get(n);
  if (dup) throw new Error(`Kategori "${n}" sudah ada.`);
  const id = uuid();
  db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)').run(id, n, toIsoLocal());
  return { id, name: n, product_count: 0 };
}

export function renameCategory(db: DB, id: string, name: string): Category {
  const n = name.trim();
  if (!n) throw new Error('Nama kategori wajib diisi.');
  const dup = db
    .prepare('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE AND id != ?')
    .get(n, id);
  if (dup) throw new Error(`Kategori "${n}" sudah ada.`);
  const res = db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(n, id);
  if (res.changes === 0) throw new Error('Kategori tidak ditemukan.');
  return { id, name: n, product_count: 0 };
}

/** Hapus hanya bila tidak dipakai produk apa pun (aman untuk data historis). */
export function deleteCategory(db: DB, id: string): void {
  const used = (db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(id) as {
    c: number;
  }).c;
  if (used > 0) {
    throw new Error(`Kategori masih dipakai ${used} produk — pindahkan produknya dulu.`);
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

export function categoryExists(db: DB, id: string): boolean {
  return !!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);
}
