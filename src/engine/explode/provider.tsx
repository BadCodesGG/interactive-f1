"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { createExplodeStore, type ExplodeStore } from "./store";

const StoreContext = createContext<ExplodeStore | null>(null);

/**
 * One store per mounted feature page, shared by the DOM layer (part list, info panel, controls) and
 * the canvas. A server page can wrap server-rendered markup in it: the store is created on the client.
 */
export function ExplodeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createExplodeStore);
  return <StoreContext value={store}>{children}</StoreContext>;
}

/** The store when there is a provider, else null: for a component that can also stand alone (the gate). */
export function useOptionalExplodeStore(): ExplodeStore | null {
  return use(StoreContext);
}

export function useExplodeStore(): ExplodeStore {
  const store = use(StoreContext);
  if (!store) throw new Error("useExplodeStore must be used inside <ExplodeProvider>");
  return store;
}
