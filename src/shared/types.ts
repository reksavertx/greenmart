// Tipe bersama: main process, preload, dan renderer.

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

export type ProductFilter = 'all' | 'active' | 'inactive';

export interface ProductInput {
  barcode: string;
  name: string;
  price: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
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
  productsList(q: { search?: string; filter?: ProductFilter }): Promise<Product[]>;
  productCreate(input: ProductInput): Promise<Product>;
  productUpdate(id: string, input: ProductInput): Promise<Product>;
  productDelete(id: string, mode: 'soft' | 'hard'): Promise<{ mode: 'soft' | 'hard' }>;
  productHasSales(id: string): Promise<boolean>;
  productByBarcode(barcode: string): Promise<Product | null>;
  /** HTML label lengkap (SVG Code 128 sudah dirender di renderer) dikirim ke main untuk dicetak. */
  printLabels(html: string, labelCount: number): Promise<void>;

  // Siswa & absensi
  pickCsvFile(): Promise<{ content: string; fileName: string } | null>;
  importPreviewCsv(content: string): Promise<ImportPreview>;
  importCommitStudents(rows: ImportRow[]): Promise<{ inserted: number; skipped: number }>;
  studentFindByNisn(nisn: string): Promise<Student | null>;
  attendanceRecord(studentId: string): Promise<ScanIdentity>;
  attendanceToday(): Promise<AttendanceEntry[]>;
  attendanceByDate(date: string): Promise<AttendanceEntry[]>;
  setActiveCashier(studentId: string | null): Promise<void>;
  getActiveCashier(): Promise<Student | null>;

  // Transaksi
  createTransaction(items: CartItemInput[]): Promise<PaymentResult>;

  // Dashboard
  dashboardCards(): Promise<DashboardCards>;
  dashboardTrend(days: number): Promise<TrendPoint[]>;
  dashboardTop(days: number, by: 'qty' | 'revenue'): Promise<TopProduct[]>;
  dashboardHourly(days: number): Promise<HourPoint[]>;

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

  // Event dari main process (mengembalikan fungsi unsubscribe)
  onSyncStatus(cb: (info: SyncStatusInfo) => void): () => void;
  onSyncRunning(cb: (running: boolean) => void): () => void;
}
