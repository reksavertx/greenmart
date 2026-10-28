// Strategi pemilihan printer (v1.0.3) — dipakai main process & renderer.
// Nilai setting 'receipt_printer' / pilihan sesi:
//   ''            → cetak langsung (silent) ke printer default sistem
//   '__dialog__'  → tampilkan dialog print OS (user pilih printer per cetak)
//   <nama>        → cetak langsung (silent) ke printer dengan nama sistem tersebut

export const PRINTER_DIALOG = '__dialog__';
export const PRINTER_SYSTEM_DEFAULT = '';

/** Info printer ringan (subset Electron PrinterInfo) untuk UI dropdown. */
export interface PrinterLite {
  /** Nama sistem yang dipakai `deviceName` saat print (bukan displayName). */
  name: string;
  displayName: string;
  description: string;
}

export interface PrintDeviceResolution {
  /** true = cetak langsung tanpa dialog; false = tampilkan dialog print OS. */
  silent: boolean;
  /** Nama printer sistem ('' = default sistem). */
  deviceName: string;
  useDialog: boolean;
  /** Pesan peringatan bila pilihan tidak tersedia (mis. printer tercabut). */
  notice?: string;
}

/**
 * Tentukan opsi cetak dari setting tersimpan + pilihan sesi (dropdown overlay kasir).
 * Murni — diunit-test di tests/print.test.ts.
 *
 * Aturan:
 * - Pilihan sesi menang atas setting.
 * - '__dialog__' → dialog print (silent=false).
 * - Nama printer yang masih ada di sistem → silent ke printer itu.
 * - Nama printer yang HILANG (unplug/dihapus) → jatuh ke dialog print agar kasir
 *   tetap bisa memilih, disertai notice.
 */
export function resolvePrintDevice(
  setting: string | undefined,
  printers: PrinterLite[],
  sessionChoice?: string,
): PrintDeviceResolution {
  const choice = (sessionChoice ?? setting ?? '').trim();
  if (choice === PRINTER_DIALOG) return { silent: false, deviceName: '', useDialog: true };
  if (choice === '' || choice === PRINTER_SYSTEM_DEFAULT) {
    return { silent: true, deviceName: '', useDialog: false };
  }
  const found = printers.find((p) => p.name === choice);
  if (found) return { silent: true, deviceName: found.name, useDialog: false };
  return {
    silent: false,
    deviceName: '',
    useDialog: true,
    notice: `Printer "${choice}" tidak ditemukan — pilih printer pada dialog yang muncul.`,
  };
}
