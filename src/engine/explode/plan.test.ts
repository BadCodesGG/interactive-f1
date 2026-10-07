import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyExplode, buildPlan } from "./plan";
import type { Sidecar } from "./sidecar";

type Layout = Pick<Sidecar, "assembly" | "groups" | "parts">;

/** A named mesh of the given size, positioned so its bounding-box centre is `at`. */
function box(name: string, size: [number, number, number], at: [number, number, number]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size));
  m.name = name;
  m.position.set(...at);
  return m;
}

const world = (o: THREE.Object3D) => {
  o.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
};

const part = (label: string, extra: Partial<Layout["parts"][string]> = {}) => ({ label, copy: `t.${label}`, ...extra });

function expectVec(v: THREE.Vector3, x: number, y: number, z: number) {
  expect(v.x).toBeCloseTo(x, 5);
  expect(v.y).toBeCloseTo(y, 5);
  expect(v.z).toBeCloseTo(z, 5);
}

describe("buildPlan + applyExplode", () => {
  it("moves a radial part along its direction from the centre by R * (0.35 + 0.65 * d/R)", () => {
    const root = new THREE.Group();
    root.add(box("a", [1, 1, 1], [3, 0, 0]), box("b", [1, 1, 1], [-3, 0, 0]));
    const plan = buildPlan(root, { assembly: { centre: [0, 0, 0], radius: 4 }, groups: {}, parts: { a: part("a"), b: part("b") } });
    applyExplode(plan, 1);
    // d = 3, R = 4: 4 * (0.35 + 0.65 * 0.75) = 3.35
    expectVec(world(root.getObjectByName("a")!), 6.35, 0, 0);
    expectVec(world(root.getObjectByName("b")!), -6.35, 0, 0);
  });

  it("caps the radial magnitude at R for parts beyond the radius", () => {
    const root = new THREE.Group();
    root.add(box("far", [1, 1, 1], [0, 0, 10]));
    const plan = buildPlan(root, { assembly: { centre: [0, 0, 0], radius: 4 }, groups: {}, parts: { far: part("far") } });
    applyExplode(plan, 1);
    expectVec(world(root.getObjectByName("far")!), 0, 0, 14);
  });

  it("pushes a part sitting at the centre along its thinnest axis by R * 0.35", () => {
    const root = new THREE.Group();
    root.add(box("plate", [2, 0.1, 2], [0, 0, 0]), box("die", [0.2, 0.2, 0.05], [0, 0, -0.01]));
    const plan = buildPlan(root, { assembly: { centre: [0, 0, 0], radius: 4 }, groups: {}, parts: { plate: part("plate"), die: part("die") } });
    applyExplode(plan, 1);
    expectVec(world(root.getObjectByName("plate")!), 0, 1.4, 0); // tie on y goes positive
    expectVec(world(root.getObjectByName("die")!), 0, 0, -1.41); // sits on the negative side of z
  });

  it("uses an authored vector exactly, in world space, under a rotated and scaled parent", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.rotation.set(0.3, 1.1, -0.4);
    parent.scale.setScalar(2.5);
    parent.position.set(1, 2, 3);
    root.add(parent);
    parent.add(box("p", [0.2, 0.2, 0.2], [0.4, 0, 0]));
    const before = world(root.getObjectByName("p")!);
    const plan = buildPlan(root, { assembly: {}, groups: {}, parts: { p: part("p", { explode: [0, 2, 0] }) } });
    applyExplode(plan, 1);
    const after = world(root.getObjectByName("p")!);
    expectVec(after.sub(before), 0, 2, 0);
  });

  it("restores every part exactly at k = 0 after exploding", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.rotation.set(-0.7, 0.2, 0.9);
    parent.scale.set(1.5, 0.5, 2);
    root.add(parent);
    parent.add(box("a", [1, 1, 1], [1, 1, 0]), box("b", [1, 2, 1], [-1, 0, 2]), box("c", [3, 0.1, 3], [0, 0, 0]));
    const rest = ["a", "b", "c"].map((n) => root.getObjectByName(n)!.position.clone());
    const plan = buildPlan(root, { assembly: {}, groups: {}, parts: { a: part("a"), b: part("b"), c: part("c") } });
    applyExplode(plan, 1);
    applyExplode(plan, 0.37);
    applyExplode(plan, 0);
    ["a", "b", "c"].forEach((n, i) => {
      const p = root.getObjectByName(n)!.position;
      expectVec(p, rest[i].x, rest[i].y, rest[i].z);
    });
  });

  it("plays stages in order: stage 0 owns [0, 0.5] and stage 1 owns [0.5, 1], smoothstepped", () => {
    const root = new THREE.Group();
    root.add(box("s0", [0.1, 0.1, 0.1], [0, 0, 0]), box("s1", [0.1, 0.1, 0.1], [5, 0, 0]));
    const layout: Layout = {
      assembly: {},
      groups: { first: { label: "First", stage: 0 }, second: { label: "Second", stage: 1 } },
      parts: { s0: part("s0", { group: "first", explode: [0, 4, 0] }), s1: part("s1", { group: "second", explode: [0, 4, 0] }) },
    };
    const plan = buildPlan(root, layout);
    const y = (n: string) => world(root.getObjectByName(n)!).y;
    applyExplode(plan, 0.25); // halfway through stage 0: smoothstep(0.5) = 0.5
    expect(y("s0")).toBeCloseTo(2, 5);
    expect(y("s1")).toBeCloseTo(0, 5);
    applyExplode(plan, 0.5);
    expect(y("s0")).toBeCloseTo(4, 5);
    expect(y("s1")).toBeCloseTo(0, 5);
    applyExplode(plan, 0.625); // a quarter into stage 1: smoothstep(0.25) = 0.15625
    expect(y("s1")).toBeCloseTo(0.625, 5);
    applyExplode(plan, 1);
    expect(y("s1")).toBeCloseTo(4, 5);
  });

  it("adds a part's own offset on top of its group's offset", () => {
    const root = new THREE.Group();
    root.add(box("child", [0.1, 0.1, 0.1], [0, 0, 0]));
    const plan = buildPlan(root, {
      assembly: {},
      groups: { sub: { label: "Sub", stage: 0, explode: [0, 3, 0] } },
      parts: { child: part("child", { group: "sub", stage: 1, explode: [1, 0, 0] }) },
    });
    applyExplode(plan, 0.5); // group finished, part not started
    expectVec(world(root.getObjectByName("child")!), 0, 3, 0);
    applyExplode(plan, 1);
    expectVec(world(root.getObjectByName("child")!), 1, 3, 0);
  });

  it("staggers parts inside a stage by order", () => {
    const root = new THREE.Group();
    root.add(box("early", [0.1, 0.1, 0.1], [0, 0, 0]), box("late", [0.1, 0.1, 0.1], [3, 0, 0]));
    const plan = buildPlan(root, {
      assembly: {},
      groups: {},
      parts: { early: part("early", { explode: [0, 1, 0], order: 0 }), late: part("late", { explode: [0, 1, 0], order: 1 }) },
    });
    applyExplode(plan, 0.5);
    expect(world(root.getObjectByName("early")!).y).toBeCloseTo(1, 5);
    expect(world(root.getObjectByName("late")!).y).toBeCloseTo(0, 5);
  });

  it("moves every radial part along one axis in blueprint mode", () => {
    const root = new THREE.Group();
    root.add(box("up", [1, 1, 1], [2, 2, 0]), box("down", [1, 1, 1], [-2, -1, 0]));
    const plan = buildPlan(root, { assembly: { centre: [0, 0, 0], radius: 4, axis: "y" }, groups: {}, parts: { up: part("up"), down: part("down") } });
    applyExplode(plan, 1);
    // |dy| = 2: 4 * (0.35 + 0.65 * 0.5) = 2.7; |dy| = 1: 4 * (0.35 + 0.65 * 0.25) = 2.05
    expectVec(world(root.getObjectByName("up")!), 2, 4.7, 0);
    expectVec(world(root.getObjectByName("down")!), -2, -3.05, 0);
  });

  it("carries a nested part along with the part that contains it", () => {
    const root = new THREE.Group();
    const outer = box("outer", [1, 1, 1], [0, 0, 0]);
    root.add(outer);
    outer.add(box("inner", [0.1, 0.1, 0.1], [0, 0, 0]));
    const plan = buildPlan(root, {
      assembly: {},
      groups: {},
      parts: { inner: part("inner", { explode: [1, 0, 0] }), outer: part("outer", { explode: [0, 2, 0] }) },
    });
    applyExplode(plan, 1);
    expectVec(world(root.getObjectByName("inner")!), 1, 2, 0);
  });

  it("keeps the exploded layout attached to the root when the root is scaled after planning", () => {
    // The age view scales the whole model. Every offset must scale with it, about the root's origin.
    const root = new THREE.Group();
    root.add(box("a", [1, 1, 1], [3, 0, 0]));
    const plan = buildPlan(root, { assembly: { centre: [0, 0, 0], radius: 4 }, groups: {}, parts: { a: part("a") } });
    root.scale.setScalar(0.5);
    root.updateMatrixWorld(true);
    applyExplode(plan, 1);
    // Unscaled it lands at 6.35 (first test); at half scale, 3.175.
    expectVec(world(root.getObjectByName("a")!), 3.175, 0, 0);
    applyExplode(plan, 0);
    expectVec(world(root.getObjectByName("a")!), 1.5, 0, 0);
  });

  it("throws, naming every sidecar part the model does not contain", () => {
    const root = new THREE.Group();
    root.add(box("a", [1, 1, 1], [0, 0, 0]));
    expect(() => buildPlan(root, { assembly: {}, groups: {}, parts: { a: part("a"), ghost: part("ghost"), gone: part("gone") } })).toThrow(/ghost, gone/);
  });

  it("reports the centre and radius it used", () => {
    const root = new THREE.Group();
    root.add(box("a", [2, 2, 2], [1, 0, 0]));
    const plan = buildPlan(root, { assembly: {}, groups: {}, parts: { a: part("a") } });
    expectVec(plan.centre, 1, 0, 0);
    expect(plan.radius).toBeCloseTo(Math.sqrt(12) / 2, 5);
  });
});
