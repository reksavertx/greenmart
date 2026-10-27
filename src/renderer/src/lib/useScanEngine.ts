// Keyboard-wedge listener global (PRD F1.1):
// - semua ketikan karakter + Enter/Tab dikommit di mana pun fokus berada (saat engine aktif)
// - Esc mengosongkan buffer
// - input manual lewat keyboard juga bekerja
import { useEffect, useRef, useState } from 'react';
import { routeScanAsync } from '@shared/scanRouting';
import type { ScanMode } from '@shared/types';

export interface ScanEngineHandlers {
  onProduct: (product: { id: string; barcode: string; name: string; price: number; stock: number; is_active: number }) => void;
  onStudent: (student: { id: string; nisn: string; name: string; class_name: string; gender: 'P' | 'L' }) => void;
  onUnknown: (code: string) => void;
}

export interface ScanNavHandlers {
  onDown?: () => void;
  onUp?: () => void;
  onDelete?: () => void;
  onQty?: (delta: 1 | -1) => void;
  /** Enter saat buffer kosong (mis. jalankan tombol bayar). */
  onEnterPlain?: () => void;
}

interface Options {
  active: boolean;
  /** true saat dialog/overlay terbuka — engine menonaktifkan diri. */
  blocked: boolean;
  mode: ScanMode;
  handlers: ScanEngineHandlers;
  nav?: ScanNavHandlers;
}

export function useScanEngine(opts: Options): { buffer: string } {
  const { active, blocked, mode } = opts;
  const handlersRef = useRef(opts.handlers);
  const navRef = useRef(opts.nav);

  const [buffer, setBuffer] = useState('');
  const bufferRef = useRef('');

  useEffect(() => {
    handlersRef.current = opts.handlers;
    navRef.current = opts.nav;
  });

  useEffect(() => {
    if (!active || blocked) return;

    const commit = (): void => {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      setBuffer('');
      if (!code) {
        navRef.current?.onEnterPlain?.();
        return;
      }
      void (async () => {
        const result = await routeScanAsync(code, mode, {
          findProduct: (bc) => window.api.productByBarcode(bc),
          findStudent: (nisn) => window.api.studentFindByNisn(nisn),
        });
        if (result.type === 'product') handlersRef.current.onProduct(result.product);
        else if (result.type === 'student') handlersRef.current.onStudent(result.student);
        else if (result.type === 'unknown') handlersRef.current.onUnknown(result.code);
      })();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (bufferRef.current) {
          bufferRef.current = '';
          setBuffer('');
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        commit();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navRef.current?.onDown?.();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navRef.current?.onUp?.();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        navRef.current?.onDelete?.();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        navRef.current?.onQty?.(1);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        navRef.current?.onQty?.(-1);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        bufferRef.current += e.key;
        setBuffer(bufferRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, blocked, mode]);

  return { buffer };
}
