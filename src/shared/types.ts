// Tipe bersama: main process, preload, dan renderer.
import type { DummyImportResult } from './dummyData';

export type SyncStatus = 'pending' | 'synced' | 'failed';
export type ScanMode = 'kasir' | 'absensi';
export type Gender = 'P' | 'L';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  min_stock: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  category_id: string | null;
}

export interface Category {
  id: string;
  name: string;
  product_count?: number;
}

export interface Student {
  id: string;
  nis: string | null;
  nisn: string;
  name: string;
  gender: Gender;
  class_name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CartItemInput {
  barcode: string;
  qty: number;
}

export interface PaymentResult {
  id: string;
  code: string;
  total: number;
  item_count: number;
  sold_at: string;
  cashier_name: string | null;
  cashier_class: string | null;
}

export interface AttendanceEntry {
  student_id: string;
  nisn: string;
  name: string;
  class_name: string;
  gender: Gender;
  first_scan: string;
  last_scan: string;
  scan_count: number;
}

/** Rekap kehadiran per siswa untuk satu bulan (v1.0.1). */
export interface AttendanceRecapRow {
  student_id: string;
  nisn: string;
  name: string;
  class_name: string;
  gender: Gender;
  days_count: number;
  dates: string[];
  avg_first_time: string | null;
}

export interface ScanIdentity {
  id: string;
  nisn: string;
  name: string;
  class_name: string;
  gender: Gender;
  scanned_at: string;
}

export interface ImportRow {
  line: number;
  className: string;
  nis: string;
  nisn: string;
  name: string;
  gender: Gender | '';
  status: 'valid' | 'duplicate' | 'error';
  error?: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  summary: { total: number; valid: number; duplicates: number; errors: number };
}

export interface SyncLogEntry {
  id: number;
  scope: string;
  status: string;
  message: string | null;
  created_at: string;
}

export interface StatusCounts {
  pending: number;
  failed: number;
}

export interface SyncStatusInfo {
  running: boolean;
  last_sync_at: string | null;
  transactions: StatusCounts;
  daily: StatusCounts;
  recent_errors: SyncLogEntry[];
}

export interface DashboardCards {
  date: string;
  revenue: number;
  transaction_count: number;
  items_sold: number;
}

export interface TrendPoint {
  date: string;
  revenue: number;
  /** v1.0.1: kuantitas item terjual harian (grafik garis dua series). */
  qty: number;
}

/** Distribusi penjualan per kategori (v1.0.1). */
export interface CategorySlice {
  category: string;
  qty: number;
  revenue: number;
}

/** Statistik pemusatan periode (v1.0.1). */
export interface PeriodStats {
  mean_daily_revenue: number;
  total_revenue: number;
  total_qty: number;
  days: number;
}

export interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

export interface HourPoint {
  hour: number;
  revenue: number;
  count: number;
}

export interface SettingsMap {
  [key: string]: string;
}

export interface LabelGrid {
  cols: number;
  rows: number;
  copies: number;
}

export interface LabelItem {
  barcode: string;
  name: string;
  price: number;
}

export interface BackupFile {
  name: string;
  size: number;
  created: string;
}

export interface BackupInfo {
  dir: string;
  files: BackupFile[];
}

// ===================== v1.0.1 =====================

export type OpnamePhase = 'awal' | 'akhir';

export interface StockOpname {
  id: string;
  local_date: string;
  phase: OpnamePhase;
  petugas: string | null;
  status: 'draft' | 'done';
  created_at: string;
  confirmed_at: string | null;
  synced_at: string | null;
}

export interface StockOpnameItem {
  id: string;
  opname_id: string;
  product_id: string | null;
  barcode: string;
  product_name: string;
  price: number;
  system_stock: number;
  physical_stock: number | null;
  diff_qty: number | null;
  diff_value: number | null;
}

export interface StockOpnameDetail extends StockOpname {
  items: StockOpnameItem[];
  filled_count: number;
  total_count: number;
  diff_items: number;
  diff_value_total: number;
}

export interface StockOpnameSummary {
  id: string;
  local_date: string;
  phase: OpnamePhase;
  petugas: string | null;
  status: 'draft' | 'done';
  confirmed_at: string | null;
  synced_at: string | null;
  total_items: number | null;
  diff_items: number | null;
  diff_value_total: number | null;
}

/** Baris struk penjualan (item snapshot saat jual). */
export interface ReceiptItemLine {
  name: string;
  qty: number;
  price: number;
  subtotal: number;
}

export interface ReceiptData {
  storeName: string;
  code: string;
  soldAt: string;
  items: ReceiptItemLine[];
  total: number;
  itemCount: number;
  /** Nama kasir jaga hari itu (1-3 orang, dari absensi). */
  cashiers: string[];
  logoDataUri: string | null;
  widthMm: number;
}

/** Agregat item terjual untuk laporan (v1.0.1). */
export interface SalesReportRow {
  barcode: string;
  product_name: string;
  category_name: string | null;
  qty: number;
  revenue: number;
}

export interface SalesDailyItemRow {
  local_date: string;
  barcode: string;
  product_name: string;
  category_name: string | null;
  qty: number;
  revenue: number;
}

export type ReportMode = 'harian' | 'mingguan' | 'bulanan';

export interface ExportedFile {
  ok: boolean;
  path?: string;
  message: string;
}

// ===================== v1.0.2 (data dummy) =====================
export type {
  DummyBundle,
  DummyProduct,
  DummyStudent,
  DummyAttendance,
  DummyTransaction,
  DummyOpname,
} from './dummyData';
export type { DummyImportCounts, DummyImportResult } from './dummyData';

export type ProductFilter = 'all' | 'active' | 'inactive';

export interface ProductInput {
  barcode: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  category_id: string | null;
}

// ---- Hasil routing scan (pure, diuji unit test) ----

export interface ScanProductRef {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  is_active: number;
}

export interface ScanStudentRef {
  id: string;
  nisn: string;
  name: string;
  class_name: string;
  gender: Gender;
}

export type ScanResult =
  | { type: 'product'; product: ScanProductRef }
  | { type: 'student'; student: ScanStudentRef }
  | { type: 'unknown'; code: string }
  | { type: 'empty' };

// ---- Kontrak API preload (window.api) ----

export interface KasirApi {
  // Produk
  productsList(q: {
    search?: string;
    filter?: ProductFilter;
    categoryId?: string;
  }): Promise<Product[]>;
  productCreate(input: ProductInput): Promise<Product>;
  productUpdate(id: string, input: ProductInput): Promise<Product>;
  productDelete(id: string, mode: 'soft' | 'hard'): Promise<{ mode: 'soft' | 'hard' }>;
  productHasSales(id: string): Promise<boolean>;
  productByBarcode(barcode: string): Promise<Product | null>;
  /** HTML label lengkap (SVG Code 128 sudah dirender di renderer) dikirim ke main untuk dicetak. */
  printLabels(html: string, labelCount: number): Promise<void>;

  // Kategori (v1.0.1)
  categoriesList(): Promise<Category[]>;
  categoriesCreate(name: string): Promise<Category>;
  categoriesUpdate(id: string, name: string): Promise<Category>;
  categoriesDelete(id: string): Promise<void>;

  // Siswa & absensi
  pickCsvFile(): Promise<{ content: string; fileName: string } | null>;
  importPreviewCsv(content: string): Promise<ImportPreview>;
  importCommitStudents(rows: ImportRow[]): Promise<{ inserted: number; skipped: number }>;
  studentFindByNisn(nisn: string): Promise<Student | null>;
  attendanceRecord(studentId: string): Promise<ScanIdentity>;
  attendanceToday(): Promise<AttendanceEntry[]>;
  attendanceByDate(date: string): Promise<AttendanceEntry[]>;
  /** Rekap kehadiran per siswa untuk bulan 'YYYY-MM' (v1.0.1). */
  attendanceRecap(month: string): Promise<AttendanceRecapRow[]>;
  setActiveCashier(studentId: string | null): Promise<void>;
  getActiveCashier(): Promise<Student | null>;

  // Transaksi
  createTransaction(items: CartItemInput[]): Promise<PaymentResult>;
  /** Item snapshot satu transaksi — untuk struk (v1.0.1). */
  transactionItems(transactionId: string): Promise<ReceiptItemLine[]>;
  /** Cetak struk thermal; main process menyusun HTML (logo, kasir jaga, lebar kertas). */
  printReceipt(transactionId: string): Promise<void>;

  // Dashboard
  dashboardCards(): Promise<DashboardCards>;
  dashboardTrend(days: number): Promise<TrendPoint[]>;
  dashboardTop(days: number, by: 'qty' | 'revenue'): Promise<TopProduct[]>;
  dashboardHourly(days: number): Promise<HourPoint[]>;
  /** Distribusi penjualan per kategori (v1.0.1). */
  dashboardByCategory(days: number): Promise<CategorySlice[]>;
  /** Statistik pemusatan periode: mean omzet harian dsb. (v1.0.1). */
  dashboardStats(days: number): Promise<PeriodStats>;
  /** Daftar produk aktif dengan stok <= batas alert global (v1.0.1). */
  dashboardLowStock(): Promise<Product[]>;

  // Pengaturan
  settingsAll(): Promise<SettingsMap>;
  settingsSet(key: string, value: string): Promise<void>;

  // Sinkronisasi
  syncNow(): Promise<{ ok: boolean; message: string }>;
  syncStatus(): Promise<SyncStatusInfo>;
  syncRetryFailed(): Promise<{ ok: boolean; message: string }>;
  syncOpenSheet(): Promise<void>;
  googleTestConnection(payload: { credentialJson: string; spreadsheetInput: string }): Promise<{
    ok: boolean;
    message: string;
  }>;
  googleSave(payload: { credentialJson: string; spreadsheetInput: string }): Promise<{
    ok: boolean;
    message: string;
  }>;
  googleConfigured(): Promise<{
    hasCredential: boolean;
    spreadsheetId: string | null;
    spreadsheetUrl: string | null;
    encryptionAvailable: boolean;
  }>;

  // Backup & danger zone
  backupInfo(): Promise<BackupInfo>;
  backupChooseDir(): Promise<string | null>;
  backupRunNow(): Promise<void>;
  resetData(scope: 'transactions' | 'products', confirmName: string): Promise<{
    ok: boolean;
    message: string;
  }>;

  // Laporan harian/mingguan/bulanan (v1.0.1)
  reportRows(mode: ReportMode, anchor: string): Promise<{ range: { start: string; end: string }; rows: SalesReportRow[] }>;
  reportExportCsv(mode: ReportMode, anchor: string): Promise<ExportedFile>;

  // Stok opname (v1.0.1)
  opnameReminder(): Promise<{ due: 'awal' | 'akhir' | null; cycleDay: number; cycleDays: number; lastDate: string | null }>;
  opnameStart(phase: 'awal' | 'akhir'): Promise<StockOpnameDetail>;
  opnameCurrent(): Promise<StockOpnameDetail | null>;
  opnameGet(id: string): Promise<StockOpnameDetail | null>;
  opnameSetPhysical(itemId: string, qty: number | null): Promise<StockOpnameItem>;
  opnameFillSystem(id: string): Promise<number>;
  opnameConfirm(id: string): Promise<StockOpnameDetail>;
  opnameCancel(id: string): Promise<void>;
  opnameHistory(): Promise<StockOpnameSummary[]>;

  // Data dummy / demo (v1.0.2)
  /** Pilih file JSON demo → backup otomatis → impor merge (duplikat dilewati). */
  demoImportDummy(): Promise<DummyImportResult>;

  // Event dari main process (mengembalikan fungsi unsubscribe)
  onSyncStatus(cb: (info: SyncStatusInfo) => void): () => void;
  onSyncRunning(cb: (running: boolean) => void): () => void;
}
