import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { ready, simplify } from "./ar-simplify";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const sphere = () => new THREE.SphereGeometry(1, 48, 32);

/** The largest distance from a vertex of `g` to the unit sphere, 0 when every vertex lies on it. */
const off = (g: THREE.BufferGeometry) => {
  const p = g.attributes.position;
  let worst = 0;
  for (let i = 0; i < p.count; i++) worst = Math.max(worst, Math.abs(Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) - 1));
  return worst;
};

describe("simplify", () => {
  beforeAll(ready);

  it("thins a smooth mesh toward `keep` and leaves no vertex unused", () => {
    const src = sphere();
    const out = simplify(src, { keep: 0.25 });
    expect(tris(out)).toBeLessThan(tris(src) * 0.4);
    expect(tris(out)).toBeGreaterThan(0);
    const used = new Set(Array.from(out.index!.array));
    expect(used.size).toBe(out.attributes.position.count);
    expect(out.attributes.normal.count).toBe(out.attributes.position.count);
    expect(out.attributes.uv.count).toBe(out.attributes.position.count);
  });

  it("does not stray further from the surface than `error` allows", () => {
    const tight = simplify(sphere(), { keep: 0.05, error: 0.001 });
    const loose = simplify(sphere(), { keep: 0.05, error: 0.05 });
    expect(tris(tight)).toBeGreaterThan(tris(loose));
    // A sphere thinned to triangles sits inside the unit sphere; the sag stays small when the error is small.
    expect(off(tight)).toBeLessThan(0.02);
  });

  it("welds the duplicated vertices of a flat-shaded mesh so it can be thinned across its edges", () => {
    const src = sphere().toNonIndexed();
    expect(src.index).toBeNull();
    const out = simplify(src, { keep: 0.25 });
    expect(out.index).not.toBeNull();
    expect(out.attributes.position.count).toBeLessThan(src.attributes.position.count / 3);
    expect(tris(out)).toBeLessThan(tris(src) * 0.4);
  });

  it("leaves a mesh drawn in groups alone: thinning would break its ranges", () => {
    const src = sphere();
    src.addGroup(0, 30, 0);
    expect(simplify(src, { keep: 0.1 })).toBe(src);
  });

  it("returns the geometry it was given when there is nothing to remove", () => {
    const src = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    expect(simplify(src, { keep: 1 })).toBe(src);
  });

  it("does not change the source", () => {
    const src = sphere();
    const count = src.attributes.position.count;
    const index = src.index!.count;
    simplify(src, { keep: 0.2 });
    expect(src.attributes.position.count).toBe(count);
    expect(src.index!.count).toBe(index);
  });
});
