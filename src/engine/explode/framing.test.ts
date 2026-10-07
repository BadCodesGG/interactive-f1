import { describe, expect, it } from "vitest";
import { Box3, Group, Sphere, Vector3 } from "three";
import { DEFAULT_FRAME, frameShown, poseSphere, resolveFrame, unionSphere, type FrameSpheres, type PartBounds, type PoseBounds } from "./framing";

const bounds = (): PoseBounds => {
  const rest = new Sphere(new Vector3(0, 0, 0), 2);
  const exploded = new Sphere(new Vector3(4, 2, 0), 6);
  return { root: new Group(), rest, exploded, sphere: new Sphere(new Vector3(2, 1, 0), 8) };
};

describe("resolveFrame", () => {
  it("takes the explicit prop, then the sidecar, then the default", () => {
    expect(resolveFrame(0.7, 1.3)).toBe(0.7);
    expect(resolveFrame([1.05, 0.8], 1.3)).toEqual([1.05, 0.8]);
    expect(resolveFrame(undefined, 1.3)).toBe(1.3);
    expect(resolveFrame(undefined, null)).toBe(DEFAULT_FRAME);
    expect(resolveFrame(undefined, undefined)).toBe(DEFAULT_FRAME);
  });
});

describe("poseSphere", () => {
  it("is the assembled sphere at k=0 and the exploded one at k=1, blended between", () => {
    const l = bounds();
    expect(poseSphere(l, 0, 1).radius).toBe(2);
    expect(poseSphere(l, 1, 1).radius).toBe(6);
    const mid = poseSphere(l, 0.5, 1);
    expect(mid.radius).toBeCloseTo(4);
    expect(mid.center.toArray()).toEqual([2, 1, 0]);
  });

  it("scales the radius by one factor, or by a pair for the assembled and exploded poses", () => {
    const l = bounds();
    expect(poseSphere(l, 0, 0.5).radius).toBeCloseTo(1);
    expect(poseSphere(l, 0, [1.05, 0.8]).radius).toBeCloseTo(2 * 1.05);
    expect(poseSphere(l, 1, [1.05, 0.8]).radius).toBeCloseTo(6 * 0.8);
    expect(poseSphere(l, 0.5, [1.05, 0.8]).radius).toBeCloseTo((2 * 1.05 + 6 * 0.8) / 2);
  });

  it("follows the root's scale about its own position, and writes into `out`", () => {
    const l = bounds();
    l.root.position.set(1, 0, 0);
    l.root.scale.setScalar(2);
    const out = new Sphere();
    const s = poseSphere(l, 0, 1, out);
    expect(s).toBe(out);
    expect(s.radius).toBe(4);
    // rest centre (0,0,0) relative to the root at (1,0,0), doubled, back from the root: (-1,0,0).
    expect(s.center.toArray()).toEqual([-1, 0, 0]);
  });
});

describe("unionSphere", () => {
  it("covers both poses, scaled by the assembled factor of a pair", () => {
    const l = bounds();
    expect(unionSphere(l, 0.8).radius).toBeCloseTo(6.4);
    expect(unionSphere(l, [0.5, 2]).radius).toBeCloseTo(4);
    expect(unionSphere(l, 1).center.toArray()).toEqual([2, 1, 0]);
  });
});

describe("frameShown", () => {
  const box = (min: [number, number, number], max: [number, number, number]) => new Box3(new Vector3(...min), new Vector3(...max));
  const spheres = (): FrameSpheres => ({ rest: new Sphere(new Vector3(9, 9, 9), 9), exploded: new Sphere(new Vector3(9, 9, 9), 9), union: new Sphere(new Vector3(9, 9, 9), 9) });
  const parts = (shown: [boolean, boolean]): PartBounds[] => [
    { rest: box([-1, -1, -1], [1, 1, 1]), exploded: box([-1, -1, -1], [1, 1, 1]), shown: shown[0] },
    { rest: box([-1, -1, -1], [1, 1, 1]), exploded: box([9, -1, -1], [11, 1, 1]), shown: shown[1] },
  ];

  it("fits every shown part in each pose and in both together", () => {
    const out = spheres();
    expect(frameShown(parts([true, true]), out)).toBe(true);
    expect(out.rest.center.toArray()).toEqual([0, 0, 0]);
    expect(out.rest.radius).toBeCloseTo(Math.sqrt(3), 6);
    expect(out.exploded.center.x).toBeCloseTo(5, 6);
    expect(out.union.center.x).toBeCloseTo(5, 6);
    expect(out.union.radius).toBeGreaterThan(out.rest.radius);
  });

  it("leaves a hidden part out of the framing", () => {
    const out = spheres();
    expect(frameShown(parts([true, false]), out)).toBe(true);
    expect(out.exploded.center.toArray()).toEqual([0, 0, 0]);
    expect(out.exploded.radius).toBeCloseTo(Math.sqrt(3), 6);
    expect(out.union.radius).toBeCloseTo(Math.sqrt(3), 6);
  });

  it("keeps the last framing when nothing is shown", () => {
    const out = spheres();
    expect(frameShown(parts([false, false]), out)).toBe(false);
    expect(out.rest.radius).toBe(9);
    expect(out.union.center.toArray()).toEqual([9, 9, 9]);
  });

  it("does not mutate the parts' own boxes", () => {
    const p = parts([true, true]);
    frameShown(p, spheres());
    expect(p[0].rest.max.toArray()).toEqual([1, 1, 1]);
    expect(p[1].exploded.min.x).toBe(9);
  });
});
