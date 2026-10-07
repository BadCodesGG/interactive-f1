/**
 * The livery in the AR export. The exporters write three's standard materials, not the livery's shader,
 * so an export of the live car is unpainted. The engine builds its export from a `root.clone(true)` and
 * keeps of each mesh what a viewer reads (position, normal, uv, the groups, and the material's map,
 * roughness and metalness); this gives each painted mesh a `clone` that hands the copy a baked geometry
 * and materials instead of the live ones. The live car is never touched, and no engine file is.
 *
 * What the copy carries (see livery-bake.ts for how it is made):
 * - a texture atlas of the paint, stripes and decals, evaluated from the livery's own rules;
 * - planar UVs, generated for the whole mesh (the scan has none);
 * - a material per finish (matte, satin, gloss, metallic), since the exporter carries roughness and
 *   metalness per material and not per texel: Silver's metallic nose and matte tail, Ghost's satin
 *   panels on matte, are separate triangle runs. A decal's own finish (Ghost's gloss marks) is lost.
 *
 * The showroom's procedural carbon (floor, wishbones, cockpit) and tyre materials are shaders too and would
 * export white; their copy gets their base colour as a plain material instead (the weave and the tyre's soft
 * band are lost, which a flat material cannot carry).
 *
 * The bake (livery-bake.ts) is loaded with a dynamic import, only when an export wants it, and runs once
 * per mesh and livery in slices that yield to drawing; it is kept for the last two liveries. On a phone that
 * can do AR it is warmed in the background after a pick (`scheduleArBake`); a press that comes first waits
 * for it (`holdExportForBake`). Imports three: a stage-chunk module, but not the bake.
 */
import * as THREE from "three";
import { detectAr, readArEnv } from "@/engine/explode/ar";
import { decalImage, paintedSlots } from "./livery-apply";
import type { BakedMesh, DecalPixels, DecalSet } from "./livery-bake";
import { SHOWROOM_COLOURS } from "./livery";
import { FINISHES, type DecalTexture } from "./livery-spec";

interface Baked {
  geometry: THREE.BufferGeometry;
  materials: THREE.MeshStandardMaterial[];
  texture: THREE.Texture;
}

/** How many liveries' bakes a mesh keeps. */
const KEEP = 2;
const cache = new WeakMap<THREE.Mesh, Map<string, Baked>>();
const pixels = new Map<DecalTexture, DecalPixels>();

/** A logo's pixels, read once from the image the livery's shader also uses; null until it has loaded. */
function decalPixels(kind: DecalTexture): DecalPixels | null {
  const have = pixels.get(kind);
  if (have) return have;
  const image = decalImage(kind);
  if (!image || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const read = ctx.getImageData(0, 0, image.width, image.height);
  const out = { width: read.width, height: read.height, data: read.data };
  pixels.set(kind, out);
  return out;
}

/** Both logos, or null for one that has not loaded yet (the bake then leaves it out and does not keep the result). */
function decalSet(): { set: DecalSet; complete: boolean } {
  const mark = decalPixels("mark");
  const wordmark = decalPixels("wordmark");
  return { set: { mark, wordmark }, complete: !!mark && !!wordmark };
}

function attributeArray(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

/** The mesh as the bake takes it, or null if it is not a single-material mesh this module painted. */
function bakeInput(mesh: THREE.Mesh) {
  const slots = paintedSlots(mesh);
  if (!slots || slots.length !== 1 || !slots[0] || Array.isArray(mesh.material)) return null;
  const position = mesh.geometry.getAttribute("position");
  const normal = mesh.geometry.getAttribute("normal");
  if (!position || !normal) return null;
  const slot = slots[0];
  return {
    slot,
    mesh: {
      part: slot.part,
      positions: attributeArray(position),
      normals: attributeArray(normal),
      index: mesh.geometry.index ? (mesh.geometry.index.array as ArrayLike<number>) : null,
      rest: slot.rest.elements,
    },
  };
}

/** The baked result as three objects: a geometry with groups, and one standard material per finish, all reading one texture. */
function assemble(baked: BakedMesh): Baked {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = baked.atlas.size;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(baked.atlas.colour), baked.atlas.size, baked.atlas.size), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  // The uvs have their origin at the top left, as glTF's do, so the image is not flipped.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(baked.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(baked.normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(baked.uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(baked.index, 1));
  const materials = baked.groups.map((g, i) => {
    geometry.addGroup(g.start, g.count, i);
    const f = FINISHES[g.finish];
    return new THREE.MeshStandardMaterial({ name: `livery-ar-${g.finish}`, map: texture, color: "#ffffff", metalness: f.metalness, roughness: f.roughness, side: THREE.DoubleSide });
  });
  return { geometry, materials, texture };
}

function remember(mesh: THREE.Mesh, id: string, baked: Baked): void {
  let byLivery = cache.get(mesh);
  if (!byLivery) cache.set(mesh, (byLivery = new Map()));
  byLivery.delete(id);
  byLivery.set(id, baked);
  while (byLivery.size > KEEP) {
    const [oldest, old] = byLivery.entries().next().value as [string, Baked];
    byLivery.delete(oldest);
    old.geometry.dispose();
    old.texture.dispose();
    old.materials.forEach((m) => m.dispose());
  }
}

/** The bake a mesh has for the livery it wears now, or null when it has none yet (or is not a painted mesh). */
function bakedFor(mesh: THREE.Mesh): Baked | null {
  const slot = paintedSlots(mesh)?.[0];
  return slot ? (cache.get(mesh)?.get(slot.livery.id) ?? null) : null;
}

/** The bake's module, fetched on first need and never before: it is the heavy part and only an AR export wants it. */
let bakeModule: Promise<typeof import("./livery-bake")> | null = null;
const loadBake = () => (bakeModule ??= import("./livery-bake"));

/** Waits, up to `ms`, for both logos to have loaded, so the bake is not made without them. */
async function logosLoaded(ms: number): Promise<boolean> {
  for (let waited = 0; waited <= ms; waited += 50) {
    if (decalSet().complete) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

const jobs = new WeakMap<THREE.Mesh, Map<string, Promise<void>>>();
/** A bake made without the logos (they never loaded): handed to the next clone once, not kept. */
const unkept = new WeakMap<THREE.Mesh, Baked>();

/**
 * Bakes one mesh for the livery it wears now, in slices that give the page back between them, and keeps the
 * result. Stops quietly if another livery is picked meanwhile. One job per mesh and livery, however many ask.
 */
function bakeJob(mesh: THREE.Mesh): Promise<void> {
  const input = bakeInput(mesh);
  if (!input) return Promise.resolve();
  const livery = input.slot.livery;
  const id = livery.id;
  if (cache.get(mesh)?.has(id)) return Promise.resolve();
  let byLivery = jobs.get(mesh);
  if (!byLivery) jobs.set(mesh, (byLivery = new Map()));
  const running = byLivery.get(id);
  if (running) return running;
  const job = (async () => {
    const { bakeMesh } = await loadBake();
    const logos = await logosLoaded(3000);
    const gen = bakeMesh(input.mesh, livery, decalSet().set);
    for (let r = gen.next(); ; r = gen.next()) {
      if (paintedSlots(mesh)?.[0]?.livery !== livery) return;
      if (r.done) {
        if (!r.value) return;
        const baked = assemble(r.value);
        if (logos) remember(mesh, id, baked);
        else unkept.set(mesh, baked);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })().finally(() => byLivery.delete(id));
  byLivery.set(id, job);
  return job;
}

function paintedMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && paintedSlots(mesh)?.length === 1) out.push(mesh);
  });
  return out;
}

/** The showroom's shader-only materials, by name, as the plain materials their export copies get. */
const FLAT: Record<string, { colour: string; metalness: number; roughness: number }> = {
  "livery-satin": { colour: SHOWROOM_COLOURS.carbon, metalness: 0, roughness: 0.8 },
  "livery-tyre": { colour: SHOWROOM_COLOURS.rubber, metalness: 0.02, roughness: 0.85 },
};

/**
 * Makes the AR export of this car carry its livery: every painted mesh under `root` gets a `clone` that
 * returns the baked copy, and the showroom's carbon and tyres one that returns their flat colour. The copy
 * is made from the bake `ensureArBake` has kept, so nothing here imports the bake; a clone asked for before
 * there is one is the plain clone (an unpainted export), which `holdExportForBake` keeps from happening.
 */
export function armArBake(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const flat = !Array.isArray(mesh.material) ? FLAT[mesh.material.name] : undefined;
    if (flat && !paintedSlots(mesh)) {
      mesh.clone = function (this: THREE.Mesh, recursive?: boolean) {
        const copy = THREE.Object3D.prototype.clone.call(this, recursive) as THREE.Mesh;
        copy.material = new THREE.MeshStandardMaterial({ name: (this.material as THREE.Material).name, color: flat.colour, metalness: flat.metalness, roughness: flat.roughness, side: THREE.DoubleSide });
        return copy;
      };
      return;
    }
    if (!paintedSlots(mesh)) return;
    mesh.clone = function (this: THREE.Mesh, recursive?: boolean) {
      const copy = THREE.Object3D.prototype.clone.call(this, recursive) as THREE.Mesh;
      const baked = bakedFor(this) ?? unkept.get(this) ?? null;
      unkept.delete(this);
      if (baked) {
        copy.geometry = baked.geometry;
        copy.material = baked.materials.length === 1 ? baked.materials[0] : baked.materials;
      }
      return copy;
    };
  });
}

/** How many times an export re-asks for the bake because a livery was picked while it ran: a visitor cannot out-pick it for ever. */
const BAKE_TRIES = 4;

/**
 * Bakes the livery the car wears now for every painted mesh that has not got it, loading the bake's module
 * first (a dynamic import, so it is a chunk of its own that a visitor who never asks for AR never fetches),
 * in slices that yield to drawing. Resolves when the export has everything it needs: a bake stops quietly when
 * another livery is picked meanwhile, so if any mesh now wears a livery other than the one the round began with,
 * it asks again for the one it wears (up to BAKE_TRIES rounds), and the export is never made from a car with no bake.
 */
export async function ensureArBake(root: THREE.Object3D): Promise<void> {
  const wearing = () => paintedMeshes(root).map((mesh) => paintedSlots(mesh)?.[0]?.livery);
  for (let round = 0; round < BAKE_TRIES; round++) {
    const began = wearing();
    await Promise.all(paintedMeshes(root).map(bakeJob));
    if (wearing().every((livery, i) => livery === began[i])) return;
  }
}

/**
 * Warms the bake in the background for a device that can do AR, so pressing the button finds it done; a
 * pick of another livery starts over on it. Does nothing on a device with no AR.
 */
export function scheduleArBake(root: THREE.Object3D): void {
  if (typeof navigator === "undefined" || !detectAr(readArEnv())) return;
  void ensureArBake(root);
}

/**
 * Makes the store's `exportModel` wait for the bake first: a cold press (before the warm-up finished, or on
 * a device that was not warmed) bakes in slices and then exports, instead of the engine's synchronous clone
 * finding nothing to copy. The engine registers its own exporter with the store; this wraps the store's
 * public `exportModel` around it and returns the function that puts the original back.
 */
export function holdExportForBake(store: { exportModel: (kind: never) => Promise<Blob | null> }, root: THREE.Object3D): () => void {
  const original = store.exportModel;
  store.exportModel = async (kind) => {
    await ensureArBake(root);
    return original(kind);
  };
  return () => {
    store.exportModel = original;
  };
}
