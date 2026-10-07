import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildArScene } from "@/engine/explode/ar-export";
import { applyLiveryDef, repaintLivery } from "./livery-apply";
import { armArBake, ensureArBake, holdExportForBake } from "./livery-ar";
import { LIVERIES } from "./liveries";
import { FINISHES } from "./livery-spec";

/** A canvas as far as the bake needs one: a size, and a 2d context that takes the atlas. */
const painted: { width: number; height: number; data: Uint8ClampedArray }[] = [];
class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

beforeEach(() => {
  // The logos, as two small loaded images.
  vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture({ width: 4, height: 2 } as never));
  vi.stubGlobal("ImageData", FakeImageData);
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          putImageData: (d: FakeImageData) => painted.push({ width: d.width, height: d.height, data: d.data }),
          drawImage: () => {},
          getImageData: (_x: number, _y: number, w: number, h: number) => new FakeImageData(new Uint8ClampedArray(w * h * 4), w, h),
        }),
      };
      return canvas;
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  painted.length = 0;
});

/** A car of a painted body (a flat panel with a stripe's worth of surface), a painted wing, and an unpainted carbon part. */
function car() {
  const root = new THREE.Group();
  const panel = (name: string, y: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, y, -0.5, 1, y, -0.5, 1, y, 0.5, -1, y, 0.5], 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name }));
    root.add(mesh);
    return mesh;
  };
  return { root, body: panel("BodyLivery", 0.3), wing: panel("RearWingLivery", 0.9), carbon: panel("Carbon", 0.2) };
}

const exported = (root: THREE.Object3D) => buildArScene(root, [], { metresPerUnit: 1 }).scene;
const meshesOf = (scene: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh));
  return out;
};

describe("armArBake", () => {
  it("makes the engine's export copy of a painted mesh carry the livery as a texture, and leaves every other mesh and the live car as they were", async () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES["powder-blue"]);
    armArBake(c.root);
    await ensureArBake(c.root);
    const liveGeometry = c.body.geometry;
    const liveMaterial = c.body.material;
    const meshes = meshesOf(exported(c.root));
    expect(meshes).toHaveLength(3);
    const [body, wing, carbon] = meshes;
    for (const m of [body, wing]) {
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      expect(mat.map, m.name).not.toBeNull();
      expect(mat.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(mat.map!.flipY).toBe(false);
      expect(m.geometry.getAttribute("uv"), m.name).toBeDefined();
      expect(m.geometry.index!.count).toBe(6);
    }
    // The carbon was not painted: no texture, no uv.
    expect((carbon.material as THREE.MeshStandardMaterial).map).toBeNull();
    expect(carbon.geometry.getAttribute("uv")).toBeUndefined();
    // The live car is untouched.
    expect(c.body.geometry).toBe(liveGeometry);
    expect(c.body.material).toBe(liveMaterial);
  });

  it("gives the showroom's shader-only carbon and tyres their flat colour in the export copy, not the white their shader-tinted base would give", async () => {
    const c = car();
    const satin = new THREE.Mesh(c.carbon.geometry, new THREE.MeshStandardMaterial({ name: "livery-satin", color: "#ffffff" }));
    const tyre = new THREE.Mesh(c.carbon.geometry, new THREE.MeshStandardMaterial({ name: "livery-tyre", color: "#ffffff" }));
    c.root.add(satin, tyre);
    applyLiveryDef(c.root, LIVERIES["powder-blue"]);
    armArBake(c.root);
    await ensureArBake(c.root);
    const out = meshesOf(exported(c.root));
    const colour = (i: number) => (out[i].material as THREE.MeshStandardMaterial).color.getHexString();
    expect(colour(3)).toBe("1a1c21");
    expect(colour(4)).toBe("141519");
    expect(satin.material).not.toBe(out[3].material);
    expect((satin.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("ffffff");
  });

  it("carries the finish: one material per finish the mesh has, with that finish's roughness and metalness", async () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES.ghost);
    armArBake(c.root);
    await ensureArBake(c.root);
    const mats = meshesOf(exported(c.root))[0].material;
    const list = (Array.isArray(mats) ? mats : [mats]) as THREE.MeshStandardMaterial[];
    const finish = LIVERIES.ghost.parts.body!.finish;
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((m) => m.roughness === FINISHES[finish].roughness && m.metalness === FINISHES[finish].metalness)).toBe(true);
    for (const m of list) expect(m.map).not.toBeNull();
  });

  it("bakes once per livery, and again for the next one: the copy follows a repaint", async () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES["powder-blue"]);
    armArBake(c.root);
    await ensureArBake(c.root);
    const first = meshesOf(exported(c.root))[0];
    const again = meshesOf(exported(c.root))[0];
    const map = (m: THREE.Mesh) => ((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial).map;
    expect(map(again)!.image).toBe(map(first)!.image);
    const before = painted.length;
    repaintLivery(c.root, LIVERIES["white-stripes"]);
    await ensureArBake(c.root);
    const next = meshesOf(exported(c.root))[0];
    expect(map(next)!.image).not.toBe(map(first)!.image);
    expect(painted.length).toBeGreaterThan(before);
  });

  it("waits for the livery that is on the car when the export is made, if another was picked while it baked", async () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES["powder-blue"]);
    armArBake(c.root);
    const engine = vi.fn(async () => null);
    const store = { exportModel: engine as (kind: never) => Promise<Blob | null> };
    holdExportForBake(store, c.root);
    const pressed = store.exportModel("glb" as never);
    // The press started a bake of powder-blue; the visitor picks white-stripes before it has finished.
    repaintLivery(c.root, LIVERIES["white-stripes"]);
    await pressed;
    const body = meshesOf(exported(c.root))[0];
    const map = (Array.isArray(body.material) ? body.material[0] : body.material) as THREE.MeshStandardMaterial;
    expect(map.map).not.toBeNull();
    expect(engine).toHaveBeenCalledTimes(1);
  });

  it("gives up after a few rounds if the livery never stops changing, rather than waiting for ever", async () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES["powder-blue"]);
    armArBake(c.root);
    let flip = false;
    // A pick lands between every two slices of the bake, for as long as it runs.
    const picker = setInterval(() => repaintLivery(c.root, (flip = !flip) ? LIVERIES["white-stripes"] : LIVERIES["powder-blue"]), 0);
    const outcome = await Promise.race([ensureArBake(c.root).then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("stuck"), 3000))]);
    clearInterval(picker);
    expect(outcome).toBe("done");
  });

  it("exports the plain clone, unpainted, if nothing has baked yet: the bake is never run inside the engine's synchronous clone", () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES["powder-blue"]);
    armArBake(c.root);
    const [body] = meshesOf(exported(c.root));
    expect((body.material as THREE.MeshStandardMaterial).map).toBeNull();
    expect(painted).toHaveLength(0);
  });

  it("holds an export for the bake: the store's exportModel bakes first, then runs the engine's exporter, and puts itself back when undone", async () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES["powder-blue"]);
    armArBake(c.root);
    let seen: THREE.Mesh | null = null;
    const engine = vi.fn(async () => {
      seen = meshesOf(exported(c.root))[0];
      return null;
    });
    const store = { exportModel: engine as (kind: never) => Promise<Blob | null> };
    const undo = holdExportForBake(store, c.root);
    expect(store.exportModel).not.toBe(engine);
    await store.exportModel("glb" as never);
    expect(engine).toHaveBeenCalledTimes(1);
    expect(((seen!.material as THREE.MeshStandardMaterial[])[0] ?? (seen!.material as THREE.MeshStandardMaterial)).map).not.toBeNull();
    undo();
    expect(store.exportModel).toBe(engine);
  });

  it("writes the atlas the bake made into the canvas the texture reads", async () => {
    const c = car();
    applyLiveryDef(c.root, LIVERIES["racing-red"]);
    armArBake(c.root);
    await ensureArBake(c.root);
    exported(c.root);
    // The racing-red body: the livery's red is somewhere on an atlas.
    let red = 0;
    for (const atlas of painted) {
      expect(atlas.data.length).toBe(atlas.width * atlas.height * 4);
      for (let i = 0; i < atlas.data.length; i += 4) if (atlas.data[i] === 0xc8 && atlas.data[i + 1] === 0x10 && atlas.data[i + 2] === 0x2e) red++;
    }
    expect(red).toBeGreaterThan(1000);
  });
});
