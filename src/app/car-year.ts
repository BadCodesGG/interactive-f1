"use client";

/**
 * Which car the exploded view shows, 2022 or 2026, as live state. It starts from `?car=2022` in the
 * address (the default, 2026, leaves no parameter) and changes through `setCarYear`, which edits the
 * address in place with replaceState (every other parameter kept, no history entry). The server, and the
 * first client render, say 2026, so nothing mismatches when hydrating; the real value arrives straight after.
 *
 * The year outlives the page: a soft navigation to /tunnel and back to / loads no module afresh, so the page
 * that mounts again settles the two with `useSyncCarYear` (a year the address names wins; an address that names
 * none takes the year this visit chose), and again on Back and Forward.
 */
import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_YEAR, parseCarYear, withCarParam, type CarYear } from "@/data/car-specs";

const listeners = new Set<() => void>();
/** Read from the address once, on the first ask in the browser; after that this is the truth. */
let year: CarYear | null = null;

export function currentCarYear(): CarYear {
  if (typeof window === "undefined") return DEFAULT_YEAR;
  year ??= parseCarYear(new URLSearchParams(window.location.search).get("car")) ?? DEFAULT_YEAR;
  return year;
}

/**
 * Makes the address and the year agree after a navigation. A `car` the address names wins (a Back to an entry
 * with another year, a link that carries one); an address that names none gets the year the visitor picked
 * written back, so a Link to "/" does not leave the car on 2022 under a URL that says nothing.
 */
export function syncCarYear(): void {
  if (typeof window === "undefined") return;
  const named = parseCarYear(new URLSearchParams(window.location.search).get("car"));
  const now = currentCarYear();
  if (named && named !== now) {
    year = named;
    listeners.forEach((fn) => fn());
  } else if (!named && now !== DEFAULT_YEAR) {
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${withCarParam(search, now)}${hash}`);
  }
}

/**
 * For the page that shows the car: settles the year and the address when it mounts, and on Back and Forward
 * for as long as it stays on the page it mounted on (another page's address has no `car` to settle with).
 */
export function useSyncCarYear(): void {
  useEffect(() => {
    const here = window.location.pathname;
    const onPop = () => {
      if (window.location.pathname === here) syncCarYear();
    };
    syncCarYear();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

export function setCarYear(next: CarYear): void {
  if (typeof window === "undefined" || currentCarYear() === next) return;
  year = next;
  const { pathname, search, hash } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${withCarParam(search, next)}${hash}`);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useCarYear(): CarYear {
  return useSyncExternalStore(subscribe, currentCarYear, () => DEFAULT_YEAR);
}
