// Test repositori v1.0.1: kategori, produk+kategori, migrasi v1→v2.
import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { DB } from '../src/main/db/database';
import { applySchema } from '../src/main/db/database';
import { USER_VERSION, SCHEMA_SQL } from '../src/main/db/schema';
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from '../src/main/db/repositories/categories';
import { createProduct, listLowStock, listProducts } from '../src/main/db/repositories/products';

function openDb(): DB {
  const db = new Database(':memory:') as unknown as DB;
  applySchema(db);
  return db;
}

describe('categories repo', () => {
  let db: DB;
  beforeEach(() => {
    db = openDb();
  });

  it('seed kategori default muncul 4', () => {
    const cats = listCategories(db);
    expect(cats.map((c) => c.name).sort()).toEqual(['Alat Tulis', 'Lainnya', 'Makanan', 'Minuman']);
  });

  it('create + rename + duplikat ditolak', () => {
    const c = createCategory(db, 'Snack');
    expect(c.name).toBe('Snack');
    expect(() => createCategory(db, 'snack')).toThrow(/sudah ada/i); // case-insensitive
    const r = renameCategory(db, c.id, 'Makanan Ringan');
    expect(r.name).toBe('Makanan Ringan');
    // rename bentrok dgn kategori lain (seed default 'Minuman') → ditolak; nama sendiri boleh
    expect(() => renameCategory(db, c.id, 'Minuman')).toThrow(/sudah ada/i);
    expect(() => renameCategory(db, c.id, 'makanan ringan')).not.toThrow();
  });

  it('hapus kategori terpakai ditolak, tak terpakai bisa', () => {
    const c = createCategory(db, 'Minuman Kemasan');
    const p = createProduct(db, {
      barcode: 'A1',
      name: 'Teh Kotak',
      price: 3500,
      stock: 10,
      is_active: true,
      category_id: c.id,
    });
    expect(p.category_id).toBe(c.id);
    expect(() => deleteCategory(db, c.id)).toThrow(/masih dipakai/i);
    const empty = createCategory(db, 'Kosong');
    expect(() => deleteCategory(db, empty.id)).not.toThrow();
  });

  it('product_count terhitung dari LEFT JOIN', () => {
    const c = createCategory(db, 'Uji Hitung');
    createProduct(db, { barcode: 'B1', name: 'A', price: 1000, stock: 1, is_active: true, category_id: c.id });
    createProduct(db, { barcode: 'B2', name: 'B', price: 2000, stock: 1, is_active: true, category_id: c.id });
    const found = listCategories(db).find((x) => x.id === c.id);
    expect(found?.product_count).toBe(2);
  });
});

describe('products + kategori', () => {
  let db: DB;
  beforeEach(() => {
    db = openDb();
  });

  it('listProducts filter categoryId & none', () => {
    const c1 = createCategory(db, 'Kat A');
    const c2 = createCategory(db, 'Kat B');
    createProduct(db, { barcode: 'P1', name: 'Satu', price: 1000, stock: 5, is_active: true, category_id: c1.id });
    createProduct(db, { barcode: 'P2', name: 'Dua', price: 1000, stock: 5, is_active: true, category_id: c2.id });
    createProduct(db, { barcode: 'P3', name: 'Tiga', price: 1000, stock: 5, is_active: true, category_id: null });
    expect(listProducts(db, { categoryId: c1.id }).map((p) => p.barcode)).toEqual(['P1']);
    expect(listProducts(db, { categoryId: 'none' }).map((p) => p.barcode)).toEqual(['P3']);
    expect(listProducts(db, {})).toHaveLength(3);
  });

  it('create dengan category_id tak dikenal ditolak', () => {
    expect(() =>
      createProduct(db, {
        barcode: 'X1',
        name: 'X',
        price: 1000,
        stock: 1,
        is_active: true,
        category_id: 'tidak-ada',
      }),
    ).toThrow(/kategori/i);
  });

  it('listLowStock pakai threshold global', () => {
    createProduct(db, { barcode: 'L1', name: 'Rendah', price: 1000, stock: 3, is_active: true, category_id: null });
    createProduct(db, { barcode: 'L2', name: 'Pas', price: 1000, stock: 5, is_active: true, category_id: null });
    createProduct(db, { barcode: 'L3', name: 'Aman', price: 1000, stock: 9, is_active: true, category_id: null });
    createProduct(db, { barcode: 'L4', name: 'Nonaktif', price: 1000, stock: 0, is_active: false, category_id: null });
    const low = listLowStock(db, 5);
    expect(low.map((p) => p.barcode).sort()).toEqual(['L1', 'L2']); // L4 nonaktif dikecualikan
    expect(low[0].stock).toBe(3); // urut stok naik → L1 (3) dulu
  });
});

describe('migrasi user_version', () => {
  it('DB baru langsung versi terbaru', () => {
    const db = new Database(':memory:') as unknown as DB;
    applySchema(db);
    const ver = db.pragma('user_version', { simple: true }) as number;
    expect(ver).toBe(USER_VERSION);
    db.close();
  });

  it('DB v1 (tanpa tabel v2) dimigrasi ke v2 dengan kolom category_id', () => {
    const db = new Database(':memory:') as unknown as DB;
    db.pragma('user_version = 1');
    // Skema v1 sederhana: products tanpa category_id, tanpa tabel kategori/opname.
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY, class_name TEXT NOT NULL, nis TEXT, nisn TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('P','L')),
        is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, barcode TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        price INTEGER NOT NULL CHECK (price >= 0), stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        min_stock INTEGER NOT NULL DEFAULT 5, is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    db.prepare(
      "INSERT INTO products (id, barcode, name, price, stock, min_stock, is_active, created_at, updated_at) VALUES ('p1','OLD1','Produk Lama',1000,5,5,1,'2026-01-01','2026-01-01')",
    ).run();
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL); // IF NOT EXISTS — tabel baru dibuat
    const ver1 = db.pragma('user_version', { simple: true }) as number;
    expect(ver1).toBe(1);
    // Jalankan langkah migrasi seperti database.ts
    for (const sql of ['ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES categories(id)']) db.exec(sql);
    db.pragma(`user_version = ${USER_VERSION}`);
    // Kolom category_id ada & produk lama nilainya NULL
    const col = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
    expect(col.map((c) => c.name)).toContain('category_id');
    const row = db.prepare('SELECT category_id FROM products WHERE id = ?').get('p1') as {
      category_id: string | null;
    };
    expect(row.category_id).toBeNull();
    db.close();
  });
});
