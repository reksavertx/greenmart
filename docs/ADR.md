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
