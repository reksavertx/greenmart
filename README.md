# GreenMart Kasir — Aplikasi Kasir Koperasi Sekolah

Aplikasi kasir (POS) **desktop, offline-first** untuk koperasi/kantin sekolah.
Dibangun dengan **Electron + electron-vite + React + TypeScript (strict)**, database **SQLite lokal**
(`better-sqlite3`), sinkronisasi **satu arah SQLite → Google Sheets**.

> Lihat `PRD.md` untuk spesifikasi lengkap dan `docs/ADR.md` untuk keputusan arsitektur.

---

## Fitur

| Layar (tombol) | Isi |
|---|---|
| **Kasir (F1)** | Scan barcode → keranjang → **↓ + Enter** bayar tunai instan (uang pas). Scan NISN = absensi + kasir aktif. Barcode tak dikenal → langsung bisa didaftarkan. **F9** cari produk manual (nama/kode 3–5 digit) untuk UMKM tanpa barcode. Tombol **🧾 Cetak Struk** di overlay konfirmasi (thermal 58/80 mm, logo + nama kasir jaga otomatis, **pilih printer langsung di overlay** — v1.0.3). Alert stok menipis global. |
| **Produk (F2)** | CRUD produk + **kategori**, pencarian, badge stok menipis/habis (batas global), filter kategori, soft/hard delete sesuai riwayat, generate & cetak **label Code 128**. |
| **Absensi (F3)** | Import CSV siswa (toleran: tab/koma, BOM, apostrof NISN, header), scan NISN → kartu identitas + log hadir, riwayat per tanggal, **rekap kehadiran bulanan** (jumlah hari, rata-rata jam datang), set kasir aktif. |
| **Dashboard (F4)** | Omzet/transaksi/item hari ini, **rata-rata omzet/hari**, grafik garis omzet + kuantitas, jam ramai, **penjualan per kategori (batang + lingkaran)**, modus produk terlaris Top 7, panel stok menipis. |
| **Laporan (F5)** | Laporan penjualan **harian/mingguan/bulanan** per item (qty + omzet + kategori), navigasi periode, **ekspor CSV** (Excel-friendly), rekap harian per item tersinkron ke tab `Rekap Harian Item`. |
| **Stok Opname (F6)** | Catat stok fisik vs sistem (selisih qty + nilai) — **hanya mencatat, tidak mengubah stok**. Siklus jaga X hari: opname *awal* pagi hari ke-1, opname *akhir* di hari terakhir (pengingat otomatis di banner). Petugas otomatis dari absensi hari itu. Sinkron ke tab `Stok Opname`. |
| **Pengaturan** | Nama toko, **kategori produk (CRUD)**, batas alert stok menipis, siklus opname, lebar struk, **tema terang/gelap**, interval sync, **Setup Wizard kredensial Google**, folder backup, danger zone, **import data demo (v1.0.2)**, **printer struk & label + tes cetak (v1.0.3)**. |
| **F8** | Dialog sinkronisasi: status pending/failed, error terakhir, retry, buka spreadsheet. |

Peta keyboard lengkap: PRD §8 + tambahan v1.0.1 (`F5` Laporan, `F6` Opname, `F9` cari produk; dipertahankan: `↓+Enter` bayar, `Del` hapus baris, `+`/`−` qty, `Esc` tutup dialog).

## Logo sekolah

Logo dipakai sebagai ikon aplikasi/installer, header in-app, dan di struk thermal:

1. Simpan file `logo-sekolah.webp` di **root project**.
2. Jalankan `node scripts/gen-icon.cjs` → menghasilkan `resources/icon.png`, `resources/icon.ico`, dan `resources/icons/*.png` (butuh ImageMagick).
3. File otomatis tersalin ke `resources/logo-sekolah.webp` (struk) dan `src/renderer/src/assets/` (header).

## Struktur project

```
src/
├── main/       # Main process: DB, IPC, sync Google, CSV, backup, struk, opname, laporan
├── preload/    # contextBridge (satu pintu IPC, typed)
├── renderer/   # UI React (Kasir, Produk, Absensi, Dashboard, Laporan, Opname, Pengaturan)
└── shared/     # Tipe bersama, formatter rupiah, routing scan, periode & opname (pure)
tests/          # Unit test Vitest (70 test)
docs/           # ADR + checklist AC
scripts/        # Konversi logo → ikon
```

## Menjalankan (development)

```bash
npm install        # postinstall otomatis rebuild better-sqlite3 ke ABI Electron
npm run dev        # jalankan aplikasi (hot reload)
```

> Jika `npm install` memblokir postinstall script (policy allow-scripts), jalankan manual:
> ```bash
> node node_modules/electron/install.js
> npx electron-builder install-app-deps
> ```

## Perintah lain

```bash
npm run typecheck  # tsc strict untuk main+preload+renderer
npm run lint       # ESLint
npm test           # unit test (vitest berjalan dengan runtime Electron → ABI native cocok)
npm run build      # build out/
npm run dist:win   # installer Windows (NSIS) — JALANKAN DI MESIN WINDOWS (lihat catatan di bawah)
npm run dist:linux # AppImage + deb (Linux)
```

> **Catatan build installer Windows:** `better-sqlite3` adalah native module, dan node-gyp
> **tidak mendukung cross-compile** dari Linux ke Windows. Installer `.exe` harus dibangun
> di mesin Windows dengan Node.js + toolchain build terpasang:
> ```bash
> npm install
> npx electron-builder install-app-deps   # rebuild native module ke ABI Electron
> npm run dist:win
> ```
> Hasil: `release/GreenMart Kasir Setup 1.0.0.exe`. Installer Linux (AppImage/deb) sudah
> terverifikasi di-build dari Linux dengan native module ter-pack di dalamnya.

## Setup Google Cloud (sekali, ±10 menit)

1. Buka [Google Cloud Console](https://console.cloud.google.com) → buat project (mis. *koperasi-greenmart*).
2. **APIs & Services → Library** → cari **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**:
   - Nama: mis. `greenmart-sync` (tanpa role khusus).
   - Buka service account → tab **Keys → Add key → Create new key → JSON** → unduh file key.
4. Buka spreadsheet tujuan → **Share**:
   - Tambahkan email service account (`...@...iam.gserviceaccount.com`) sebagai **Editor** (agar aplikasi boleh menulis).
   - **General access → Anyone with the link → Viewer** (agar publik sekolah bisa membaca — syarat PRD #4).
5. Di aplikasi: **Pengaturan → Setup Wizard Kredensial Google** → paste isi JSON key + URL spreadsheet → **Uji Koneksi** → **Simpan (Terenkripsi)**.
6. Tab dibuat otomatis (dengan header bold) pada sync pertama: `Transaksi`, `Detail Transaksi`, `Ringkasan Harian`, `Produk`, `Rekap Harian Item`, `Stok Opname`. Header tab lama yang kurang kolom (mis. `Produk` + `kategori`) diperbaiki otomatis (self-heal) saat sync berikutnya.

Sinkronisasi berjalan otomatis: saat aplikasi start, tiap interval (default 10 menit, dapat diatur), saat internet kembali, dan manual (F8 → *Sinkronisasi Sekarang*). Data gagal sync tetap `pending`/`failed` di SQLite dan tidak pernah hilang.

## Konfigurasi scanner barcode

Scanner USB harus dalam mode **HID keyboard (keyboard wedge)**:

1. Buka notepad/Browser → scan barcode → muncul angka/huruf lalu **Enter otomatis** (sufiks CR/LF). Jika belum, ubah lewat manual scanner (umumnya kode setting "CR suffix").
2. Untuk label buatan sendiri (produk bungkus), cetak dari **Produk → pilih → 🏷 Label** (Code 128) lalu pastikan scanner dapat membaca Code 128.

Tanpa scanner pun bisa dipakai: ketik barcode manual di layar Kasir lalu Enter.

## Lokasi data

| Isi | Lokasi |
|---|---|
| Database | `userData/kasir.db` (Windows: `%APPDATA%/GreenMart Kasir/kasir.db`) |
| Backup harian (7 terakhir) | `userData/backups/` (bisa diubah di Pengaturan) |
| Log | `userData/logs/main.log` |

## Printer & cetak struk (v1.0.3)

- **Pengaturan → Printer struk & label**: pilih printer terpasang, atau "Printer default sistem"
  (cetak langsung tanpa dialog — mode kasir), atau "Pilih saat cetak (dialog print)".
- Tombol **🖨 Tes Cetak** mencetak halaman tes berbentuk struk ke printer yang dipilih —
  pakai ini untuk menguji konfigurasi tanpa transaksi.
- Overlay konfirmasi kasir punya **dropdown printer** (default mengikuti Pengaturan) di samping
  tombol Cetak Struk — bisa diganti sekali jalan tanpa membuka Pengaturan.
- Bila printer yang tersimpan tercabut/dihapus, aplikasi otomatis membuka dialog print agar
  transaksi tidak gagal senyap.
- Setting tersimpan di key `receipt_printer` (`''` = default sistem, `__dialog__` = selalu tanya,
  selain itu = nama printer sistem).

## Data demo (presentasi) — v1.0.2

Untuk demo/presentasi, aplikasi bisa diisi data contoh yang terlihat seperti kondisi asli:
produk kantin, 12 siswa, absensi pagi, ±2 bulan transaksi dengan pola jam ramai, dan 2 sesi
stok opname. **Koperasi tutup di Sabtu–Minggu dan hari libur nasional/cuti bersama** (17 Agustus,
Maulid Nabi, Nyepi, Idul Fitri, dll) — tidak ada transaksi/absensi di hari tersebut.

**Cara pakai:**

1. Buka **Pengaturan → Data Demo (Presentasi)** → klik **📂 Impor File Data Demo...**
2. Pilih file `demo/greenmart-dummy.json`.
3. Selesai — dashboard & laporan langsung menampilkan gabungan data asli + demo.

**Yang perlu diketahui:**

- Import bersifat **GABUNG (merge)**: data asli tidak dihapus/diubah. Produk dengan barcode sama
  dan siswa dengan NISN sama **dilewati**; transaksi dummy dedup by ID (aman diimpor berulang).
- Transaksi dummy disimpan sebagai **riwayat** — stok produk **tidak berkurang** — dan ditandai
  *sudah tersinkron* agar tidak membanjiri spreadsheet Google Sheets.
- **Backup otomatis dibuat** sebelum impor; bisa dipulihkan dari folder backup bila perlu.
- Setelah impor, rentang sinkron rekap (`report_sync_from`) dipangkatkan ke kemarin.

**Regenerasi file demo** (tanggal selalu relatif ke hari dijalankan — jalankan ulang menjelang
presentasi agar 75 hari terakhirnya segar):

```bash
node scripts/gen-dummy-data.cjs   # tulis ulang demo/greenmart-dummy.json (deterministik, seed tetap)
```

## Unit test

Mencakup wajib DoD PRD §12 + tambahan v1.0.1: parser CSV siswa, routing scan, filter dedup ID +
backoff, recompute `daily_summaries`, formatter rupiah, rentang periode laporan (minggu/bulan),
pengingat opname (siklus & nag), repositori kategori, opname (snapshot/selisih/konfirmasi),
agregat laporan + CSV, rekap absensi bulanan, migrasi skema v1→v2.

## Catatan keamanan

- Tidak ada kredensial di source code/bundle (verifikasi: `grep` di AC checklist).
- Kredensial Google hanya di Setup Wizard → disimpan terenkripsi `safeStorage`.
- File JSON key service account **jangan disimpan di folder project**; pola `greenmart-*.json`
  dan `*service-account*.json` sudah di-ignore git sebagai pengaman ganda.
- Renderer sandboxed; semua akses DB via IPC.
