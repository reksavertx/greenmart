// Deklarasi global untuk renderer (tsconfig.web).
import type { KasirApi } from '@shared/types';

declare global {
  interface Window {
    api: KasirApi;
  }
}

export {};
