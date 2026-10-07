export type Theme = 'system' | 'light' | 'dark';
export const THEMES: Theme[] = ['system', 'light', 'dark'];
export const THEME_PREF = 'theme';

/** Sets the page theme; "system" follows the OS setting. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** The stored theme, read before first render so the page does not flash. */
export function storedTheme(): Theme {
  try {
    const raw = localStorage.getItem(`anno1800-planner:pref:${THEME_PREF}`);
    const t = raw === null ? 'system' : (JSON.parse(raw) as Theme);
    return THEMES.includes(t) ? t : 'system';
  } catch {
    return 'system';
  }
}
