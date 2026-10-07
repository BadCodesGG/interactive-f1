import { useEffect, useRef } from "react";
import type { StageGateState } from "@/engine/explode/gate-state";

/** The custom property each dock publishes its height on, for the page to leave room for it. */
export type DockVar = "--lap-dock" | "--pit-dock";

/**
 * Brings the 3D stage to the top of the screen. The dock covers the bottom of the screen, so the page sizes
 * the stage to end where the dock begins (car-experience.tsx). Scrolling it into view also lets a stage that
 * has never been on screen start drawing: it only draws while visible, so a dock opened with the stage
 * below the fold would otherwise wait for it for ever.
 */
export function showStage(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelector("[data-stage-gate]")?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

/**
 * What every bottom dock does: publishes its height as `name` on the page (which sizes the stage above it and
 * pads the footer below it) and scrolls the stage into view when it opens. Returns the ref for the dock.
 */
export function useDock(name: DockVar) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(name, `${el.offsetHeight}px`);
    publish();
    const watch = new ResizeObserver(publish);
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty(name);
    };
  }, [name]);
  useEffect(showStage, []);
  return ref;
}

/** Why the 3D view is not ready: still on its way, waiting for the visitor's Load 3D, or out of reach. A dock words its own line for each. */
export function viewWait(state: StageGateState): "loading" | "opt-in" | "unavailable" {
  if (state === "opt-in") return "opt-in";
  return state === "unsupported" || state === "failed" ? "unavailable" : "loading";
}

/** What a dock's keys read of a key press (a KeyboardEvent has all of these). */
export interface DockKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/**
 * The key a dock's shortcuts answer to, lower-cased, or null when the press is not one: a browser or
 * system chord, or the auto-repeat of a key held down. A held crew key would otherwise score a wrong tap
 * and its penalty every few milliseconds, and a held P or R would pause and restart the lap in a flicker.
 */
export function shortcut(e: DockKey): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  return e.key.toLowerCase();
}

/** The slice of the explode store a dock waits on. */
export interface AssemblyStore {
  frameK(): number;
  getState(): { target: number };
}

/**
 * Calls `then` once the car is whole: the explode tween has come home (the live value, `frameK()`, is 0) and
 * nothing asks for it to come apart again. The store only says a tween has settled when the published value
 * changed, so the live value is polled instead. Returns the function that stops waiting.
 */
export function waitForAssembled(store: AssemblyStore, then: () => void, every = 50): () => void {
  const timer = setInterval(() => {
    if (store.frameK() !== 0 || store.getState().target !== 0) return;
    clearInterval(timer);
    then();
  }, every);
  return () => clearInterval(timer);
}
