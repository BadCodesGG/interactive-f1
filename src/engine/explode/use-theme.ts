"use client";

import { useSyncExternalStore } from "react";
import { parsePreference, THEME_ATTR, THEME_PREF_ATTR, type Theme, type ThemePreference } from "./theme";

/** Calls back whenever one of <html>'s attributes changes. */
function watch(attribute: string) {
  return (onChange: () => void) => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [attribute] });
    return () => observer.disconnect();
  };
}

const watchTheme = watch(THEME_ATTR);
const watchPreference = watch(THEME_PREF_ATTR);

const readTheme = (): Theme => (document.documentElement.getAttribute(THEME_ATTR) === "dark" ? "dark" : "light");
const readPreference = (): ThemePreference => parsePreference(document.documentElement.getAttribute(THEME_PREF_ATTR));

/**
 * The page's theme: `data-theme` on <html>, live. "light" on the server and whenever the attribute
 * is missing, so a server render and the first client render agree; a page that sets the attribute
 * with `themeScript()` before paint re-renders once to the real value.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(watchTheme, readTheme, () => "light");
}

/** What the visitor chose (`data-theme-pref`): "system" on the server and until something sets it. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(watchPreference, readPreference, () => "system");
}
