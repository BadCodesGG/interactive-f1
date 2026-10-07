"use client";

/**
 * The stage's state, outside React. Low-frequency state (selection, hover, target, ready, error)
 * goes through subscribe/getState, which React reads with useSyncExternalStore. The per-frame
 * explode value lives in a plain number that the canvas reads with `frameK()`: a tween never costs
 * a React render per frame. `k` in the published state is updated when the tween arrives.
 *
 * A client module because useExplodeState is a hook: server pages reach it only through the barrel
 * and never call it.
 */
import { useSyncExternalStore } from "react";
import type { ArFormat } from "./ar";
import type { StageGateState } from "./gate-state";

/** A part's look on top of its material: a size factor and a colour it leans toward. */
export interface PartLook {
  /** Scale about the part's own origin, 1 = as modelled. */
  scale?: number;
  /** CSS colour the part's base colour blends toward. */
  tint?: string | null;
  /** 0..1 blend toward `tint`. */
  amount?: number;
}

/** Looks for the whole model: a root scale (about the model's origin) and per-part looks. */
export interface Looks {
  root?: number;
  parts: Record<string, PartLook>;
}

/** What the canvas actually drew once its look tween settled: world scale factors, read off the scene. */
export interface AppliedLooks {
  /** The looks this settled on (the same object as `looks` in the state when it is current). */
  looks: Looks | null;
  root: number;
  parts: Record<string, number>;
}

export interface ExplodeState {
  /** Explode amount at the last settle, 0 (assembled) to 1 (exploded). */
  k: number;
  /** Where k is heading: the slider's value. */
  target: number;
  hovered: string | null;
  selected: string | null;
  /** Dim everything except the selected part. Only meaningful with a selection. */
  isolated: boolean;
  /** The model has loaded and drawn its first frame. */
  ready: boolean;
  error: string | null;
  /** Looks the canvas tweens toward (tints and scales), or null for the model as authored. */
  looks: Looks | null;
  /** Set by the canvas when its look tween settles. */
  applied: AppliedLooks | null;
  /**
   * Group ids the system filter has hidden. Always replaced, never mutated: `set` compares by
   * reference, so a new Set is what tells subscribers it changed.
   */
  hidden: ReadonlySet<string>;
  /** X-ray amount: 0 leaves the sidecar's `xray` groups solid, 1 fades them almost out. */
  xray: number;
  /** The first-load camera fly-in is running. */
  opening: boolean;
  /** What the stage gate is doing, published by `StageGate` so controls can say why they are off. */
  stageGate: StageGateState;
}

export interface ExplodeStore {
  getState(): ExplodeState;
  set(patch: Partial<ExplodeState>): void;
  subscribe(fn: () => void): () => void;
  select(id: string | null): void;
  hover(id: string | null): void;
  setTarget(k: number): void;
  toggleIsolate(): void;
  setLooks(looks: Looks | null): void;
  /** Asks the camera to return to where it was before the first focus. */
  resetView(): void;
  /** The camera's side of resetView. */
  onResetView(fn: () => void): () => void;
  /** Hides or shows one group (the system filter). */
  toggleGroup(id: string): void;
  /** Shows a group again; a no-op when it is already shown. */
  showGroup(id: string): void;
  setXray(amount: number): void;
  /** Asks the canvas for a PNG of what it shows now; null when there is no canvas or it did not answer. */
  capture(): Promise<Blob | null>;
  /** The canvas's side of capture. */
  onCapture(fn: () => Promise<Blob | null>): () => void;
  /**
   * Asks the canvas to export the model as it is assembled (explode 0, the current colours, no lights,
   * ground or overlays) for AR; null when there is no canvas, AR is not set up on it, or the export failed.
   */
  exportModel(kind: ArFormat): Promise<Blob | null>;
  /** The canvas's side of exportModel. */
  onExportModel(fn: (kind: ArFormat) => Promise<Blob | null>): () => void;
  /** The live explode value, updated every frame by `step`. */
  frameK(): number;
  /** Advances the tween by `delta` seconds. Returns whether k moved (the frame must be drawn). */
  step(delta: number, reduced: boolean): boolean;
}

const INITIAL: ExplodeState = { k: 0, target: 0, hovered: null, selected: null, isolated: false, ready: false, error: null, looks: null, applied: null, hidden: new Set(), xray: 0, opening: false, stageGate: "waiting" };
/** Exponential damping rate, per second: about 0.6 s from rest to target. */
const LAMBDA = 7;
const SNAP = 1e-3;

export function createExplodeStore(initial: Partial<ExplodeState> = {}): ExplodeStore {
  let state: ExplodeState = { ...INITIAL, ...initial };
  let live = state.k;
  const listeners = new Set<() => void>();
  const resetListeners = new Set<() => void>();
  let capturer: (() => Promise<Blob | null>) | null = null;
  let exporter: ((kind: ArFormat) => Promise<Blob | null>) | null = null;
  const set = (patch: Partial<ExplodeState>) => {
    const next = { ...state, ...patch };
    if ((Object.keys(patch) as (keyof ExplodeState)[]).every((key) => next[key] === state[key])) return;
    state = next;
    listeners.forEach((fn) => fn());
  };

  return {
    getState: () => state,
    set,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    select: (id) => set(id ? { selected: id } : { selected: null, isolated: false }),
    hover: (id) => set({ hovered: id }),
    setTarget: (k) => set({ target: Math.min(Math.max(k, 0), 1) }),
    toggleIsolate: () => set({ isolated: state.selected ? !state.isolated : false }),
    setLooks: (looks) => set({ looks }),
    toggleGroup(id) {
      const hidden = new Set(state.hidden);
      if (!hidden.delete(id)) hidden.add(id);
      set({ hidden });
    },
    showGroup(id) {
      if (!state.hidden.has(id)) return;
      const hidden = new Set(state.hidden);
      hidden.delete(id);
      set({ hidden });
    },
    setXray: (amount) => set({ xray: Math.min(Math.max(Number.isFinite(amount) ? amount : 0, 0), 1) }),
    capture: () => (capturer ? capturer() : Promise.resolve(null)),
    onCapture(fn) {
      capturer = fn;
      return () => {
        if (capturer === fn) capturer = null;
      };
    },
    exportModel: (kind) => (exporter ? exporter(kind) : Promise.resolve(null)),
    onExportModel(fn) {
      exporter = fn;
      return () => {
        if (exporter === fn) exporter = null;
      };
    },
    resetView: () => resetListeners.forEach((fn) => fn()),
    onResetView(fn) {
      resetListeners.add(fn);
      return () => {
        resetListeners.delete(fn);
      };
    },
    frameK: () => live,
    step(delta, reduced) {
      const goal = state.target;
      if (live === goal) return false;
      const gap = goal - live;
      live = reduced || Math.abs(gap) < SNAP ? goal : live + gap * (1 - Math.exp(-LAMBDA * delta));
      if (Math.abs(goal - live) < SNAP) live = goal;
      if (live === goal) set({ k: goal });
      return true;
    },
  };
}

const noop = () => () => {};

/** Subscribes a component to the store's low-frequency state. */
export function useExplodeState(store: ExplodeStore): ExplodeState;
export function useExplodeState(store: ExplodeStore | null): ExplodeState | null;
export function useExplodeState(store: ExplodeStore | null): ExplodeState | null {
  return useSyncExternalStore(
    store ? store.subscribe : noop,
    () => (store ? store.getState() : null),
    () => (store ? store.getState() : null),
  );
}
