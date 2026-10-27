# Checklist Verifikasi Acceptance Criteria — GreenMart Kasir (PRD §7, AC1–AC20)

> Legend: ✅ terverifikasi otomatis/unit test · 🔧 terverifikasi manual di mesin dev (Linux) ·
> ⏳ perlu smoke test di PC target (Windows + scanner fisik + kredensial Google).

| AC | Deskripsi | Status | Cara verifikasi |
|----|-----------|--------|-----------------|
| AC1 | Scan produk terdaftar → keranjang + beep + total < 100 ms | 🔧⏳ | `routeScan` diunit-test; runtime perlu scanner fisik |
| AC2 | Scan sama 2× → satu baris qty 2 | 🔧⏳ | Logika merge-by-barcode di KasirScreen (`addProduct`); perlu uji manual |
| AC3 | Barcode tak terdaftar → modal + kode + tombol daftar | 🔧⏳ | `routeScan unknown` (test) + modal `unknown` di KasirScreen |
| AC4 | Scan produk stok 0 → toast, keranjang tak berubah | 🔧⏳ | Guard `stock < 1` + `beepWarn` |
| AC5 | 2 item → ↓+Enter → tersimpan (trx+items+stok−+summary), keranjang kosong | ✅ | `tests/dailySummary.test.ts` (transaksi atomik + rollback) |
| AC6 | Restart aplikasi → data tetap (SQLite di userData) | ⏳ | Persistance standar SQLite; verifikasi di PC target |
| AC7 | Tambah produk dengan scan fisik → langsung bisa discan | ⏳ | Form barcode mendukung scan-Enter; perlu scanner fisik |
| AC8 | Produk pernah terjual tidak bisa hard delete | ✅ | `deleteProduct()` re-check `hasSales` + `tests` indirect; UI menonaktifkan mode hard |
| AC9 | Label 12 produk (3×4) masuk dialog print & terbaca scanner | 🔧⏳ | LabelDialog default 3×4; perlu printer & scanner fisik |
| AC10 | Import CSV tab → 3 siswa, NISN leading zero utuh | ✅ | `tests/csvParser.test.ts` |
| AC11 | Import CSV koma + header → berhasil | ✅ | `tests/csvParser.test.ts` |
| AC12 | Scan NISN → kartu < 100 ms, absensi tercatat, kasir aktif, transaksi berikutnya memakai kasir tsb | ✅⏳ | `createTransaction` memakai `active_cashier_student_id` (test); runtime scan perlu fisik |
| AC13 | 5 trx offline → sync → 5 baris + detail + ringkasan; status synced | ✅⏳ | Algoritma diunit-test (dedupe); end-to-end butuh kredensial Google |
| AC14 | Sync ulang tanpa data baru → tidak ada duplikat | ✅⏳ | `partitionById` self-heal (test); end-to-end butuh Google |
| AC15 | Offline → pending; online → auto retry | ⏳ | Scheduler: start/interval/online/manual; perlu uji jaringan nyata |
| AC16 | Kredensial invalid → failed + pesan jelas; setelah diperbaiki → retry OK | ✅⏳ | Klasifikasi 401/403/404 → config error; pesan UI di SyncDialog/Pengaturan |
| AC17 | Stok berubah → sync → tab Produk terbaru tanpa duplikat | ✅⏳ | Upsert by id (ADR-2); end-to-end butuh Google |
| AC18 | Kill aplikasi mid-sync → jalankan lagi → tetap tidak duplikat | ✅⏳ | Self-heal baca kolom ID setiap run; kasus crash antar-append ditangani (item tetap ditulis) |
| AC19 | 3 trx → kartu dashboard sesuai; grafik menampilkan hari ini | ✅ | Query agregat = sumber kartu & grafik (sama-sama dari transactions); test summary |
| AC20 | Top produk & jam ramai konsisten dengan transaction_items | ✅ | Keduanya query `transaction_items` langsung |

## DoD lain (PRD §12)

- [x] `tsc` lulus (node + web, strict)
- [x] ESLint lulus tanpa error
- [x] Unit test lulus (43 test): parser CSV, routing scan, dedup ID + backoff, recompute daily summaries, rupiah, smoke test file-DB (WAL persist + backup + alur lengkap PRD §13)
- [ ] AC1–AC20 diverifikasi manual & dicatat (tabel di atas — kolom ⏳ menunggu smoke test PC target)
- [x] Installer **Linux** di-build & native module ter-pack: `release/GreenMart Kasir-1.0.0.AppImage` (144 MB) + `release/greenmart_1.0.0_amd64.deb` (109 MB) — `better_sqlite3.node` terverifikasi di dalam keduanya
- [ ] Installer **Windows** (NSIS): tidak dapat di-cross-build dari Linux — `@electron/rebuild`/node-gyp tidak mendukung cross-compile `better-sqlite3`. Bangun di mesin Windows: `npm install` → `npx electron-builder install-app-deps` → `npm run dist:win` (skrip sudah tersedia; konfigurasi NSIS ada di `electron-builder.yml`), lalu smoke-test .exe di PC target
- [x] Tidak ada kredensial di source code (verifikasi grep di bawah)
- [x] README: setup Google Cloud, build, konfigurasi scanner, cara pakai per fitur
- [x] ADR terdokumentasi (`docs/ADR.md`)

### Verifikasi tanpa kredensial (dijalankan saat implementasi)

```bash
grep -rniE "private_key|client_secret|BEGIN RSA|ya29\.|AIza[A-Za-z0-9]" src/ tests/
```
Hasil: hanya 2 kemunculan yang aman — type assertion nama field (`google.ts`) dan
placeholder contoh `"..."` di form Setup Wizard. Tidak ada nilai kredensial di source.
