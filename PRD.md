# PRD — Aplikasi Kasir Koperasi Sekolah (Desktop, Offline-First)

> **Versi:** 1.0 · **Tanggal:** 2026-10-27 · **Status:** Siap diimplementasikan
> **Audiens dokumen ini:** AI agent developer (memiliki akses Context7 MCP untuk dokumentasi library terbaru)
> **Bahasa UI:** Indonesia · **Mata uang:** Rupiah (integer, tanpa desimal) · **Zona waktu:** lokal PC kasir

---

## 1. Ringkasan Produk

Aplikasi kasir (POS) desktop untuk koperasi/kantin sekolah, dijalankan pada **satu PC kasir khusus, tanpa login**. Kasir digilakan oleh siswa; kehadiran siswa pencatat via **scan barcode NISN**. Aplikasi wajib berjalan **offline penuh** dengan **SQLite sebagai database lokal utama**; data disinkronkan **satu arah (SQLite → Google Sheets)** saat internet tersedia. Toko menjual produk pabrik (barcode kemasan) maupun produk bungkus sendiri (label barcode digenerate oleh aplikasi).

## 2. Tujuan & Ukuran Keberhasilan

- Kasir dapat melayani 1 transaksi dalam < 30 detik: scan 1–5 item, lalu **↓ + Enter** untuk bayar tunai instan.
- 100% transaksi tersimpan lokal meskipun tanpa internet berhari-hari, dan tersinkron otomatis saat online.
- Data yang di-upload ulang ke Google Sheets **tidak pernah duplikat** (idempoten berbasis ID unik).
- Siswa non-teknis dapat memakai aplikasi tanpa pelatihan (keyboard-first, sedikit mouse).

### 2.1 Asumsi Keputusan (hasil konfirmasi pemilik — jika ada yang meleset, koreksi sebelum koding)

1. **Tanpa login** — PC kasir dedicated; aksi destruktif hanya perlu dialog konfirmasi.
2. **Bayar tunai instan** — ↓ + Enter langsung menyimpan transaksi dengan asumsi **uang pas** (cash_received = total). Tidak ada layar input uang/kembalian.
3. **Absensi = log kehadiran** — setiap scan NISN dicatat; identitas langsung tampil; kasir aktif mengikuti scan terakhir & dapat diganti manual dari daftar hadir hari itu.
4. **Stok otomatis** — berkurang tiap penjualan; peringatan stok minimum; blok penjualan saat stok 0.
5. **Barcode produk** — kemasan pabrik (EAN/UPC) ATAU label buatan aplikasi (Code 128) + fitur cetak label.
6. **Sinkronisasi** — Transaksi penjualan + Ringkasan harian + Master produk. Absensi & master siswa **tidak** disinkronkan (lokal saja).
7. **Dashboard** — omzet & tren, produk terlaris, penjualan per jam (jam ramai). Tanpa metrik per-kasir.
8. EAN/UPC **checksum tidak divalidasi** oleh aplikasi (scanner hardware sudah mendecode); kode apapun yang discan diperlakukan apa adanya.

## 3. Pengguna & Lingkungan

| Aktor | Deskripsi |
|---|---|
| Siswa jaga kasir | Memakai aplikasi langsung tanpa login: scan barang, ↓+Enter bayar, scan NISN saat mulai jaga |
| Admin/guru | Mengelola produk, import CSV siswa, konfigurasi sinkronisasi Google — juga tanpa login, aksi destruktif cukup dialog konfirmasi |
| Publik sekolah | Membaca Google Sheets via tautan "anyone with link: Viewer" (diatur di sisi Google, bukan di aplikasi) |

- **PC:** Windows 10/11 x64 (target utama, wajib ada installer `.exe`), Linux AppImage/deb (sekunder).
- **Hardware:** scanner USB mode HID keyboard (keyboard wedge — "mengetik" isi barcode + Enter). Resolusi minimal 1366×768. Tidak ada printer struk pada tahap ini.

## 4. Tech Stack (rekomendasi — agent bebas memilih library JS/TS apa pun)

- **Electron** (versi stabil terbaru) + **electron-vite** + **React** + **TypeScript** (strict).
- **SQLite via better-sqlite3** (sinkron, cepat, cocok untuk main process). Wajib di-rebuild untuk ABI Electron (`@electron/rebuild`). File DB: `app.getPath('userData')/kasir.db`.
- **Chart:** recharts (atau setara).
- **Google:** `googleapis` (Sheets API v4) ATAU relay Apps Script — keputusan di §7.4.
- **Packaging:** electron-builder → NSIS installer (Windows) + AppImage & deb (Linux).
- **Lainnya:** uuid v4, date-fns, electron-log, electron `safeStorage`.
- **WAJIB:** sebelum menulis kode, ambil dokumentasi terbaru tiap library utama via **Context7 MCP** (Electron: IPC/safeStorage/preload, better-sqlite3, googleapis Sheets v4, electron-builder). Jangan mengandalkan API dari ingatan yang mungkin sudah usang.

## 5. Prinsip Arsitektur (non-negotiable)

1. **Offline-first:** setiap operasi tulis (transaksi, absensi, produk) **commit ke SQLite dulu**. Ketersediaan internet tidak boleh menjadi prasyarat fitur apa pun.
2. **SQLite = sumber kebenaran.** Google Sheets = arsip/laporan baca publik. Sinkronisasi **satu arah** (push), tanpa penarikan data dari Sheets.
3. **Semua id record = UUID v4** (bukan autoincrement) — prasyarat deduplikasi sinkronisasi.
4. **Keamanan Electron:** `contextIsolation: true`, `nodeIntegration: false`, renderer sandboxed; akses DB/file/hanya lewat IPC + preload (`contextBridge`). Renderer tidak boleh menyentuh file/DB langsung.
5. **Tidak ada kredensial rahasia di dalam kode/bundle aplikasi.** Kredensial diinput pengguna sekali via setup wizard (§7.4), disimpan **terenkripsi** dengan `safeStorage` di userData.
6. Dashboard & ringkasan dihitung dari SQLite, bukan dari Sheets.
7. **Integrasi ke kode existing:** jika diberikan codebase/prototype yang sudah berjalan, agent **wajib menganalisis struktur aplikasi & database yang ada terlebih dahulu**, menulis ringkasan analisis + rencana integrasi sebelum koding, dan **tidak boleh merusak fungsi yang sudah berjalan**.

## 6. Skema Database SQLite

Timestamps: ISO-8601 dengan offset lokal (`2026-10-27T14:05:00+07:00`). Semua id TEXT UUID v4.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE products (
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

CREATE TABLE students (
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

CREATE TABLE attendances (            -- lokal saja, tidak disinkronkan
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  scanned_at TEXT NOT NULL,
  local_date TEXT NOT NULL             -- YYYY-MM-DD untuk query harian
);
CREATE INDEX idx_att_date ON attendances(local_date);

CREATE TABLE transactions (
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
CREATE INDEX idx_trx_sync  ON transactions(sync_status);
CREATE INDEX idx_trx_sold  ON transactions(sold_at);

CREATE TABLE transaction_items (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES products(id),
  barcode        TEXT NOT NULL,        -- snapshot saat jual
  product_name   TEXT NOT NULL,        -- snapshot saat jual
  price          INTEGER NOT NULL,     -- snapshot saat jual
  qty            INTEGER NOT NULL CHECK (qty > 0),
  subtotal       INTEGER NOT NULL
);
CREATE INDEX idx_items_trx ON transaction_items(transaction_id);

CREATE TABLE daily_summaries (
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

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Kunci yang wajib ada: store_name, min_stock_default, active_cashier_student_id,
-- google_spreadsheet_id, google_spreadsheet_url, sync_interval_minutes,
-- backup_dir, last_sync_at, google_credential (hasil safeStorage.encrypt, base64)

CREATE TABLE sync_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,            -- 'transactions'|'daily'|'products'|'auth'|'network'
  status     TEXT NOT NULL,            -- 'ok' | 'error'
  message    TEXT,
  created_at TEXT NOT NULL
);
```

**Aturan penulisan transaksi** (satu SQLite transaction):
`INSERT transactions` + `INSERT transaction_items` + `UPDATE products SET stock = stock - qty` + upsert `daily_summaries` (recompute `COUNT/SUM` untuk tanggal tersebut) + `code` = `TRX-YYYYMMDD-NNNN` (NNNN = nomor urut hari itu). Gagal di tengah → rollback penuh.

## 7. Spesifikasi Fitur

### F1 — Layar Kasir: Scan → Masuk Keranjang → Bayar Tunai Instan

**Perilaku scan (keyboard wedge, listener global di window):**
1. Semua ketikan cepat + Enter/Tab ditangkap di mana pun fokus berada (pola: buffer karakter, Enter = commit, Esc = kosongkan buffer). Input manual lewat keyboard juga harus bekerja (untuk uji tanpa scanner).
2. **Routing kode hasil scan** (urutan prioritas tergantung mode aktif):
   - Mode **Kasir**: cocokkan ke `products.barcode` dulu → jika tidak ada, cek `students.nisn` (10 digit, dinormalisasi dari digit saja) → jika tidak ada keduanya, warning.
   - Mode **Absensi**: cek `students.nisn` dulu → baru produk.
3. Jika produk ditemukan, aktif, dan stok > 0 → tambah/increment item di keranjang (`qty + 1` per scan), bunyi **beep sukses**, update subtotal.
4. Jika stok = 0 → **warning toast** "Stok [nama] habis", item TIDAK masuk keranjang.
5. Jika barcode tidak terdaftar → **modal warning** "Produk belum terdaftar — kode: XXX" + tombol **[Daftarkan Sekarang]** (buka form produk dengan barcode terisi) dan [Tutup]. Juga bunyi **beep error** (nada rendah).
6. Jika yang discan NISN siswa terdaftar (di mode Kasir pun) → tetap catat absensi + toast identitas siswa, tidak mengganggu keranjang.

**Bayar tunai instan:**
- Tombol **[Bayar Tunai]** selalu dapat dinavigasi dengan **tombol ↓** (dari keranjang ke tombol) dan dijalankan dengan **Enter**.
- Saat bayar: simpan transaksi sesuai aturan §6, kosongkan keranjang, tampilkan konfirmasi singkat (total + kode transaksi) maks. 3 detik, siap menerima scan berikutnya.
- Jika keranjang kosong → Enter pada tombol bayar tidak melakukan apa-apa (hindari transaksi kosong).

**Keranjang:**
- Kolom: nama, harga, qty (+/− klik & tombol), subtotal, tombol hapus per baris.
- Item dengan barcode sama → digabung satu baris (qty bertambah).
- Total besar & menonjol di bagian bawah.

**Acceptance criteria:**
- AC1: Scan `8998866200011` pada produk terdaftar → item masuk keranjang qty 1, beep, total terupdate < 100 ms.
- AC2: Scan barcode sama 2× → satu baris qty 2.
- AC3: Scan barcode tak terdaftar → modal warning muncul dengan kode terbaca + tombol daftar.
- AC4: Scan produk stok 0 → toast peringatan, keranjang tidak berubah.
- AC5: Scan 2 item lalu tekan ↓ lalu Enter → transaksi tersimpan (cek tabel `transactions` + `transaction_items` + stok berkurang + `daily_summaries` terupdate), keranjang kosong.
- AC6: Restart aplikasi → data tetap ada (SQLite persist di userData).

### F2 — Manajemen Produk (CRUD + Label)

- **Daftar produk:** pencarian (nama/barcode), filter aktif/nonaktif, urut nama. Tampilkan stok + badge "stok menipis" (≤ min_stock) dan "habis".
- **Tambah/edit produk:** field barcode (bisa diisi dengan **menekan scan** saat field fokus), nama, harga, stok awal, min_stock, aktif. Validasi: barcode unik, harga integer ≥ 0, stok ≥ 0.
- **Hapus:** soft delete (`is_active = 0`) jika produk punya riwayat transaksi; hard delete hanya jika belum pernah terjual. Kedua aksi wajib dialog konfirmasi.
- **Generate label barcode:** pilih produk → aplikasi membuat label Code 128 (pakai library JS seperti `jsbarcode`) berisi barcode + nama + harga dalam grid label siap cetak (ukuran label dapat diset: jumlah kolom/baris per halaman) → cetak via dialog print Electron.
- **(Opsional, P2)** import produk massal via CSV.

**Acceptance criteria:**
- AC7: Tambah produk dengan barcode hasil scan fisik → tersimpan, langsung bisa discan di kasir.
- AC8: Produk yang sudah pernah terjual tidak bisa hard delete (tombol disabled + alasan).
- AC9: Label 12 produk (3×4) dapat dibuka di dialog print dan terbaca oleh scanner.

### F3 — Absensi Jaga Kasir via NISN

**Import CSV siswa (wajib dilakukan sebelum absensi bisa jalan):**
- Format kolom (5 kolom, urutan tetap): `Kelas,NIS,NISN,NAMA,JenisKelamin`.
- Contoh baris (dari pemilik — perhatikan ada TAB dan apostrof di depan NISN):
  ```
  XIPM	12777	'0103133511	AIDA ZULFA KHASNA	P
  ```
- **Parser WAJIB toleran:** deteksi otomatis delimiter koma ATAU tab (per file, konsisten), buang BOM, trim spasi, **buang apostrof/tanda kutip di awal NISN** (artefak Excel untuk leading zero), NISN disimpan sebagai TEXT, `JenisKelamin` dinormalisasi ke `P`/`L` (uppercase; nilai lain = baris error), deteksi baris header (`Kelas,...`) dan lewati.
- Alur import: pilih file → **preview tabel** (10 baris pertama + ringkasan "X valid, Y duplikat, Z error") → commit. NISN duplikat dalam file atau dengan data existing → **baris kedua dilewati** (bukan menimpa), dilaporkan di hasil import. Import tidak boleh membuat data setengah jadi (transactional).

**Perilaku scan NISN:**
- Scan NISN terdaftar → tampil **kartu identitas** (NAMA besar, kelas, NISN, gender, jam scan) + catat ke `attendances` + set `settings.active_cashier_student_id` ke siswa tersebut.
- Scan berulang hari yang sama → tetap dicatat sebagai log (jam scan baru), UI daftar hadir menampilkan **satu baris per siswa** dengan jam pertama & terakhir.
- **Kasir aktif** (nama + kelas) tampil di header layar kasir & disimpan sebagai `cashier_student_id` pada transaksi yang dibuat. Bisa diganti manual dari dropdown daftar hadir hari ini. Jika belum ada yang scan → tampil "—" dan transaksi boleh tersimpan dengan kasir NULL.
- Scan NISN yang tidak terdaftar → warning "NISN XXX tidak ditemukan — import CSV siswa dulu".
- Ada layar riwayat absensi per tanggal (pilih tanggal → daftar siswa + jam pertama/terakhir).

**Acceptance criteria:**
- AC10: Import CSV contoh di atas (delimiter tab) → 3 siswa masuk, NISN `0103133511` tersimpan dengan leading zero utuh.
- AC11: Import file dengan delimiter koma + baris header juga berhasil.
- AC12: Scan NISN `0103133511` → kartu AIDA ZULFA KHASNA tampil < 100 ms, tercatat di absensi, nama jadi kasir aktif di header, transaksi berikutnya tersimpan dengan kasir tersebut.

### F4 — Sinkronisasi SQLite → Google Sheets (satu arah)

#### 7.4.1 Syarat wajib dari pemilik (verifikasi satu per satu sebelum declare selesai)

1. Data dari tabel SQLite tertentu dapat di-upload ke Google Sheets melalui tombol Sinkronisasi.
2. Aplikasi tetap berjalan offline; data belum tersinkron tersimpan di SQLite dan di-upload saat internet kembali.
3. Gunakan Google Sheets API **atau** Google Apps Script sesuai arsitektur paling sesuai.
4. Spreadsheet dapat dibaca semua orang (viewer via link); hanya user tertentu yang boleh mengedit/mengirim data.
5. Autentikasi & otorisasi aman — **jangan menanamkan kredensial rahasia di aplikasi klien**.
6. Cegah duplikasi data saat upload ulang menggunakan ID unik setiap record.
7. Sediakan status sinkronisasi (Pending / Synced / Failed), waktu sinkronisasi terakhir, penanganan error dan retry.
8. SQLite tetap database lokal utama; sinkronisasi satu arah SQLite → Sheets.

#### 7.4.2 Struktur tab di spreadsheet target

| Tab | Kolom (baris 1 = header) | Strategi tulis |
|---|---|---|
| `Transaksi` | id, kode, waktu_transaksi, nama_kasir, kelas_kasir, jumlah_item, total, metode | append + dedup by kolom `id` |
| `Detail Transaksi` | item_id, transaction_id, kode_transaksi, waktu, barcode, nama_produk, harga_satuan, qty, subtotal | append + dedup by kolom `item_id` (item mengikuti batch transaksinya) |
| `Ringkasan Harian` | tanggal, omzet, jumlah_transaksi, item_terjual, updated_at | **upsert by `tanggal`**: jika tanggal sudah ada → update baris tsb; belum → append |
| `Produk` | id, barcode, nama, harga, stok, aktif, updated_at | snapshot terbaru (boleh clear+rewrite ATAU upsert by id — dokumentasikan pilihan) |

- Tab yang belum ada dibuat otomatis saat sync pertama (beserta header, di-bold).
- Header row tidak pernah ikut ter-upload sebagai data.

#### 7.4.3 Algoritma sinkronisasi (wajib idempoten)

1. Kumpulkan batch: semua `transactions` dengan `sync_status != 'synced'` (+ seluruh `transaction_items`-nya) dan semua `daily_summaries` pending/failed — limit 100 transaksi per run.
2. **Cegah duplikat:** baca kolom ID (kolom A) tab `Transaksi` & `Detail Transaksi` (boleh di-cache per sesi sync, refresh tiap run). Baris yang ID-nya sudah ada di Sheets → **langsung ditandai `synced`** tanpa ditulis ulang (self-heal untuk kasus crash setelah append tapi sebelum update status lokal).
3. Sisa baris ditulis dengan **satu** panggilan `values:append` per tab.
4. `Ringkasan Harian`: baca kolom `tanggal`; yang sudah ada → `values:update` di baris ditemukan; yang baru → append.
5. `Produk`: tulis snapshot terkini (lihat tabel strategi).
6. Sukses per tab → update `sync_status='synced'`, `synced_at=now()`, tulis `sync_log`, update `settings.last_sync_at`.
7. **Klasifikasi error:**
   - Error jaringan/timeout/5xx → status tetap `pending` (bukan failed), catat `sync_log`.
   - 401/403/kredensial invalid/spreadsheet tidak ditemukan (4xx konfigurasi) → status `failed` + pesan jelas di UI ("kredensial kedaluwarsa — buka Pengaturan").
8. **Retry:** otomatis saat (a) aplikasi start, (b) interval berkala (default 10 menit, dapat diatur), (c) event kembali online, (d) tombol manual. Backoff eksponensial per record: 1 → 5 → 15 → 60 menit (maks), via `retry_count` + `last_sync_attempt`. Tombol **[Coba Ulang Semua Failed]** tersedia.
9. Transaksi & item-nya selalu dikirim dalam batch yang sama (tidak boleh header terkirim tanpa detail).

#### 7.4.4 Autentikasi (agent wajib menganalisis lalu memilih & mendokumentasikan)

- **Opsi A (rekomendasi): Service Account + Sheets API v4.** Admin sekolah membuat Service Account di Google Cloud (aktifkan Sheets API), membagikan spreadsheet ke email service account sebagai **Editor**, mengunduh file JSON key, lalu **menempelkan isi JSON tersebut di Setup Wizard aplikasi**. Aplikasi menyimpan JSON **terenkripsi via `safeStorage`** di userData. Kredensial tidak pernah masuk source code/bundle/repo. Spreadsheet dibagikan "anyone with link → Viewer" agar publik bisa membaca (aturan #4) — hak edit hanya service account (aturan #5).
- **Opsi B: Apps Script Web App sebagai relay.** `doPost` menerima payload + token rahasia, script menulis ke sheet. Token disimpan terenkripsi sama seperti Opsi A. Pilih opsi ini bila Google Cloud review diperlukan.
- Agent menuliskan **keputusan + alasannya (ADR singkat) dan estimasi pengerjaan** sebelum implementasi, sesuai permintaan pemilik.

#### 7.4.5 UI sinkronisasi

- Tombol **[Sinkronisasi Sekarang]** + chip status di header: `Sinkron: N pending · M failed · terakhir HH:MM`.
- Dialog detail: jumlah per status per tabel, waktu sinkron terakhir, daftar error terakhir (dari `sync_log`), tombol retry, tombol **[Buka Spreadsheet]**.
- Saat sync berjalan: indikator loading; aplikasi tetap bisa dipakai untuk transaksi (sync di background, tidak memblokir main process).

**Acceptance criteria:**
- AC13: 5 transaksi offline → saat online & klik Sinkronisasi → 5 baris muncul di tab `Transaksi` + detailnya di `Detail Transaksi` + ringkasan tanggal terupdate; status lokal jadi `synced`.
- AC14: Klik Sinkronisasi lagi (tanpa transaksi baru) → **tidak ada baris duplikat** di Sheets.
- AC15: Matikan internet → sync → data tetap `pending`; nyalakan lagi → auto retry berhasil.
- AC16: Kredensial invalid → status `failed` + pesan jelas; setelah kredensial diperbaiki via wizard → retry berhasil.
- AC17: Tambah stok produk, sync → tab `Produk` menampilkan nilai terbaru (tanpa duplikat baris id sama).
- AC18: Kill aplikasi di tengah sync lalu jalankan lagi → data tetap tidak duplikat di Sheets (self-heal via cek ID).

### F5 — Dashboard Analitik (dari SQLite, offline)

- **Kartu ringkas:** omzet hari ini, jumlah transaksi hari ini, item terjual hari ini.
- **Grafik tren omzet:** bar/line harian, rentang pilih 7/30/90 hari.
- **Produk terlaris:** top 10 berdasarkan qty dan berdasarkan omzet (tab switch).
- **Jam ramai:** grafik penjualan per jam (0–23), rentang bisa dipilih.
- Semua query agregat lokal (`transactions`, `transaction_items`, `daily_summaries`). Empty state ramah saat belum ada data.

**Acceptance criteria:**
- AC19: Setelah 3 transaksi hari ini → kartu omzet/transaksi/item sesuai; grafik tren menampilkan titik hari ini.
- AC20: Top produk & jam ramai konsisten dengan data `transaction_items`.

### F6 — Pengaturan & Backup

- Pengaturan: nama toko, default min_stock, interval sync, spreadsheet ID/URL, **Setup Wizard kredensial Google** (paste JSON → uji koneksi (tes akses spreadsheet) → simpan terenkripsi), folder backup.
- **Backup otomatis:** setiap hari saat aplikasi pertama dijalankan, salin `kasir.db` ke folder backup, simpan 7 salinan terakhir.
- **Danger zone:** reset data (hapus transaksi/produk) dengan konfirmasi mengetik nama toko.

## 8. Peta Keyboard (wajib; boleh ditambah, tidak boleh diubah semantik ↓+Enter)

| Tombol | Konteks | Aksi |
|---|---|---|
| Scan / ketik + Enter | global | buffer keyboard-wedge → routing §F1 |
| `↓` / `↑` | layar kasir | navigasi antara keranjang ↔ tombol [Bayar Tunai] |
| `Enter` | tombol terfokus | jalankan tombol (bayar = tunai instan uang pas) |
| `Del` | baris keranjang terpilih | hapus item dari keranjang |
| `+` / `−` | baris terpilih | qty ±1 |
| `Esc` | dialog / buffer | tutup dialog / kosongkan buffer scan |
| `F1`–`F4` | global | navigasi: Kasir / Produk / Absensi / Dashboard |
| `F8` | global | buka dialog Sinkronisasi |

## 9. Non-Fungsional

- **Performa:** render hasil scan < 100 ms; simpan transaksi < 200 ms; cold start < 3 detik.
- **Keandalan:** SQLite WAL mode; foreign keys ON; transaksi DB atomik; backup harian otomatis.
- **Logging:** electron-log ke file di userData (rotasi sederhana); error sync tercatat di `sync_log`.
- **Aksesibilitas:** kontras cukup, fokus keyboard terlihat jelas, target klik ≥ 44px.
- **Update:** auto-update electron-updater = P2 (opsional), tidak memblokir rilis awal.

## 10. Batasan / Out of Scope (jangan dibangun di fase ini)

Retur/refund · diskon & promo · multi outlet · login multi-user · cetak struk · edit/hapus transaksi · saldo/dompet siswa · sinkronisasi dua arah (Sheets → SQLite) · absensi tersinkron ke Sheets · pembayaran QRIS/transfer.

## 11. Milestone & Estimasi (agent wajib menyempurnakan setelah analisis)

| M | Isi | Estimasi |
|---|---|---|
| M0 | Analisis existing code + ADR (keputusan arsitektur & auth Google) | 0,5 hari |
| M1 | Skeleton Electron+Vite+TS, migrasi SQLite, IPC bridge, navigasi shell | 1 hari |
| M2 | Kasir: wedge listener, routing scan, keranjang, transaksi instan, beep | 1–2 hari |
| M3 | CRUD produk + generate & cetak label Code 128 | 1 hari |
| M4 | Import CSV siswa + absensi NISN + kasir aktif | 1 hari |
| M5 | Dashboard analitik | 1 hari |
| M6 | Sinkronisasi Google Sheets + status/retry/error/self-heal | 2–3 hari |
| M7 | Backup, polish keyboard, packaging installer Win+Linux, README | 1 hari |

**Total estimasi awal: ± 8–10 hari kerja.**

## 12. Definition of Done

- [ ] `tsc`, ESLint, dan unit test lulus tanpa error. Unit test wajib ada untuk: parser CSV siswa, routing scan (produk/NISN/tak dikenal), filter dedup ID, recompute `daily_summaries`, formatter rupiah.
- [ ] Seluruh acceptance criteria AC1–AC20 diverifikasi manual dan dicatat hasilnya.
- [ ] Installer Windows dibangun dan smoke-tested: install bersih → scan → bayar → restart → data persist; AppImage Linux berhasil dibangun.
- [ ] Tidak ada kredensial/secret di source code (verifikasi manual/grep).
- [ ] README: langkah setup Google Cloud (service account, sharing spreadsheet), build, konfigurasi scanner ke mode keyboard, dan cara pakai per fitur.
- [ ] ADR singkat terdokumentasi (pilihan Sheets API vs Apps Script, strategi dedup, lokasi penyimpanan kredensial).

## 13. Data Uji

CSV siswa (simpan sebagai `siswa.csv`; satu file delimiter tab, satu file koma, keduanya harus lolos):

```
Kelas,NIS,NISN,NAMA,JenisKelamin
XIPM,12777,'0103133511,AIDA ZULFA KHASNA,P
XIPM,12778,'0103133512,BUDI SANTOSO,L
XIIPA1,12801,'0103133520,CITRA DEWI,P
```

Produk contoh: `8998866200011` Chiki Jagung — Rp5.000, stok 20 · `8992761110017` Aqua 600ml — Rp3.000, stok 48 · `SNACK001` Roti Bungkus Sendiri — Rp2.500, stok 5 (uji label Code 128).

Skenario manual wajib uji: scan produk pabrik · scan produk label sendiri · scan tak terdaftar · scan stok 0 · scan NISN (kasir & absensi mode) · ↓+Enter bayar · bayar saat keranjang kosong · import CSV tab & koma · import CSV duplikat · sync online/offline/kill-mid-sync · kredensial salah → diperbaiki · restart aplikasi · backup dibuat di hari berbeda.

## 14. Catatan untuk AI Agent

1. **Gunakan Context7 MCP** untuk mengambil dokumentasi terbaru sebelum menulis kode: Electron (IPC, preload, safeStorage, BrowserWindow), better-sqlite3, googleapis/Sheets v4, electron-builder, jsbarcode, recharts. Versi API berubah — jangan mengandalkan ingatan.
2. Tulis ADR singkat (M0) sebelum koding: pilihan sync transport, strategi dedup per tab, penyimpanan kredensial — lalu ikuti konsisten.
3. Prioritas kebenaran: data tidak boleh hilang atau dobel. Bila ragu antara "cepat" dan "aman", pilih aman.
4. Semua teks UI Bahasa Indonesia; rupiah tanpa desimal (`Rp12.500`).
5. Jangan menambah fitur di luar PRD ini tanpa diminta; kalau ada kebutuhan teknis yang memaksa penyimpangan, dokumentasikan alasannya.
