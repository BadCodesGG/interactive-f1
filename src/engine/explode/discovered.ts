/**
 * The parts-discovered counter: which parts a visitor has opened, kept in localStorage under a key
 * namespaced per app. Every read and write is guarded (private mode, blocked storage and a full
 * quota all throw) and corrupt or foreign data reads as empty, so the counter can only ever be
 * wrong in the visitor's favour, never break the page.
 */
import { useSyncExternalStore } from "react";

export const foundKey = (app: string) => `explode:${app}:found`;

const EMPTY: ReadonlySet<string> = new Set();
const noopSubscribe = () => () => {};

/** localStorage, or null where touching it throws (blocked cookies, sandboxed frames). */
export function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored ids that are still parts of the model; anything else in the value is dropped. */
export function readFound(storage: Pick<Storage, "getItem"> | null, key: string, valid: ReadonlySet<string>): Set<string> {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && valid.has(id)));
  } catch {
    return new Set();
  }
}

export function writeFound(storage: Pick<Storage, "setItem" | "removeItem"> | null, key: string, found: ReadonlySet<string>): void {
  try {
    if (found.size === 0) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify([...found]));
  } catch {
    // Not saved; the counter still works for this visit.
  }
}

/** "12 of 18 found". */
export function foundLabel(found: number, total: number): string {
  return `${found} of ${total} found`;
}

export interface Discovery {
  /** The stable snapshot: the same Set until something is added or reset. */
  get(): ReadonlySet<string>;
  add(id: string): void;
  reset(): void;
  subscribe(fn: () => void): () => void;
}

/** An external store over the saved set, loaded on first read so it never runs on the server. */
export function createDiscovery(app: string, partIds: Iterable<string>, storage: () => Storage | null = safeStorage): Discovery {
  const valid = new Set(partIds);
  const key = foundKey(app);
  let found: ReadonlySet<string> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const load = () => (found ??= readFound(storage(), key, valid));
  return {
    get: load,
    add(id) {
      const now = load();
      if (now.has(id) || !valid.has(id)) return;
      found = new Set(now).add(id);
      writeFound(storage(), key, found);
      emit();
    },
    reset() {
      if (load().size === 0) return;
      found = new Set();
      writeFound(storage(), key, found);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** The found set for a component (empty when there is no counter): empty on the server and during hydration, the saved set after. */
export function useDiscovery(d: Discovery | null): ReadonlySet<string> {
  return useSyncExternalStore(d ? d.subscribe : noopSubscribe, d ? d.get : () => EMPTY, () => EMPTY);
}
