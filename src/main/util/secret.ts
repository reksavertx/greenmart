// Enkripsi kredensial via Electron safeStorage (PRD §5.5).
// Menyimpan prefix "enc:" (terenkripsi OS) atau "plain:" (fallback Linux tanpa keyring —
// diberi peringatan keras). Async API dipakai bila tersedia (sinkron deprecated di Electron 46+).
import { safeStorage } from 'electron';
import log from 'electron-log/main';

function asyncAvailable(): boolean {
  const s = safeStorage as unknown as {
    isAsyncEncryptionAvailable?: () => Promise<boolean>;
    isEncryptionAvailable?: () => boolean;
  };
  return typeof s.isAsyncEncryptionAvailable === 'function';
}

export function encryptionAvailable(): Promise<boolean> {
  if (asyncAvailable()) return safeStorage.isAsyncEncryptionAvailable();
  return Promise.resolve(safeStorage.isEncryptionAvailable());
}

export async function encryptSecret(plain: string): Promise<string> {
  if (asyncAvailable()) {
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      const buf = await safeStorage.encryptStringAsync(plain);
      return 'enc:' + buf.toString('base64');
    }
  } else if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plain);
    return 'enc:' + buf.toString('base64');
  }
  log.warn('safeStorage tidak tersedia — kredensial disimpan base64 TANPA enkripsi OS. Segera konfigurasi keyring.');
  return 'plain:' + Buffer.from(plain, 'utf8').toString('base64');
}

export async function decryptSecret(stored: string): Promise<string> {
  if (stored.startsWith('enc:')) {
    const buf = Buffer.from(stored.slice(4), 'base64');
    // Electron 44+: decryptStringAsync bisa mengembalikan Promise<string> ATAU Promise<{ result }>.
    const read = async (): Promise<string> => {
      const ret: unknown = await safeStorage.decryptStringAsync(buf);
      if (typeof ret === 'string') return ret;
      const obj = ret as { result?: string };
      if (typeof obj?.result === 'string') return obj.result;
      throw new Error('Gagal mendekripsi kredensial (safeStorage).');
    };
    if (asyncAvailable() && (await safeStorage.isAsyncEncryptionAvailable())) return read();
    return safeStorage.decryptString(buf);
  }
  if (stored.startsWith('plain:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf8');
  }
  throw new Error('Format kredensial tidak dikenal.');
}
