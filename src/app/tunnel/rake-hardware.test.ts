import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { NOZZLE_STUB, nozzleLayout } from "./rake";
import { buildRakeHardware } from "./rake-hardware";

describe("buildRakeHardware", () => {
  const nozzles = nozzleLayout(false);
  const g = buildRakeHardware(nozzles);
  const stubs = g.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
  const bars = g.children.filter((c) => c !== stubs) as THREE.Mesh[];

  it("stands one bar for the one comb and a stub for every nozzle", () => {
    expect(bars).toHaveLength(1);
    expect(stubs.count).toBe(nozzles.length);
  });

  it("puts each stub's downstream end on its nozzle tip", () => {
    const m = new THREE.Matrix4();
    const centre = new THREE.Vector3();
    nozzles.forEach((n, i) => {
      stubs.getMatrixAt(i, m);
      centre.setFromMatrixPosition(m);
      expect(centre.x + NOZZLE_STUB / 2).toBeCloseTo(n.x, 6);
      expect(centre.y).toBeCloseTo(n.y, 6);
      expect(centre.z).toBeCloseTo(n.z, 6);
    });
  });

  it("stands the bar upstream of the stubs, on the floor, taller than the top nozzle", () => {
    const box = new THREE.Box3().setFromObject(bars[0]);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeGreaterThan(Math.max(...nozzles.map((n) => n.y)));
    expect(box.max.x).toBeLessThanOrEqual(nozzles[0].x - NOZZLE_STUB + 1e-6);
  });
});
