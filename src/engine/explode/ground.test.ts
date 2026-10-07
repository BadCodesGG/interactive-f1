import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GROUND_CLEARANCE, groundHeight, lowestPoint } from "./ground";
import { applyExplode, buildPlan } from "./plan";

function box(name: string, size: [number, number, number], at: [number, number, number]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size));
  m.name = name;
  m.position.set(...at);
  return m;
}

const part = (label: string, extra = {}) => ({ label, copy: `t.${label}`, ...extra });

/** A low body on the floor, and a wheel that an authored vector drops 0.5 below it when exploded. */
function model() {
  const root = new THREE.Group();
  // Body bottom at y = 1, wheel bottom at y = 0.2 (the assembled model's lowest point).
  root.add(box("body", [4, 1, 2], [0, 1.5, 0]), box("wheel", [1, 0.8, 1], [0, 0.6, 1.5]), box("roof", [2, 0.5, 1], [0, 2.25, 0]));
  const plan = buildPlan(root, {
    assembly: { centre: [0, 1, 0], radius: 3 },
    groups: {},
    parts: { body: part("body", { explode: [0, 0, 0] }), wheel: part("wheel", { explode: [0, -0.5, 0] }), roof: part("roof", { explode: [0, 3, 0] }) },
  });
  const low = () => {
    root.updateMatrixWorld(true);
    return lowestPoint(plan.parts.map((e) => e.obj));
  };
  return { root, plan, low };
}

describe("lowestPoint", () => {
  it("is the assembled model's lowest bound, and follows the pose as parts explode", () => {
    const { plan, low } = model();
    expect(low()).toBeCloseTo(0.2, 6);
    applyExplode(plan, 1);
    expect(low()).toBeCloseTo(-0.3, 6);
    applyExplode(plan, 0);
    expect(low()).toBeCloseTo(0.2, 6);
  });

  it("only ever moves down as the wheel drops, never above the lowest part at that moment", () => {
    const { plan, low } = model();
    let last = low()!;
    for (let k = 0.1; k <= 1.0001; k += 0.1) {
      applyExplode(plan, k);
      const y = low()!;
      expect(y).toBeLessThanOrEqual(last + 1e-9);
      last = y;
    }
    expect(last).toBeCloseTo(-0.3, 6);
  });

  it("follows the root's scale about its own position, and its position", () => {
    const { root, plan, low } = model();
    root.scale.setScalar(2);
    expect(low()).toBeCloseTo(0.4, 6);
    root.position.y = 5;
    applyExplode(plan, 0);
    expect(low()).toBeCloseTo(5.4, 6);
  });

  it("follows a part scaled about its own origin", () => {
    const { root, plan, low } = model();
    const wheel = root.getObjectByName("wheel")!;
    wheel.scale.setScalar(0.5);
    // The wheel's box is centred on its origin: half the height, bottom now at 0.6 - 0.2 = 0.4.
    expect(low()).toBeCloseTo(0.4, 6);
    wheel.scale.setScalar(1);
    applyExplode(plan, 0);
    expect(low()).toBeCloseTo(0.2, 6);
  });

  it("ignores a hidden part, and is null when nothing is left to stand on", () => {
    const { root, low } = model();
    root.getObjectByName("wheel")!.visible = false;
    expect(low()).toBeCloseTo(1, 6);
    root.getObjectByName("body")!.visible = false;
    root.getObjectByName("roof")!.visible = false;
    expect(low()).toBeNull();
  });

  it("counts geometry nested under a part", () => {
    const { root, low } = model();
    // Local y -2 under the body (world y 1.5) is world -0.5; the 0.2 box reaches down to -0.6.
    root.getObjectByName("body")!.add(box("inner", [0.2, 0.2, 0.2], [0, -2, 0]));
    expect(low()).toBeCloseTo(-0.6, 6);
  });
});

describe("groundHeight", () => {
  it("sits a hair under the lowest point, in proportion to the model's radius", () => {
    expect(groundHeight(2, 10)).toBeCloseTo(2 - 10 * GROUND_CLEARANCE, 9);
    expect(groundHeight(2, 10)).toBeLessThan(2);
    expect(10 * GROUND_CLEARANCE).toBeLessThan(0.05);
  });
});
