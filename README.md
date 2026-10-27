# GreenMart Kasir — Aplikasi Kasir Koperasi Sekolah

Aplikasi kasir (POS) **desktop, offline-first** untuk koperasi/kantin sekolah.
Dibangun dengan **Electron + electron-vite + React + TypeScript (strict)**, database **SQLite lokal**
(`better-sqlite3`), sinkronisasi **satu arah SQLite → Google Sheets**.

> Lihat `PRD.md` untuk spesifikasi lengkap dan `docs/ADR.md` untuk keputusan arsitektur.

---

## Fitur

| Layar (tombol) | Isi |
|---|---|
| **Kasir (F1)** | Scan barcode → keranjang → **↓ + Enter** bayar tunai instan (uang pas). Scan NISN = absensi + kasir aktif. Barcode tak dikenal → langsung bisa didaftarkan. |
| **Produk (F2)** | CRUD produk, pencarian, badge stok menipis/habis, soft/hard delete sesuai riwayat, generate & cetak **label Code 128** (grid kolom×baris dapat diatur). |
| **Absensi (F3)** | Import CSV siswa (toleran: tab/koma, BOM, apostrof NISN, header), scan NISN → kartu identitas + log hadir, riwayat per tanggal, set kasir aktif. |
| **Dashboard (F4)** | Omzet/transaksi/item hari ini, tren omzet 7/30/90 hari, produk terlaris (qty/omzet), jam ramai — semuanya dihitung dari SQLite. |
| **Pengaturan** | Nama toko, stok minimum default, interval sync, **Setup Wizard kredensial Google**, folder backup, danger zone. |
| **F8** | Dialog sinkronisasi: status pending/failed, error terakhir, retry, buka spreadsheet. |

Peta keyboard lengkap: PRD §8 (dipertahankan: `↓+Enter` bayar, `Del` hapus baris, `+`/`−` qty, `Esc` tutup dialog).

## Struktur project

```
src/
├── main/       # Main process: DB, IPC, sync Google, CSV, backup
├── preload/    # contextBridge (satu pintu IPC, typed)
├── renderer/   # UI React (screens: Kasir, Produk, Absensi, Dashboard, Pengaturan)
├── shared/     # Tipe bersama, formatter rupiah, routing scan (pure)
└── tests/      # Unit test Vitest (40 test)
docs/           # ADR + checklist AC
scripts/        # Generator ikon
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
6. Tab `Transaksi`, `Detail Transaksi`, `Ringkasan Harian`, `Produk` dibuat otomatis (dengan header bold) pada sync pertama.

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

## Unit test

Mencakup wajib DoD PRD §12: parser CSV siswa, routing scan (produk/NISN/tak dikenal),
filter dedup ID + backoff, recompute `daily_summaries` (dengan DB in-memory nyata), formatter rupiah.

## Catatan keamanan

- Tidak ada kredensial di source code/bundle (verifikasi: `grep` di AC checklist).
- Kredensial Google hanya di Setup Wizard → disimpan terenkripsi `safeStorage`.
- Renderer sandboxed; semua akses DB via IPC.
