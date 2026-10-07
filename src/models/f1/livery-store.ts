/**
 * The visitor's livery as live state. `data-livery` on <html> is the one source of truth: the inline
 * script (livery-choice.ts) sets it before first paint from the address, the stored choice or Ghost, and
 * this module changes it afterwards. The CSS accent, the picker, the page copy, the 3D car and the wind
 * tunnel all read it from here, so a soft navigation from `/?livery=white-stripes` to `/tunnel` keeps the white-stripes livery
 * without anything parsing the address twice. DOM-only (no three); the hook is for client components.
 */
import { useSyncExternalStore } from "react";
import { LIVERY_ATTR, LIVERY_STORAGE_KEY, withLiveryParam } from "./livery-choice";
import { asLiveryId, type LiveryId } from "./livery-meta";
import { DEFAULT_LIVERY_ID } from "./livery-name";

const listeners = new Set<() => void>();

/** The livery on <html> right now; Ghost when there is no document, no attribute or a value that is not an id. */
export function currentLivery(): LiveryId {
  if (typeof document === "undefined") return DEFAULT_LIVERY_ID;
  return asLiveryId(document.documentElement.getAttribute(LIVERY_ATTR)) ?? DEFAULT_LIVERY_ID;
}

/**
 * Rewrites a legacy id (`gulf`) to its current one where the visitor can see or keep it: the stored
 * choice, and the `livery` value in the address (replaceState, so no navigation and no history entry;
 * other parameters and the hash stay). A current id, a junk value or no value writes nothing. The
 * inline script only resolves the id for first paint, so this is where the old spelling is retired.
 */
export function normaliseLivery(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(LIVERY_STORAGE_KEY);
    const id = asLiveryId(stored);
    if (id && id !== stored) localStorage.setItem(LIVERY_STORAGE_KEY, id);
  } catch {
    // Storage is blocked: nothing to rewrite.
  }
  const { pathname, search, hash } = window.location;
  const asked = new URLSearchParams(search).get("livery");
  const id = asLiveryId(asked);
  if (id && id !== asked) window.history.replaceState(window.history.state, "", `${pathname}${withLiveryParam(search, id)}${hash}`);
}

let normalised = false;

export function subscribeLivery(fn: () => void): () => void {
  if (!normalised) {
    normalised = true;
    normaliseLivery();
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Picks a livery: the attribute (which the accent CSS answers at once), localStorage (in try/catch: a
 * blocked storage still changes this visit), and `?livery=` in the address through replaceState, which
 * keeps every other parameter as it was (the deep-link sync does the same for its own). No history entry.
 */
export function setLivery(id: LiveryId): void {
  if (!asLiveryId(id) || typeof document === "undefined") return;
  const changed = currentLivery() !== id;
  document.documentElement.setAttribute(LIVERY_ATTR, id);
  try {
    localStorage.setItem(LIVERY_STORAGE_KEY, id);
  } catch {
    // Storage is blocked or full: the choice lasts until the page closes.
  }
  const { pathname, search, hash } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${withLiveryParam(search, id)}${hash}`);
  if (changed) listeners.forEach((fn) => fn());
}

/** The livery, re-read whenever it changes. The server, and the first client render, say Ghost: no hydration mismatch. */
export function useLivery(): LiveryId {
  return useSyncExternalStore(subscribeLivery, currentLivery, () => DEFAULT_LIVERY_ID);
}
