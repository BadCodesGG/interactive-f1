import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { carReflections, createRig, lapLayout } from "./lap-light";

describe("lapLayout", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`is a tent of softboxes that all face the car: one overhead, one each side, one each end, ${theme}`, () => {
      const { panels } = lapLayout(theme);
      expect(panels.map((p) => p.name).sort()).toEqual(["end-ahead", "end-behind", "floor", "key", "side-left", "side-right"]);
      for (const p of panels) {
        const toCar = new THREE.Vector3(...p.centre).negate().normalize();
        expect(new THREE.Vector3(...p.normal).dot(toCar), p.name).toBeGreaterThan(0.999);
        expect(p.radiance).toBeGreaterThan(0);
        // A frame: right x up = normal.
        const n = new THREE.Vector3(...p.right).cross(new THREE.Vector3(...p.up));
        expect(n.distanceTo(new THREE.Vector3(...p.normal)), p.name).toBeLessThan(1e-9);
      }
    });
  }

  it("has a panel ahead of the car and another behind it, low, where a camera looking along the car meets its own reflection off the top", () => {
    const { panels } = lapLayout("dark");
    const ahead = panels.find((p) => p.name === "end-ahead")!;
    const behind = panels.find((p) => p.name === "end-behind")!;
    for (const p of [ahead, behind]) {
      const elevation = Math.atan2(p.centre[1], Math.hypot(p.centre[0], p.centre[2])) * (180 / Math.PI);
      expect(elevation).toBeGreaterThan(10);
      expect(elevation).toBeLessThan(25);
    }
    expect(ahead.centre[0]).toBeLessThan(0);
    expect(behind.centre[0]).toBeGreaterThan(0);
  });
});

describe("carReflections", () => {
  function car() {
    const root = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial();
    const own = new THREE.Texture();
    const carbon = new THREE.MeshStandardMaterial({ envMapIntensity: 0.5 });
    carbon.envMap = own;
    const flat = new THREE.MeshBasicMaterial();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), paint), new THREE.Mesh(new THREE.BoxGeometry(), [carbon, flat]));
    return { root, paint, carbon, flat, own };
  }

  it("gives each physical material the lap's environment at full strength, and leaves other materials alone", () => {
    const { root, paint, carbon, flat } = car();
    const tent = new THREE.Texture();
    carReflections(root).set(tent);
    expect(paint.envMap).toBe(tent);
    expect(carbon.envMap).toBe(tent);
    expect(carbon.envMapIntensity).toBe(1);
    expect(flat.envMap).toBeNull();
  });

  it("puts back what each material had, strength included, and can be swapped for another theme's meanwhile", () => {
    const { root, paint, carbon, own } = car();
    const reflections = carReflections(root);
    reflections.set(new THREE.Texture());
    const other = new THREE.Texture();
    reflections.set(other);
    expect(paint.envMap).toBe(other);
    reflections.restore();
    expect(paint.envMap).toBeNull();
    expect(carbon.envMap).toBe(own);
    expect(carbon.envMapIntensity).toBe(0.5);
  });
});

describe("createRig", () => {
  it("has a key on the camera's side and two rims to either side of the car's far end", () => {
    const rig = createRig("dark");
    const lights = rig.group.children.filter((c): c is THREE.DirectionalLight => (c as THREE.DirectionalLight).isDirectionalLight);
    expect(lights).toHaveLength(3);
    const [key, left, right] = lights;
    expect(key.position.x).toBeGreaterThan(0);
    expect(left.position.x).toBeLessThan(0);
    expect(left.position.z).toBe(-right.position.z);
    rig.dispose();
  });

  it("turns about the car to the camera's bearing and recolours for a theme", () => {
    const rig = createRig("dark");
    rig.face(0.7);
    expect(rig.group.rotation.y).toBe(0.7);
    const key = rig.group.children.find((c) => (c as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight;
    const dark = key.color.getHex();
    rig.paint("light");
    expect(key.color.getHex()).not.toBe(dark);
    rig.dispose();
  });
});
