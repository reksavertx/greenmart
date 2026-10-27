# AGENTS.md — GreenMart Kasir

Compact instruction file for future OpenCode sessions. Every line answers: "Would an agent likely miss this without help?"

## Quickstart Commands

| Command | Purpose |
|---|---|
| `npm install` | Install deps; **crucially** runs `postinstall` which rebuilds native modules (`better-sqlite3` via `electron-builder install-app-deps`). Do not skip. |
| `npm run dev` | Start Electron app in development mode (hot reload). |
| `npm test` | Run the 43 Vitest unit tests (uses `ELECTRON_RUN_AS_NODE=1`, in-memory or file SQLite). |
| `npm run typecheck` | Run strict tsc on both node + web configs. |
| `npm run lint` | Run ESLint; fix errors before committing. |
| `npm run build` | Electron-Vite build (produces `out/`). |
| `npm run dist:linux` | Build Linux installer (AppImage + deb). **Must be built on Linux** — cross-compile to Windows is not supported. |
| `npm run dist:win` | Build Windows installer. **Requires a Windows machine** — node-gyp/electron-builder cannot cross-compile from Linux. |
| `node node_modules/electron/install.js && npx electron-builder install-app-deps` | Manual postinstall if npm script is blocked by policy. |

## Architecture & Boundaries

- **Electron app**: Single process model. `better-sqlite3` is a native module — it **must** be rebuilt for the current Electron ABI via `electron-builder install-app-deps` (or `npm install` + postinstall). Do not attempt to `npm install` on a different Electron version without rebuilding.
- **Main process only**: `better-sqlite3` DB access is in `src/main/`. Renderer talks via IPC (`contextIsolation: true`, `sandbox: true`). Never attempt direct DB from renderer.
- **Shared types**: `src/shared/types.ts` defines all types used across main/preload/renderer. Import from `@shared/types`.
- **UUID v4**: Uses `crypto.randomUUID()` native — no `uuid` package. If adding new UUID fields, use this pattern.
- **Scan routing** (`src/shared/scanRouting.ts`): Two modes — `kasir` (barcode-first, then NISN) and `absensi` (NISN-first, then barcode). `routeScan()` and `routeScanAsync()` are pure functions; unit-tested in `tests/scanRouting.test.ts`.
- **CSV import** (`src/main/csv/importStudents.ts`): Tolerates tab/ comma delimiters, BOM, leading-zero NISN, header row skipping, duplicate detection. `parseStudentsCsv(text, existingNisns)` returns `ImportPreview`. Tested in `tests/csvParser.test.ts` (AC10, AC11).
- **Google Sheets sync**: Service Account JSON → encrypted via `safeStorage`. Never commit credentials. See `src/main/sync/google.ts` for validation logic. Setup: `README.md §Setup Google Cloud`.
- **Idempotent sync**: Each sync run reads existing IDs from Sheets → self-heals (marks already-synced rows without rewriting). Backoff: 1→5→15→60 min for retries (`src/main/sync/dedupe.ts`).
- **Offline-first**: Transactions are `pending` when offline. When online, scheduler retries with exponential backoff. Failed → `status='failed'` + `retry_count` incremented.
- **Backup**: Daily checkpoint + 7 generations stored. WAL checkpoint before copy (`src/main/db/backup.ts`). `runBackup(db, dir, true)` = daily; `runBackup(db, dir, false)` = timestamped.
- **Beep audio**: Web Audio API oscillator in renderer — no audio files needed. Tones: success/error/warning/cashier distinguishable (`src/main/ipc/register.ts` ADR-6).

## Project Structure (key dirs)

```
src/
├── main/         # Electron main process — DB, IPC, sync, Google Sheets
│   ├── csv/      # importStudents.ts parser
│   ├── db/       # schema, repos, backup
│   ├── ipc/      # ipcMain handlers (entire renderer -> data flow)
│   ├── sync/     # scheduler, sheetsSync, dedupe
│   └── util/     # time (toIsoLocal, localDate, compactDate), secret (encrypt/decrypt)
├── preload/      # contextBridge — typed API exposed to renderer (window.api = KasirApi)
├── renderer/     # React + Tailwind — UI screens (Kasir, Produk, Absensi, Dashboard, Pengaturan)
└── shared/       # pure functions shared across processes
    ├── types.ts  # all type definitions
    ├── scanRouting.ts # routeScan / normalizeNisn
    └── format.ts # rupiah formatter
```

## Testing Quirks

- Tests run via `vitest` with `environment: 'node'` and `pool: 'forks'`.
- Most tests use **in-memory SQLite** (`:memory:`) — fast, no file persistence.
- File-DB smoke tests (`tests/fileDbSmoke.test.ts`) use temp dir + real `better-sqlite3` file — verify WAL mode, backup, persistence.
- Tests require `ELECTRON_RUN_AS_NODE=1` (set by `npm test` script).
- CSV parser tests cover tab & comma delimiters, BOM, leading-zero NISN, duplicate detection (AC10, AC11).
- Scan routing tests cover both modes, unknown codes, empty input (AC3).
- Dedup/backoff tests cover `partitionById` self-heal and exponential backoff (1→5→15→60 min).
- Daily summary recompute tests verify idempotent recalculation.

## Common Gotchas

| Issue | Fix/Workaround |
|---|---|
| `better-sqlite3` not rebuilding | Run `npx electron-builder install-app-deps` or `node node_modules/electron/install.js && npx electron-builder install-app-deps`. |
| Cross-compile Linux→Windows installer | **Impossible** — build Windows installer on a Windows machine. Linux installer (AppImage/deb) builds fine from this Linux host. |
| Google Sheets sync failing | Check: (a) Service Account JSON is valid with `client_email` + `private_key`; (b) Spreadsheet shares email from JSON as Editor; (c) No `private_key` linebreaks broken (must be literal `\n` in JSON). |
| safeStorage not available (Linux) | Log warning: "safeStorage tidak tersedia — kredensial disimpan base64 TANPA enkripsi OS". Set up OS keyring or accept `plain:` prefix. |
| Scanner mode confusion | Remember: `mode='kasir'` → barcode first, then NISN. `mode='absensi'` → NISN first, then barcode. `routeScan()` routing differs per mode. |
| CSV import: NISN leading zeros | `cleanNisn()` strips surrounding `'` / `"` but preserves leading zeros (stored as TEXT). `normalizeNisn()` strips all non-digits — **use cleanNisn for import, normalizeNisn for lookup only**. |
| Sync backoff | Failed syncs retry with backoff: 1→5→15→60 min. Use `resetFailedBackoff(db)` (tombol [Coba Ulang Semua Failed]) to reset all retries. |
| Dashboard date logic | All dates are **local** (PC timezone offset). `localDate()`, `daysAgo()`, `dateRange()` use the PC's local zone (not UTC). `toIsoLocal()` includes `+07:00`-style offset. |
| npm test & electron deps | Test script sets `ELECTRON_RUN_AS_NODE=1` so vitest can use `better-sqlite3`. If tests fail with "better-sqlite3 not found", ensure `npm install` completed and native modules rebuilt. |

## Repo-Specific Conventions (not language defaults)

- **Price is stored as integer (cents/whole rupiah)** — no decimals. `format.ts rupiah()` formats without decimals: `12500 → "Rp12.500"`.
- **Transactions use UUID v4 for IDs** — not auto-increment. This makes dedup by ID safe across DB restores/backups.
- **Kasir mode scan priority**: barcode → student NISN. If barcode matches a product, it's a product; otherwise try NISN normalization. Reverse for `absensi` mode.
- **Settings map**: `settingsRepo.getAllSettings(db)` / `settingsRepo.setSetting(db, key, value)` — free-form key/value. Keys documented in `src/main/db/schema.ts` and used throughout IPC handlers.
- **Sync interval configurable**: Default 10 minutes via `sync_interval_minutes` setting. Changed in DB `settings` table.
- **`active_cashier_student_id` setting**: When a cashier records attendance, this setting is set. All subsequent transactions until changed will associate with that student (`cashier_name` in payment result).
- **`store_name` setting**: Used in `system:resetData` confirmation — must match exactly (e.g., "GreenMart") to proceed.
- **Label grid**: Default 3×4 in UI; customizable via Pengaturan. Generated by `scripts/gen-icon.cjs`.

## What to Verify Before Starting Work

1. Run `npm test` — confirm all 43 tests pass.
2. Run `npm run typecheck` — confirm no TypeScript strict errors.
3. Run `npm run lint` — confirm no ESLint errors.
4. If adding new DB tables/columns: update `src/main/db/schema.ts` SCHEMA_SQL and consider migration strategy (currently no auto-migration; manual SQL).
5. If adding new IPC handler: register in `src/main/ipc/register.ts` and ensure preload type export in `src/shared/types.ts`.
6. If changing Electron version: rebuild native modules with `npx electron-builder install-app-deps`.

## Existing Instruction Sources Referenced

- `README.md` — full user/developer guide, setup, deployment, Google Cloud setup.
- `docs/AC-CHECKLIST.md` — acceptance criteria map, verification status.
- `docs/ADR.md` — architectural decisions (transport, dedup, credentials, UUID, DB access, beep, labels).
- `vitest.config.ts` — test runner config (vitest, node env, forks pool).
- `package.json` — scripts, deps, build config.
- `.gitignore` — standard ignores + `/env*` (but `!.env.example` committed).
- `.env.example` — env vars template (DATABASE_URL, SESSION_SECRET, ACTION_SALT, BENDAHARA_1..4).