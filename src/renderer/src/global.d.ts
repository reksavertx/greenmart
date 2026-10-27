import type { KasirApi } from '@shared/types';

declare global {
  interface Window {
    api: KasirApi;
  }
}

export {};

// Aset statis (vite) — logo sekolah webp
declare module '*.webp' {
  const src: string;
  export default src;
}
