export type Theme = 'light' | 'dark' | 'system';

export function applyTheme(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // storage unavailable
  }
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return (localStorage.getItem('theme') as Theme) ?? 'dark';
  } catch {
    return 'dark';
  }
}
