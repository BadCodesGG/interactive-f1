/**
 * The smoke wand, as plain data and maths (no three): a short vertical comb of nozzles that a pointer
 * carries about the tunnel. flow.ts keeps a few extra chains of particles for it beside the rake's
 * (Flow's `wand` slots) and releases them from wherever the comb is, so the wand's smoke is the same
 * ribbon the rake draws. This file says where the comb is for a pointer: the ray under the pointer is
 * cut against a plane facing the camera through the point it orbits, the hit is kept inside the
 * tunnel, and three nozzles are hung on it.
 */
import { FLOW_BOX, type Nozzle } from "./rake";

export type V3 = readonly [number, number, number];

/** Nozzles on the wand, and how far apart they are (metres, vertically). */
export const WAND_NOZZLES = 3;
export const WAND_SPACING = 0.06;

/**
 * Where the wand's centre may go: inside the flow box, off the floor and clear of the side walls and the
 * roof. The roof matters: a particle that drifts above the box is released again at random, which scrambles
 * the order of its chain, so a comb at the very top shows ragged, staggered lines.
 */
export const WAND_BOX = {
  min: [FLOW_BOX.min[0] + 0.05, 0.05, FLOW_BOX.min[2] + 0.1],
  max: [2.2, FLOW_BOX.max[1] - 0.25, FLOW_BOX.max[2] - 0.1],
} as const;

/** Beyond this a new wand position is a jump, not a drag: the smoke already in the air is nowhere near it. */
export const JUMP = 0.35;
/** After this long without a wand (seconds) whatever smoke it left has gone. */
export const STALE = 0.3;

export const clampToWand = (p: V3): V3 => [0, 1, 2].map((i) => Math.min(Math.max(p[i], WAND_BOX.min[i]), WAND_BOX.max[i])) as unknown as V3;

/**
 * Where a ray meets a plane, or null when it runs parallel to it or the plane is behind the ray's start.
 * `dir` and `normal` need not be unit vectors.
 */
export function rayPlanePoint(origin: V3, dir: V3, through: V3, normal: V3): V3 | null {
  const denom = dir[0] * normal[0] + dir[1] * normal[1] + dir[2] * normal[2];
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((through[0] - origin[0]) * normal[0] + (through[1] - origin[1]) * normal[1] + (through[2] - origin[2]) * normal[2]) / denom;
  if (!(t > 0)) return null;
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

/** The comb hung on a point: `WAND_NOZZLES` nozzles in a vertical line, centred on it, none under the floor. */
export function wandNozzles(p: V3): Nozzle[] {
  const [x, y, z] = clampToWand(p);
  const lowest = Math.max(y - ((WAND_NOZZLES - 1) / 2) * WAND_SPACING, 0.02);
  return Array.from({ length: WAND_NOZZLES }, (_, i) => ({ x, y: lowest + i * WAND_SPACING, z }));
}

/** Where the wand rests before anyone has moved it: upstream of the rake, unseen (its smoke is hidden until it is placed). */
export const parkedWand = (): Nozzle[] => wandNozzles([FLOW_BOX.min[0] + 0.05, 0.5, 0]);

/**
 * Whether placing the wand at `next` needs the smoke re-established (flow.ts settleWand) rather than
 * dragged along: there was no wand before, or the last one is old, or the new place is a jump away.
 */
export function needsSettle(prev: { point: V3; at: number } | null, next: V3, now: number): boolean {
  if (!prev || now - prev.at > STALE) return true;
  return Math.hypot(next[0] - prev.point[0], next[1] - prev.point[1], next[2] - prev.point[2]) > JUMP;
}

/** CPU milliseconds a frame may spend re-establishing a wand's smoke (flow.ts settleWand), on top of its own work. */
export const SETTLE_BUDGET_MS = 4;

/** How many 1/30 s steps one crossing of the box takes at `speed` (metres per second), with a tenth over. */
export const settleSteps = (span: number, speed: number): number => Math.ceil((span / Math.max(speed, 0.1)) * 30 * 1.1);

/**
 * Takes some of the `owed` settle steps: runs `step` until none are owed or `budgetMs` has gone by on `now`,
 * and at least once, so a slow frame still makes progress. Returns what is still owed. A wand put down in
 * one go would run every step in a single frame, which a phone cannot do without stopping the page.
 */
export function spendSettle(owed: number, budgetMs: number, now: () => number, step: () => void): number {
  if (owed <= 0) return 0;
  const begin = now();
  do {
    step();
    owed--;
  } while (owed > 0 && now() - begin < budgetMs);
  return owed;
}

/** Eases a value towards a goal; `rate` is per second. Frame-rate independent. */
export const follow = (from: number, to: number, rate: number, dt: number): number => from + (to - from) * (1 - Math.exp(-rate * Math.max(dt, 0)));

/** How a pointer moves the wand: live (smoke streams from it as it moves) or static (one streamline, drawn where it was put down). */
export type WandMode = "live" | "static";

/** Live wands need motion: a paused flow or a visitor who prefers less gets a single still streamline instead. */
export const wandMode = (paused: boolean, reduced: boolean): WandMode => (paused || reduced ? "static" : "live");

/** A keyboard nudge: `steps` (right, up) of `step` metres along the camera's own axes, kept inside the tunnel. */
export function nudgeWand(p: V3, right: V3, up: V3, steps: readonly [number, number], step: number): V3 {
  const [dx, dy] = steps;
  return clampToWand([0, 1, 2].map((i) => p[i] + (right[i] * dx + up[i] * dy) * step) as unknown as V3);
}
