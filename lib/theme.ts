// ============================================================
// Dark mode toggle — explicit user choice, persisted in
// localStorage, applied via a data-theme attribute on <html>.
// Falls back to the OS preference (prefers-color-scheme) when the
// user hasn't chosen explicitly — see the no-flash inline script in
// app/layout.tsx, which mirrors this same logic synchronously before
// paint so the page never flashes the wrong theme on load.
// ============================================================

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "seasentry-theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : null;
}

export function getEffectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = getEffectiveTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Inline script source (as a string) run synchronously in <head> before
 * hydration, so the correct theme is applied before first paint — avoids
 * a flash of the wrong theme. Kept as a plain string (not imported) since
 * it runs outside the React/module graph. */
export const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;
