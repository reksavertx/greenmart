// Skema SQLite — persis PRD §6. Timestamps ISO-8601 offset lokal, id TEXT UUID v4.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id         TEXT PRIMARY KEY,
  barcode    TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL CHECK (price >= 0),
  stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock  INTEGER NOT NULL DEFAULT 5,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  nis        TEXT,
  nisn       TEXT NOT NULL UNIQUE,   -- SIMPAN SEBAGAI TEXT (bisa leading zero)
  name       TEXT NOT NULL,
  gender     TEXT NOT NULL CHECK (gender IN ('P','L')),
  class_name TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendances (            -- lokal saja, tidak disinkronkan
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  scanned_at TEXT NOT NULL,
  local_date TEXT NOT NULL             -- YYYY-MM-DD untuk query harian
);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendances(local_date);

CREATE TABLE IF NOT EXISTS transactions (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,  -- TRX-YYYYMMDD-0001 (urut per hari)
  total              INTEGER NOT NULL CHECK (total >= 0),
  item_count         INTEGER NOT NULL,
  payment_method     TEXT NOT NULL DEFAULT 'cash',
  cashier_student_id TEXT REFERENCES students(id),
  sold_at            TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  sync_status        TEXT NOT NULL DEFAULT 'pending'
                     CHECK (sync_status IN ('pending','synced','failed')),
  synced_at          TEXT,
  sync_error         TEXT,
  retry_count        INTEGER NOT NULL DEFAULT 0,
  last_sync_attempt  TEXT
);
CREATE INDEX IF NOT EXISTS idx_trx_sync  ON transactions(sync_status);
CREATE INDEX IF NOT EXISTS idx_trx_sold  ON transactions(sold_at);

CREATE TABLE IF NOT EXISTS transaction_items (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES products(id),
  barcode        TEXT NOT NULL,        -- snapshot saat jual
  product_name   TEXT NOT NULL,        -- snapshot saat jual
  price          INTEGER NOT NULL,     -- snapshot saat jual
  qty            INTEGER NOT NULL CHECK (qty > 0),
  subtotal       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_trx ON transaction_items(transaction_id);

CREATE TABLE IF NOT EXISTS daily_summaries (
  local_date        TEXT PRIMARY KEY,  -- YYYY-MM-DD
  revenue           INTEGER NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  items_sold        INTEGER NOT NULL DEFAULT 0,
  sync_status       TEXT NOT NULL DEFAULT 'pending'
                    CHECK (sync_status IN ('pending','synced','failed')),
  synced_at         TEXT,
  sync_error        TEXT,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_sync_attempt TEXT
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
-- v1.0.1: kolom products.category_id ditambahkan via migrasi (lihat MIGRATIONS di database.ts)

CREATE TABLE IF NOT EXISTS stock_opnames (
  id           TEXT PRIMARY KEY,
  local_date   TEXT NOT NULL,          -- YYYY-MM-DD
  phase        TEXT NOT NULL CHECK (phase IN ('awal','akhir')),
  petugas      TEXT,                   -- daftar nama siswa absen hari itu (dipisah koma)
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','done')),
  created_at   TEXT NOT NULL,
  confirmed_at TEXT,
  synced_at    TEXT                    -- sinkron ke tab Sheets 'Stok Opname'
);
CREATE INDEX IF NOT EXISTS idx_opname_date ON stock_opnames(local_date);

CREATE TABLE IF NOT EXISTS stock_opname_items (
  id             TEXT PRIMARY KEY,
  opname_id      TEXT NOT NULL REFERENCES stock_opnames(id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES products(id),
  barcode        TEXT NOT NULL,
  product_name   TEXT NOT NULL,
  price          INTEGER NOT NULL,     -- snapshot harga saat opname
  system_stock   INTEGER NOT NULL,     -- stok sistem saat mulai opname
  physical_stock INTEGER,              -- NULL = belum diinput (draft)
  diff_qty       INTEGER,              -- system - physical
  diff_value     INTEGER               -- diff_qty * price (nilai simpangan)
);
CREATE INDEX IF NOT EXISTS idx_opname_items ON stock_opname_items(opname_id);

CREATE TABLE IF NOT EXISTS sync_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,            -- 'transactions'|'daily'|'products'|'auth'|'network'
  status     TEXT NOT NULL,            -- 'ok' | 'error'
  message    TEXT,
  created_at TEXT NOT NULL
);
`;

export const USER_VERSION = 2;

/**
 * Migrasi bertahap: key = versi ASAL, value = langkah menuju versi+1.
 * v1->v2: kategori produk (kolom products.category_id — nullable, produk lama tanpa kategori).
 */
export const MIGRATIONS: Record<number, string[]> = {
  1: ['ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES categories(id)'],
};
