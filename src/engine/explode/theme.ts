/**
 * Light and dark themes, DOM-safe: no three, no React. The page's theme is `data-theme` on <html>
 * ("light" | "dark"), set before first paint by `themeScript()` and afterwards by `setThemePreference()`
 * (the ThemeToggle). The stage reads it through `useTheme()` and eases its lights and colours to the
 * values an app gave for that theme.
 */

export type Theme = "light" | "dark";
/** What a visitor chose: a theme, or whichever the OS asks for. */
export type ThemePreference = Theme | "system";

/** A value, or one per theme. A theme left out falls back to the engine's default for that prop. */
export type Themed<T> = T | { light?: T; dark?: T };

export const THEME_ATTR = "data-theme";
/** The visitor's choice, mirrored on <html> so the toggle and the OS listener never have to read storage. */
export const THEME_PREF_ATTR = "data-theme-pref";
export const THEME_STORAGE_KEY = "theme";

export interface StagePalette {
  sky: string;
  ground: string;
  hemisphere: number;
  key: string;
  keyIntensity: number;
  /** Where the key light sits relative to the model, in multiples of its bounding radius. */
  keyFrom: [number, number, number];
  shadow: string;
  shadowOpacity: number;
  /** Two lights behind the model, left and right, that draw its outline; 0 leaves them out. */
  rim: string;
  rimIntensity: number;
}

export const DEFAULT_PALETTE: StagePalette = {
  sky: "#dfe6f5",
  ground: "#1a1f2b",
  hemisphere: 1.5,
  key: "#ffffff",
  keyIntensity: 2.4,
  keyFrom: [0.9, 1.8, 1.1],
  shadow: "#000000",
  shadowOpacity: 0.28,
  rim: "#ffffff",
  rimIntensity: 0,
};

/** True for the `{ light, dark }` form. No stage option has a key called light or dark of its own. */
export function isThemed<T>(value: Themed<T> | undefined): value is { light?: T; dark?: T } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && ("light" in value || "dark" in value);
}

/** The value for one theme; a plain value applies to both. */
export function pickTheme<T>(value: Themed<T> | undefined, theme: Theme): T | undefined {
  return isThemed(value) ? value[theme] : value;
}

/** A copy without the keys whose value is undefined, so spreading it over defaults never blanks one. */
export function defined<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** The palette an app asked for, for one theme, over the defaults. */
export function resolvePalette(override: Themed<Partial<StagePalette>> | undefined, theme: Theme): StagePalette {
  return { ...DEFAULT_PALETTE, ...defined(pickTheme(override, theme)) };
}

/** The theme a preference means right now. */
export function resolveTheme(pref: ThemePreference, systemDark: boolean): Theme {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/** Anything that is not a known preference is "system". */
export function parsePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * The body of the no-flash inline script for a layout's <head>:
 * `<script dangerouslySetInnerHTML={{ __html: themeScript() }} />`.
 *
 * It reads localStorage (`light`, `dark` or `system`; anything else, a missing key or a throwing
 * storage is `system`), resolves system through matchMedia, sets `data-theme` and `style.colorScheme`
 * on <html>, mirrors the choice in `data-theme-pref`, and follows OS changes while the choice is system.
 */
export function themeScript(storageKey: string = THEME_STORAGE_KEY): string {
  // JSON.stringify makes it a valid JS string; the replace keeps a stray "</script" inside it inert.
  const key = JSON.stringify(storageKey).replace(/</g, "\\u003c");
  return `(function(){try{var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)"),p;try{p=localStorage.getItem(${key})}catch(e){}if(p!=="light"&&p!=="dark")p="system";d.setAttribute("${THEME_PREF_ATTR}",p);function a(){var c=d.getAttribute("${THEME_PREF_ATTR}"),t=c==="light"||c==="dark"?c:m.matches?"dark":"light";d.setAttribute("${THEME_ATTR}",t);d.style.colorScheme=t}a();m.addEventListener("change",function(){if(d.getAttribute("${THEME_PREF_ATTR}")==="system")a()})}catch(e){}})();`;
}

/**
 * Applies a choice at runtime and remembers it: `data-theme-pref`, `data-theme`, `style.colorScheme`
 * and localStorage (in try/catch: a blocked storage still changes the theme for this visit). The
 * listener `themeScript()` installed follows the OS from then on when the choice is system.
 */
export function setThemePreference(pref: ThemePreference, storageKey: string = THEME_STORAGE_KEY): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const systemDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveTheme(pref, systemDark);
  root.setAttribute(THEME_PREF_ATTR, pref);
  root.setAttribute(THEME_ATTR, theme);
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(storageKey, pref);
  } catch {
    // Storage is blocked or full: the choice lasts until the page closes.
  }
}
