"use client";

/**
 * The store behind a bridge between a lazy dock and the stage (lap-bridge.ts, pit-stop-bridge.ts): one value
 * outside React, a setter that merges and tells subscribers, and the hook that reads it. The stage chunk
 * carries this, so it imports nothing but React.
 */
import { useSyncExternalStore } from "react";

export interface BridgeStore<T> {
  get(): T;
  /** Merges `next` into the state and tells every subscriber. */
  set(next: Partial<T>): void;
  /** Puts back `resetTo`, over whatever else is set (the mover the panel registered stays). */
  reset(): void;
  subscribe(fn: () => void): () => void;
  /** The state, re-read whenever it changes; the server and the first client render say `rest`. */
  use(): T;
}

/** A store that starts at `rest`; `resetTo` is what `reset` merges back in. */
export function createBridgeStore<T extends object>(rest: T, resetTo: Partial<T>): BridgeStore<T> {
  let state = rest;
  const listeners = new Set<() => void>();
  const get = () => state;
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const set = (next: Partial<T>) => {
    state = { ...state, ...next };
    listeners.forEach((fn) => fn());
  };
  return { get, set, reset: () => set(resetTo), subscribe, use: () => useSyncExternalStore(subscribe, get, () => rest) };
}
