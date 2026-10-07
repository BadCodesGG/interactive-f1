import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildArScene, type ArPart } from "./ar-export";
import { ready, simplify } from "./ar-simplify";

/** A part the way the stage keeps it after `prepare`: its own cloned material, and the colours it was built with. */
function part(mesh: THREE.Mesh, over: Partial<ArPart> = {}): ArPart {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  return {
    meshes: [mesh],
    looks: [{ mat, color: mat.color.clone(), emissive: mat.emissive.clone(), blend: { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite } }],
    tint: new THREE.Color(),
    amount: 0,
    ...over,
  };
}

function box(name: string, size: [number, number, number], at: [number, number, number], mat: THREE.Material) {
  const geo = new THREE.BoxGeometry(...size);
  geo.setAttribute("_custom", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.set(...at);
  return m;
}

function meshes(scene: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh));
  return out;
}

describe("buildArScene", () => {
  const paint = () => new THREE.MeshPhysicalMaterial({ color: 0x336699, metalness: 0.4, roughness: 0.3, clearcoat: 1, name: "paint" });

  it("scales to metres and stands the model on the floor, centred", () => {
    const root = new THREE.Group();
    const a = box("a", [2, 1, 1], [10, 5, -3], paint());
    root.add(a);
    const { scene, scale } = buildArScene(root, [part(a)], { metresPerUnit: 0.5 });
    expect(scale).toBe(0.5);
    const b = new THREE.Box3().setFromObject(scene);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.getSize(new THREE.Vector3()).x).toBeCloseTo(1);
    const c = b.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(0);
  });

  it("sizes the longest side to a real length, and leaves the live model alone", () => {
    const root = new THREE.Group();
    const a = box("a", [4, 1, 1], [1, 1, 1], paint());
    root.add(a);
    const before = a.material;
    const { scene, scale } = buildArScene(root, [part(a)], { longestSide: 2 });
    expect(scale).toBeCloseTo(0.5);
    expect(new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).x).toBeCloseTo(2);
    expect(a.material).toBe(before);
    expect(a.position.toArray()).toEqual([1, 1, 1]);
    expect(root.children).toEqual([a]);
  });

  it("swaps every material for a plain standard one carrying colour, metalness and roughness", () => {
    const root = new THREE.Group();
    const a = box("a", [1, 1, 1], [0, 0, 0], paint());
    root.add(a);
    const { scene } = buildArScene(root, [part(a)], {});
    const [m] = meshes(scene);
    const mat = m.material as THREE.MeshPhysicalMaterial;
    expect(mat.isMeshStandardMaterial).toBe(true);
    expect((mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial).toBeFalsy();
    expect(mat.color.getHex()).toBe(0x336699);
    expect(mat.metalness).toBeCloseTo(0.4);
    expect(mat.roughness).toBeCloseTo(0.3);
    expect(mat.name).toBe("paint");
  });

  it("uses the colour the part was built with, not what hover, isolate or X-ray have done to it, and applies a look's tint", () => {
    const root = new THREE.Group();
    const a = box("a", [1, 1, 1], [0, 0, 0], paint());
    const b = box("b", [1, 1, 1], [3, 0, 0], paint());
    root.add(a, b);
    const pa = part(a);
    const pb = part(b, { tint: new THREE.Color(0xff0000), amount: 1 });
    // The stage has since lit, dimmed and faded the live materials.
    (a.material as THREE.MeshStandardMaterial).color.set(0x000000);
    (a.material as THREE.MeshStandardMaterial).emissive.set(0xffffff);
    (a.material as THREE.MeshStandardMaterial).opacity = 0.1;
    (a.material as THREE.MeshStandardMaterial).transparent = true;
    const { scene } = buildArScene(root, [pa, pb], {});
    const [ma, mb] = meshes(scene).map((m) => m.material as THREE.MeshStandardMaterial);
    expect(ma.color.getHex()).toBe(0x336699);
    expect(ma.emissive.getHex()).toBe(0x000000);
    expect(ma.opacity).toBe(1);
    expect(ma.transparent).toBe(false);
    expect(mb.color.getHex()).toBe(0xff0000);
  });

  it("gives a material the stage does not track (a shader, a basic material) a plain fallback", () => {
    const root = new THREE.Group();
    const a = box("a", [1, 1, 1], [0, 0, 0], new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    const s = box("s", [1, 1, 1], [3, 0, 0], new THREE.ShaderMaterial());
    root.add(a, s);
    const { scene } = buildArScene(root, [], {});
    const [ma, ms] = meshes(scene).map((m) => m.material as THREE.MeshStandardMaterial);
    expect(ma.isMeshStandardMaterial).toBe(true);
    expect(ma.color.getHex()).toBe(0x00ff00);
    expect(ms.isMeshStandardMaterial).toBe(true);
    expect(ms.color.getHex()).toBe(0xffffff);
  });

  it("keeps only the attributes a viewer reads", () => {
    const root = new THREE.Group();
    const a = box("a", [1, 1, 1], [0, 0, 0], paint());
    root.add(a);
    const { scene } = buildArScene(root, [part(a)], {});
    expect(Object.keys(meshes(scene)[0].geometry.attributes).sort()).toEqual(["normal", "position", "uv"]);
    expect(meshes(scene)[0].geometry.index).toBe(a.geometry.index);
  });

  it("leaves out parts the system filter has hidden, and does not count them in the size", () => {
    const root = new THREE.Group();
    const a = box("a", [1, 1, 1], [0, 0, 0], paint());
    const far = box("far", [1, 1, 1], [100, 0, 0], paint());
    far.visible = false;
    root.add(a, far);
    const { scene, scale } = buildArScene(root, [part(a), part(far)], { longestSide: 1 });
    expect(scale).toBeCloseTo(1);
    expect(meshes(scene).map((m) => m.name)).toEqual(["a"]);
  });

  it("carries a base colour map through", () => {
    const root = new THREE.Group();
    const map = new THREE.Texture();
    const a = box("a", [1, 1, 1], [0, 0, 0], new THREE.MeshStandardMaterial({ map }));
    root.add(a);
    const { scene } = buildArScene(root, [part(a)], {});
    expect((meshes(scene)[0].material as THREE.MeshStandardMaterial).map).toBe(map);
  });

  it("exports transmissive glass see-through, since a standard material cannot carry transmission", () => {
    const root = new THREE.Group();
    const a = box("a", [1, 1, 1], [0, 0, 0], new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.04 }));
    root.add(a);
    const mat = meshes(buildArScene(root, [part(a)], {}).scene)[0].material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeLessThan(0.5);
  });

  it("refuses a model with nothing to show", () => {
    expect(() => buildArScene(new THREE.Group(), [], {})).toThrow(/nothing/i);
  });

  describe("with simplify", () => {
    /** A smooth sphere is easy to thin, and its uv is dead weight without a texture. */
    const ball = (name: string, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
      m.name = name;
      return m;
    };
    const tris = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;

    it("thins a mesh and drops a uv no texture reads, leaving the live model alone", async () => {
      await ready();
      const root = new THREE.Group();
      const a = ball("a", paint());
      root.add(a);
      const before = tris(a);
      const plain = buildArScene(root, [part(a)], {});
      const lean = buildArScene(root, [part(a)], { simplify: { keep: 0.25 } }, simplify);
      const [m] = meshes(lean.scene);
      expect(tris(meshes(plain.scene)[0])).toBe(before);
      expect(tris(m)).toBeLessThan(before * 0.5);
      expect(Object.keys(m.geometry.attributes).sort()).toEqual(["normal", "position"]);
      expect(a.geometry.attributes.uv).toBeDefined();
      expect(tris(a)).toBe(before);
    });

    it("keeps the uv when a material has a texture", async () => {
      await ready();
      const root = new THREE.Group();
      const a = ball("a", new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
      root.add(a);
      const { scene } = buildArScene(root, [part(a)], { simplify: { keep: 0.5 } }, simplify);
      expect(Object.keys(meshes(scene)[0].geometry.attributes)).toContain("uv");
    });

    it("does nothing without the option, even when a simplifier is on hand", async () => {
      await ready();
      const root = new THREE.Group();
      const a = ball("a", paint());
      root.add(a);
      const [m] = meshes(buildArScene(root, [part(a)], {}, simplify).scene);
      expect(tris(m)).toBe(tris(a));
      expect(m.geometry.attributes.uv).toBeDefined();
    });
  });
});
