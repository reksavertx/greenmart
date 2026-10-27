// Tema terang/gelap/sistem (v1.0.1) — disimpan di setting 'theme', diterapkan ke <html data-theme>.
export type ThemeSetting = 'light' | 'dark' | 'system';

export function normalizeTheme(raw: string | undefined): ThemeSetting {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** Terapkan tema; return nilai efektif ('light'/'dark') untuk indikator UI. */
export function applyTheme(setting: ThemeSetting): 'light' | 'dark' {
  const effective =
    setting === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : setting;
  document.documentElement.setAttribute('data-theme', effective);
  return effective;
}

/** Ikuti perubahan OS saat mode 'system'. Return cleanup. */
export function watchSystemTheme(setting: ThemeSetting, onChange: () => void): () => void {
  if (setting !== 'system') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
