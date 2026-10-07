"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False on the server and while hydrating, true afterwards: for controls that only work with JavaScript. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
