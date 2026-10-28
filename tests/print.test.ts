// Test strategi pemilihan printer (v1.0.3) — murni, tanpa Electron.
import { describe, expect, it } from 'vitest';
import {
  PRINTER_DIALOG,
  resolvePrintDevice,
  type PrinterLite,
} from '../src/shared/print';

const printers: PrinterLite[] = [
  { name: 'POS-80', displayName: 'Thermal Printer 80mm', description: '' },
  { name: 'HP-LaserJet', displayName: 'HP LaserJet', description: '' },
];

describe('resolvePrintDevice', () => {
  it('setting kosong → silent ke printer default sistem', () => {
    expect(resolvePrintDevice('', printers)).toEqual({
      silent: true,
      deviceName: '',
      useDialog: false,
    });
  });

  it('setting nama printer yang terpasang → silent ke printer itu (nama sistem, bukan displayName)', () => {
    const res = resolvePrintDevice('POS-80', printers);
    expect(res).toEqual({ silent: true, deviceName: 'POS-80', useDialog: false });
  });

  it('setting __dialog__ → tampilkan dialog print OS', () => {
    expect(resolvePrintDevice(PRINTER_DIALOG, printers)).toEqual({
      silent: false,
      deviceName: '',
      useDialog: true,
    });
  });

  it('pilihan sesi (dropdown overlay kasir) menang atas setting', () => {
    expect(resolvePrintDevice('POS-80', printers, 'HP-LaserJet')?.deviceName).toBe('HP-LaserJet');
    expect(resolvePrintDevice('POS-80', printers, PRINTER_DIALOG)?.useDialog).toBe(true);
    // Sesi kosong berarti "default sistem" — menimpa setting printer spesifik.
    expect(resolvePrintDevice('POS-80', printers, '')).toEqual({
      silent: true,
      deviceName: '',
      useDialog: false,
    });
  });

  it('printer hilang (unplug) → jatuh ke dialog + notice agar kasir tetap bisa memilih', () => {
    const res = resolvePrintDevice('POS-80', [printers[1]]);
    expect(res.useDialog).toBe(true);
    expect(res.deviceName).toBe('');
    expect(res.notice).toMatch(/tidak ditemukan/);
  });

  it('pilihan sesi yang hilang juga memicu fallback dialog + notice', () => {
    const res = resolvePrintDevice('', printers, 'Printer-Hantu');
    expect(res.useDialog).toBe(true);
    expect(res.notice).toContain('Printer-Hantu');
  });

  it('setting undefined (belum ada di DB lama) diperlakukan seperti default sistem', () => {
    expect(resolvePrintDevice(undefined, printers)).toEqual({
      silent: true,
      deviceName: '',
      useDialog: false,
    });
  });

  it('nama dengan spasi di awal/akhir di-trim', () => {
    expect(resolvePrintDevice(' POS-80 ', printers)?.deviceName).toBe('POS-80');
  });
});
