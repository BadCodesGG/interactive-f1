/**
 * Moves the car's parts to the pose the pit stop has reached (src/models/f1/pit-stop.ts offsetOf): the jack
 * raises every part a little, and a wheel the gun has taken off slides out to its own side and stays on the
 * ground; put back, it slides in again. It runs outside React and outside three: it only adds to each part's
 * `position`, on its own animation-frame loop, and asks the stage for a frame when something moved. That is
 * deliberate. This file is loaded with the pit stop panel, and anything it imported that the stage also
 * imports (three, react-three-fiber) would be pulled into a chunk shared with the stage, where the bundler
 * can merge it with the stage's own code and hide the stage's bytes from the budget check.
 *
 * The moves are made on top of where the engine has put each part. The engine writes a part's position only
 * while the explode tween moves, and the panel holds the explode at 0 for the whole round, so what is added
 * here is never overwritten; if it is anyway (the live explode value changed), what was added is forgotten.
 * Each part's offset so far is kept, so each frame adds only the difference, and detaching takes it all back.
 */
import { offsetOf, type Pose } from "@/models/f1/pit-stop";

/** The slice of the stage's scene this needs: the parts by id (anything with a position) and a way to ask for a frame. */
export interface PitScene {
  parts: ReadonlyMap<string, { position: { x: number; y: number; z: number } }>;
  invalidate(): void;
}

export interface PitTarget {
  pose: Pose;
  /** Jump to the pose instead of easing (reduced motion). */
  snap: boolean;
}

export interface PitHooks {
  /** Where the parts should be now. */
  read(): PitTarget;
  /** Calls `fn` when `read()` may have changed; returns the unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** The live explode value: a change means the engine has moved the parts itself. */
  explodeAt(): number;
  /** Animation frames: the browser's by default. */
  frame?: (fn: (ms: number) => void) => number;
  cancel?: (id: number) => void;
}

/** How fast a part closes on its place, per second: about a third of a second to arrive. */
export const EASE = 10;
/** Closer than this (metres) a part is on its place. */
export const ARRIVED = 1e-4;

/** Starts moving the scene's parts to the pose the hooks say; the returned function stops, and puts every part back. */
export function attachPitStop(scene: PitScene, hooks: PitHooks): () => void {
  const frame = hooks.frame ?? ((fn) => requestAnimationFrame(fn));
  const cancel = hooks.cancel ?? ((id) => cancelAnimationFrame(id));
  const applied = new Map<string, [number, number, number]>();
  let explodeAt = hooks.explodeAt();
  let last: number | null = null;
  let pending: number | null = null;
  let live = true;

  const step = (ms: number) => {
    pending = null;
    if (!live) return;
    const dt = last === null ? 1 / 60 : Math.min((ms - last) / 1000, 1 / 20);
    last = ms;
    if (hooks.explodeAt() !== explodeAt) {
      explodeAt = hooks.explodeAt();
      applied.clear();
    }
    const { pose, snap } = hooks.read();
    const ease = 1 - Math.exp(-EASE * dt);
    let moving = false;
    let moved = false;
    for (const [id, part] of scene.parts) {
      const have = applied.get(id) ?? [0, 0, 0];
      const want = offsetOf(id, pose);
      const gap = [want[0] - have[0], want[1] - have[1], want[2] - have[2]];
      if (gap[0] === 0 && gap[1] === 0 && gap[2] === 0) continue;
      const arrives = snap || Math.hypot(gap[0], gap[1], gap[2]) < ARRIVED;
      const k = arrives ? 1 : ease;
      if (!arrives) moving = true;
      const add = [gap[0] * k, gap[1] * k, gap[2] * k];
      part.position.x += add[0];
      part.position.y += add[1];
      part.position.z += add[2];
      applied.set(id, [have[0] + add[0], have[1] + add[1], have[2] + add[2]]);
      moved = true;
    }
    if (moved) scene.invalidate();
    // Keep going while anything is still on its way; a new pose wakes it again.
    if (moving) pending = frame(step);
    else last = null;
  };
  const wake = () => {
    if (live && pending === null) pending = frame(step);
  };

  const unsubscribe = hooks.subscribe(wake);
  wake();
  return () => {
    live = false;
    unsubscribe();
    if (pending !== null) cancel(pending);
    for (const [id, offset] of applied) {
      const part = scene.parts.get(id);
      if (!part) continue;
      part.position.x -= offset[0];
      part.position.y -= offset[1];
      part.position.z -= offset[2];
    }
    applied.clear();
    scene.invalidate();
  };
}
