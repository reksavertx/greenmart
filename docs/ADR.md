# ADR — Keputusan Arsitektur (GreenMart Kasir)

> Dibuat sebelum implementasi (M0) sesuai PRD §14.2. Status: diterima.

## ADR-1: Transport sinkronisasi — Service Account + Google Sheets API v4

**Keputusan:** Opsi A (PRD §7.4.4) — Service Account + Sheets API v4 via `googleapis`.

**Alasan:**
- Murni push dari aplikasi, tanpa perlu deploy/menjaga script pihak ketiga (Apps Script relay butuh pemeliharaan terpisah dan token custom).
- Otorisasi jelas: spreadsheet dibagikan ke email service account sebagai **Editor**; publik membaca via *anyone with link → Viewer* — memenuhi syarat #4 & #5 PRD.
- Kredensial JSON key di-paste lewat Setup Wizard, dienkripsi `safeStorage`, tidak pernah masuk source/bundle (syarat #5).

**Trade-off:** butuh setup Google Cloud sekali (dokumentasi di README §Setup Google Cloud).

## ADR-2: Strategi dedup per tab (idempoten)

**Keputusan:**

| Tab | Strategi |
|---|---|
| `Transaksi` | Baca kolom A (ID) setiap run → baris yang sudah ada **tidak ditulis ulang** dan langsung ditandai `synced` (self-heal untuk crash setelah append sebelum update status lokal). Sisa → satu panggilan `values:append`. |
| `Detail Transaksi` | Sama, dedup by `item_id`. Item dari transaksi yang sudah terkirim tapi detailnya belum (crash di antara dua append) **tetap ditulis** pada run berikutnya. |
| `Ringkasan Harian` | **Upsert by `tanggal`**: baca kolom A+E, tanggal sudah ada → `values:update` di baris tsb (dibatch via `values:batchUpdate`); belum → append. |
| `Produk` | **Upsert by `id`** (dipilih dari dua opsi PRD §7.4.2): baca snapshot A:G, bandingkan nilai; baris berubah → `values:update`; produk baru → append. **Bukan clear+rewrite** karena clear+rewrite berisiko kehilangan seluruh snapshot bila aplikasi mati di tengah operasi (prinsip PRD §14.3: pilih aman). |

**Alasan umum:** semua id record = UUID v4 (bukan autoincrement) sehingga dedup by ID aman terhadap replikasi DB/backup restore.

## ADR-3: Penyimpanan kredensial

**Keputusan:** JSON service account disimpan di `settings.google_credential` dengan prefix:
- `enc:<base64>` — hasil `safeStorage.encryptStringAsync` (DPAPI di Windows / keyring di Linux).
- `plain:<base64>` — fallback bila OS tidak menyediakan keyring (dicatat peringatan keras di log; UI menampilkan badge "enkripsi OS tidak tersedia").

Async API dipakai (`isAsyncEncryptionAvailable`/`encryptStringAsync`/`decryptStringAsync`) karena varian sinkron sudah deprecated dan akan dihapus di Electron 46 (dokumentasi Context7, Okt 2026).

## ADR-4: UUID tanpa paket `uuid`

**Keputusan:** `crypto.randomUUID()` (Node ≥14.17 / Chromium) menggantikan paket `uuid`.

**Alasan:** setara UUID v4, nol dependensi, tersedia di main (Node) dan renderer (Chromium). PRD §4 bersifat rekomendasi ("agent bebas memilih library").

## ADR-5: Akses DB hanya di main process

**Keputusan:** `better-sqlite3` di-rebuild ke ABI Electron (`electron-builder install-app-deps`), dibuka di main process; renderer hanya lewat IPC + `contextBridge` dengan `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

**Alasan:** PRD §5.4 non-negotiable; juga memungkinkan unit test repositori via `ELECTRON_RUN_AS_NODE=1 electron vitest` (ABI sama dengan runtime aplikasi).

## ADR-6: Beep tanpa file audio

**Keputusan:** Web Audio API (osilator) di renderer.

**Alasan:** offline penuh, tanpa aset, nada sukses/error/peringatan/kasir mudah dibedakan.

## ADR-7: Label barcode dirender di renderer

**Keputusan:** JsBarcode merender SVG di preview (renderer); HTML label lengkap dikirim ke main dan dicetak lewat `BrowserWindow` tersembunyi + `webContents.print()`.

**Alasan:** print window harus mandiri (tidak boleh memuat script CDN — aplikasi offline); SVG statis aman dicetak di mana pun.

---

> ADR berikut dibuat untuk batch fitur v1.0.1.

## ADR-8: Alert stok menipis = satu batas global

**Keputusan:** satu setting `low_stock_alert` (default 5) dipakai untuk badge di layar Produk, panel Kasir, dan panel Dashboard. Kolom `products.min_stock` tetap ada di DB (kompatibilitas) tapi **tidak dipakai lagi** dan dihilangkan dari form/input.

**Alasan:** pengelola koperasi sekolah mengelola ratusan produk dengan satuan stok kecil; memelihara nilai minimum per produk adalah beban input yang tidak realistis. Satu angka global cukup dan bisa diubah kapan saja.

**Trade-off:** produk dengan kebutuhan batas berbeda (mis. rokok vs pulpen) tidak bisa dibedakan; dapat ditinjau di versi berikutnya bila ada permintaan.

## ADR-9: Stok opname hanya mencatat (record-only)

**Keputusan:** opname menyimpan snapshot stok sistem, input stok fisik, `diff_qty = system − physical`, dan `diff_value = diff_qty × harga snapshot`. **Konfirmasi TIDAK mengubah stok sistem** — hasil opname jadi bahan rapat pengurus, penyesuaian stok tetap manual lewat layar Produk.

**Alasan:** (1) selaras dengan prinsip aman PRD §14.3 — otomatis mengubah stok berdasarkan opname berisiko merusak data bila stok fisik salah hitung; (2) audit trail tetap utuh karena tabel opname immutable setelah `done`; (3) tanggung jawab tetap jelas antara petugas jaga (mencatat) dan pengurus (memutuskan penyesuaian).

**Skedul:** siklus jaga `opname_cycle_days` (default 3, clamp 2–31). Urutan fase berselang dari opname `done` terakhir: setelah *akhir* → *awal* due besoknya; setelah *awal* → *akhir* due pada hari ke-X siklus (hari ke-1 = hari opname awal). Murni dihitung di `src/shared/opname.ts` (pure, ter-test); petugas diisi otomatis dari nama siswa yang absen hari itu.

## ADR-10: Struk thermal = HTML + dialog print OS

**Keputusan:** struk dirender sebagai HTML (`src/main/util/receipt.ts`, `@page size: 58mm|80mm`) dan dicetak via `BrowserWindow` tersembunyi + `webContents.print({ silent: false })` — dialog print OS muncul, pengguna memilih printer.

**Alasan:** tanpa dependensi ESC/POS native; bekerja untuk printer thermal driver maupun PDF; logo & nama kasir jaga mudah ditata. Nama kasir jaga diambil dari **absensi pada tanggal transaksi** (sumber sama dengan keputusan "kasir aktif"), bukan input manual.

**Trade-off:** mengandalkan dialog print OS (tidak silent printing); bila nanti dibutuhkan raw ESC/POS langsung ke `/dev/usb/lp*`, builder HTML sudah memisahkan data dari presentasi sehingga mudah ditambah.

## ADR-11: Logo sekolah webp → ikon via ImageMagick

**Keputusan:** `scripts/gen-icon.cjs` mengonversi `logo-sekolah.webp` (sumber tunggal di root) menjadi `resources/icon.png` (512), `resources/icon.ico` (multi-ukuran), dan `resources/icons/*.png` (16–512) dengan `magick` (fallback `convert`/`ffmpeg`). Logo juga disalin ke `resources/` (dikemas via `extraResources`, dibaca main process untuk struk: dev → `app.getAppPath()/resources`, packaged → `process.resourcesPath`) dan ke `src/renderer/src/assets/` (header, di-bundle vite sebagai data URL).

**Alasan:** satu file sumber menghindari ikon tak sinkron; webp dipilih sekolah (sudah tersedia); ImageMagick umum tersedia di Linux build host.

## ADR-12: Tab Sheets baru v1.0.1 + self-heal header

**Keputusan:**

| Tab | Strategi |
|---|---|
| `Produk` | Tambah kolom ke-8 `kategori` (join `categories.name`). |
| `Rekap Harian Item` (baru) | **Upsert by (`tanggal`,`barcode`)**. Rentang sinkron = setting `report_sync_from` … hari ini; run pertama memakai 30 hari terakhir; setelah sukses `report_sync_from` = kemarin (transaksi malam hari tetap ketangkap run berikutnya). |
| `Stok Opname` (baru) | **Append-only, dedup by `item_id`** (self-heal untuk crash mid-sync); head ditandai `synced_at` setelah seluruh item terkirim. |

`ensureTabs` kini juga **memeriksa header tab existing** dan menulis ulang bila kurang/berbeda — instalasi v1.0.0 mendapat kolom `kategori` otomatis tanpa migrasi manual.

**Alasan:** rekap harian per item adalah bentuk yang dipakai bendahara untuk laporan; dedup by composite key aman karena nilai baris deterministik (agregat). Append-only untuk opname karena isi sesi immutable setelah `done`.

## ADR-13: Data demo (v1.0.2) — merge-only, riwayat, tidak mendorong ke Sheets

**Keputusan:** import data demo (`demo/greenmart-dummy.json`, dibuat `scripts/gen-dummy-data.cjs`)
bersifat **GABUNG (merge)**: produk skip by barcode, siswa skip by NISN, absensi skip by
(siswa, tanggal), transaksi dedup by UUID id (aman diimpor berulang), opname dedup by
(tanggal, fase). Tanggal di file **absolut** (bukan offset hari) agar akhir pekan & hari libur
nasional akurat — generator dijalankan ulang untuk menyegarkan window 75 hari.

- Transaksi dummy = **riwayat demo**: stok TIDAK dikurangi, `sync_status='synced'` +
  `synced_at` agar tidak mendorong ratusan baris demo ke Sheets; `report_sync_from` diset ke kemarin.
- Ringkasan harian tanggal terdampak di-recompute lalu ditandai synced **hanya bila** tidak ada
  transaksi nyata yang masih pending di tanggal itu.
- Alur UI (Pengaturan): dialog file → `validateBundle` → **auto-backup** → import dalam satu
  transaksi DB (error di tengah = rollback total).

**Alasan:** presentasi butuh data yang terlihat nyata (pola jam ramai, Sabtu–Minggu & hari libur
nasional kosong, opname dengan selisih wajar) tanpa merusak data operasional; merge + dedup by ID
membuat import idempoten sehingga salah klik dua kali tidak menduplikasi data.

## ADR-14: Cetak struk/label (v1.0.3) — silent by default, window terlihat untuk dialog

**Keputusan:** rombak `printHtml` di `src/main/ipc/register.ts`:

| Mode | Window | `webContents.print` | Pemakaian |
|---|---|---|---|
| Silent (default) | `show:false` + `stayHidden:true` | `{ silent:true, deviceName }` | Printer terpilih di setting `receipt_printer` / dropdown overlay kasir |
| Dialog | **Terlihat** (kecil, `skipTaskbar`, pojok kanan-bawah) | `{ silent:false }` | Pilihan "Pilih saat cetak" / fallback printer hilang |

**Alasan:**
- Bug v1.0.1: dialog print GTK (Linux/Wayland) **tidak muncul dari window tersembunyi**, dan
  callback `print()` tidak pernah terpanggil → promise menggantung, window tersembunyi menumpuk,
  kegagalan senyap. Dialog kini dibuat dari window yang ter-mapping.
- POS-style: cetak langsung (tanpa dialog) ke printer struk yang sama tiap transaksi — cepat;
  dialog tetap tersedia sebagai pilihan eksplisit.
- Tidak lagi mengandalkan urutan `loadURL` vs `did-finish-load` (race lama); promise load settle
  di event mana pun yang datang lebih dulu.
- `withTimeout` (muat 30 dtk, cetak 90 dtk) + `destroy()` di `finally` menjamin window selalu
  dibersihkan; callback `(success, failureReason)` diperiksa — batal = bukan error.
- Jeda ±200 ms sebelum `print()` dan ±400 ms sebelum `destroy()` (silent) mengikuti
  electron/electron#39179 (job bisa terpotong bila terlalu cepat).
- Pemilihan printer dipusatkan di helper murni `resolvePrintDevice` (`@shared/print`):
  pilihan sesi > setting > default sistem; printer hilang → fallback dialog + notice.
  Diuji di `tests/print.test.ts`. Catatan: Electron 44 `PrinterInfo` tidak lagi memuat
  `isDefault`/`status` — dropdown hanya memakai `name`/`displayName`/`description`.
