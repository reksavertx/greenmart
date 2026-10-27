// Format file data dummy/demo (v1.0.2) — dipakai importer main process & generator script.
// Tanggal ABSOLUT (YYYY-MM-DD) — generator menandai akhir pekan & hari libur nasional secara akurat.
// Import bersifat MERGE: duplikat (barcode/NISN/ID transaksi) dilewati, data asli tidak disentuh.

export interface DummyProduct {
  barcode: string;
  name: string;
  price: number;
  /** Stok akhir yang diinginkan (transaksi dummy tidak mengurangi stok saat import). */
  stock: number;
  /** Nama kategori (dibuat bila belum ada). */
  category: string;
}

export interface DummyStudent {
  class_name: string;
  nis: string;
  nisn: string;
  name: string;
  gender: 'L' | 'P';
}

export interface DummyAttendance {
  nisn: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

export interface DummyTransaction {
  /** UUID v4 stabil di file — kunci dedup antar-import. */
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  items: { barcode: string; qty: number }[];
}

export interface DummyOpname {
  date: string;
  phase: 'awal' | 'akhir';
  petugas: string;
  items: {
    barcode: string;
    /** Snapshot stok sistem saat opname (ditentukan generator agar selisihnya masuk akal). */
    system: number;
    physical: number;
  }[];
}

export interface DummyBundle {
  format: 'greenmart-dummy';
  version: 1;
  generated_at: string;
  window: { start: string; end: string };
  /** Hari libur nasional/cuti bersama dalam window — informasional. */
  holidays: { date: string; name: string }[];
  categories: string[];
  products: DummyProduct[];
  students: DummyStudent[];
  attendance: DummyAttendance[];
  transactions: DummyTransaction[];
  opnames: DummyOpname[];
}

export interface DummyImportCounts {
  products: number;
  students: number;
  attendance: number;
  transactions: number;
  items: number;
  opnames: number;
  days: number;
}

export interface DummyImportResult {
  ok: boolean;
  message: string;
  counts?: DummyImportCounts;
}
