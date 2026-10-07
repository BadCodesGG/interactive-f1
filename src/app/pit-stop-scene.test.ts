import { describe, expect, it } from "vitest";
import { LIFT, WHEEL_OUT, poseAfter, STEPS } from "@/models/f1/pit-stop";
import { ARRIVED, attachPitStop, type PitHooks, type PitScene, type PitTarget } from "./pit-stop-scene";

/** Parts that are just positions, and a manual clock of animation frames. */
function rig(ids = ["bodywork", "front-left-wheel", "front-right-wheel"]) {
  const parts = new Map(ids.map((id) => [id, { position: { x: 0, y: 0, z: 0 } }]));
  let invalidations = 0;
  const scene: PitScene = { parts, invalidate: () => void invalidations++ };
  let target: PitTarget = { pose: poseAfter(0), snap: false };
  let explode = 0;
  const listeners = new Set<() => void>();
  const queue: ((ms: number) => void)[] = [];
  let clock = 0;
  const hooks: PitHooks = {
    read: () => target,
    subscribe: (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    explodeAt: () => explode,
    frame: (fn) => queue.push(fn),
    cancel: () => queue.splice(0),
  };
  return {
    scene,
    parts,
    hooks,
    get invalidations() {
      return invalidations;
    },
    set(next: PitTarget) {
      target = next;
      listeners.forEach((fn) => fn());
    },
    moveExplode(k: number) {
      explode = k;
    },
    /** Runs `n` frames, 16 ms apart, stopping early if the loop has gone idle. */
    run(n: number) {
      for (let i = 0; i < n && queue.length; i++) {
        const fn = queue.shift()!;
        clock += 16;
        fn(clock);
      }
    },
    get pending() {
      return queue.length;
    },
    get listeners() {
      return listeners.size;
    },
  };
}

describe("attachPitStop", () => {
  it("leaves the car alone while the pose is the rest pose, and asks for no more frames", () => {
    const r = rig();
    attachPitStop(r.scene, r.hooks);
    r.run(5);
    for (const p of r.parts.values()) expect(p.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.invalidations).toBe(0);
    expect(r.pending).toBe(0);
  });

  it("eases the car up for the jack and every wheel that is off out to its own side, arriving at the pose", () => {
    const r = rig();
    attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(3), snap: false }); // jack up, front left and front right off
    r.run(1);
    const first = r.parts.get("bodywork")!.position.y;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(LIFT);
    r.run(200);
    expect(r.parts.get("bodywork")!.position.y).toBeCloseTo(LIFT, 3);
    expect(r.parts.get("front-left-wheel")!.position.z).toBeCloseTo(WHEEL_OUT, 3);
    expect(r.parts.get("front-right-wheel")!.position.z).toBeCloseTo(-WHEEL_OUT, 3);
    expect(r.parts.get("front-left-wheel")!.position.y).toBeCloseTo(0, 3);
    expect(r.pending).toBe(0);
  });

  it("asks the stage for a frame whenever something moved, and for none once everything has arrived", () => {
    const r = rig();
    attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(1), snap: false });
    r.run(1);
    expect(r.invalidations).toBe(1);
    r.run(300);
    const settled = r.invalidations;
    r.run(10);
    expect(r.invalidations).toBe(settled);
  });

  it("jumps straight to the pose when asked to snap", () => {
    const r = rig();
    attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(3), snap: true });
    r.run(1);
    expect(r.parts.get("bodywork")!.position.y).toBe(LIFT);
    expect(r.parts.get("front-left-wheel")!.position.z).toBe(WHEEL_OUT);
    expect(r.pending).toBe(0);
  });

  it("puts a wheel back and lowers the car at the end of the stop", () => {
    const r = rig();
    attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(3), snap: true });
    r.run(1);
    r.set({ pose: poseAfter(STEPS.length), snap: false });
    r.run(300);
    for (const p of r.parts.values()) {
      expect(Math.abs(p.position.x)).toBeLessThan(ARRIVED * 10);
      expect(Math.abs(p.position.y)).toBeLessThan(ARRIVED * 10);
      expect(Math.abs(p.position.z)).toBeLessThan(ARRIVED * 10);
    }
  });

  it("adds to where the engine has put a part, rather than overwriting it", () => {
    const r = rig();
    r.parts.get("bodywork")!.position.y = 1.6; // exploded
    attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(1), snap: true });
    r.run(1);
    expect(r.parts.get("bodywork")!.position.y).toBeCloseTo(1.6 + LIFT, 9);
  });

  it("takes everything back when it is detached, mid-move or not, and stops asking for frames", () => {
    const r = rig();
    const detach = attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(3), snap: false });
    r.run(3);
    expect(r.parts.get("bodywork")!.position.y).toBeGreaterThan(0);
    detach();
    for (const p of r.parts.values()) {
      expect(p.position.x).toBeCloseTo(0, 12);
      expect(p.position.y).toBeCloseTo(0, 12);
      expect(p.position.z).toBeCloseTo(0, 12);
    }
    expect(r.pending).toBe(0);
    expect(r.listeners).toBe(0);
  });

  it("forgets what it added if the engine moved the parts itself, so it does not take back what is not there", () => {
    const r = rig();
    const detach = attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(1), snap: true });
    r.run(1);
    // The explode moved: the engine wrote every part's position afresh.
    r.moveExplode(0.5);
    for (const p of r.parts.values()) p.position.y = 2;
    r.set({ pose: poseAfter(1), snap: true });
    r.run(1);
    expect(r.parts.get("bodywork")!.position.y).toBeCloseTo(2 + LIFT, 9);
    detach();
    expect(r.parts.get("bodywork")!.position.y).toBeCloseTo(2, 9);
  });

  it("does not move anything once detached, even if a frame was already queued", () => {
    const r = rig();
    const detach = attachPitStop(r.scene, r.hooks);
    r.set({ pose: poseAfter(3), snap: false });
    detach();
    r.run(5);
    for (const p of r.parts.values()) expect(p.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
