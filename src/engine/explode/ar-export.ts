/**
 * The model, ready to hand to a phone's AR viewer: assembled (explode 0), in the colours it was built
 * with, on its own with no lights, ground, contact shadow, outline or leaders, in metres, standing on
 * the floor. Imports three and the exporters, so the stage loads it with `import()` only when the AR
 * button is pressed (the barrel does not re-export it).
 *
 * Three's exporters write MeshStandardMaterial and MeshPhysicalMaterial, not a shader patched through
 * onBeforeCompile (the F1 livery) or a postprocessing pass (N8AO). So every material is rebuilt as a
 * plain MeshStandardMaterial from what the stage kept of the part's own colours (see `ArPart`); what a
 * shader painted per fragment does not survive.
 */
import * as THREE from "three";
import { arScale, type ArFormat, type ArOptions, type ArSimplify } from "./ar";
import { applyExplode, type ExplodePlan } from "./plan";

/** What the stage keeps of one material of a part: the colours it was built with, before hover, isolate and X-ray touch it. */
export interface ArLook {
  mat: THREE.Material;
  color: THREE.Color;
  emissive: THREE.Color;
  /** How the material was authored. */
  blend: { opacity: number; transparent: boolean; depthWrite: boolean };
}

/** The slice of the stage's part state an export needs. */
export interface ArPart {
  meshes: THREE.Mesh[];
  looks: ArLook[];
  /** The look's tint and how far the part leans toward it (a set age, say). */
  tint: THREE.Color;
  amount: number;
}

/** A glass-like (transmissive) material is exported see-through: a standard material cannot carry transmission. */
const GLASS_OPACITY = 0.3;
/** Roughness for a material with none of its own (a basic or shader material): a plain satin. */
const FALLBACK_ROUGHNESS = 0.6;

/** A plain standard material for one live material. */
function exportable(src: THREE.Material, owner: { look: ArLook; part: ArPart } | undefined): THREE.MeshStandardMaterial {
  const s = src as Partial<THREE.MeshPhysicalMaterial>;
  const m = new THREE.MeshStandardMaterial({ name: src.name, side: src.side });
  if (owner) {
    // What the part was built with, tinted by its look; never the live colour, which hover, isolate and X-ray have moved.
    m.color.copy(owner.look.color).lerp(owner.part.tint, owner.part.amount);
    m.emissive.copy(owner.look.emissive);
    m.opacity = owner.look.blend.opacity;
    m.transparent = owner.look.blend.transparent;
  } else if (s.color) {
    m.color.copy(s.color);
  }
  m.metalness = s.metalness ?? 0;
  m.roughness = s.roughness ?? FALLBACK_ROUGHNESS;
  m.emissiveIntensity = s.emissiveIntensity ?? 1;
  m.map = s.map ?? null;
  m.vertexColors = src.vertexColors;
  if ((s.transmission ?? 0) > 0) {
    m.transparent = true;
    m.opacity = Math.min(m.opacity, GLASS_OPACITY);
  }
  return m;
}

/**
 * The geometry with only what a viewer reads: the model's own extra attributes (the livery's normals)
 * are dropped, and `uv` too unless `uv` says a texture will read it. Shares the buffers.
 */
function slim(src: THREE.BufferGeometry, uv: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of uv ? ["position", "normal", "uv", "color"] : ["position", "normal", "color"]) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, a);
  }
  g.setIndex(src.index);
  for (const group of src.groups) g.addGroup(group.start, group.count, group.materialIndex);
  return g;
}

/** Whether any of a mesh's materials draws a texture, so its uv is worth carrying. */
const textured = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((m) => !!(m as THREE.MeshStandardMaterial).map);

/** Reduces a geometry (see ./ar-simplify). */
type Simplifier = (geometry: THREE.BufferGeometry, options: ArSimplify) => THREE.BufferGeometry;

/** Walks a tree and its clone together: `clone(true)` keeps child order, so index i is the same node. */
function twin(src: THREE.Object3D, copy: THREE.Object3D, visit: (s: THREE.Object3D, c: THREE.Object3D) => void) {
  visit(src, copy);
  src.children.forEach((child, i) => twin(child, copy.children[i], visit));
}

/**
 * A copy of `root` (which must already be in the pose to export) for the exporters, inside a group that
 * scales it to metres and stands it on the floor, centred. The live model is not touched. Parts the
 * system filter has hidden are left out. Throws when nothing is left to show.
 */
export function buildArScene(root: THREE.Object3D, parts: Iterable<ArPart>, options: ArOptions, simplify?: Simplifier): { scene: THREE.Group; scale: number } {
  const owners = new Map<THREE.Material, { look: ArLook; part: ArPart }>();
  for (const part of parts) for (const look of part.looks) owners.set(look.mat, { look, part });

  const copy = root.clone(true);
  const swapped = new Map<THREE.Material, THREE.Material>();
  // Per source geometry, once for meshes that read its uv and once for those that do not.
  const slimmed = [new Map<THREE.BufferGeometry, THREE.BufferGeometry>(), new Map<THREE.BufferGeometry, THREE.BufferGeometry>()];
  const lean = options.simplify && simplify ? (g: THREE.BufferGeometry) => simplify(g, options.simplify as ArSimplify) : null;
  const hidden: THREE.Object3D[] = [];
  twin(root, copy, (s, c) => {
    if (!s.visible) hidden.push(c);
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material) => {
      let next = swapped.get(m);
      if (!next) swapped.set(m, (next = exportable(m, owners.get(m))));
      return next;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    // A lean export also drops a uv nothing reads: a third of the vertex data of a model with no textures.
    const uv = !lean || textured(mesh);
    const cache = slimmed[uv ? 1 : 0];
    let geometry = cache.get(mesh.geometry);
    if (!geometry) {
      geometry = slim(mesh.geometry, uv);
      cache.set(mesh.geometry, (geometry = lean ? lean(geometry) : geometry));
    }
    mesh.geometry = geometry;
  });
  // Removed only now: taking a child out mid-walk would shift the indexes the walk pairs by.
  for (const o of hidden) o.removeFromParent();

  const scene = new THREE.Group();
  scene.name = "ar-model";
  scene.add(copy);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(copy, true);
  if (box.isEmpty()) throw new Error("Nothing to export: no part is shown");
  const size = box.getSize(new THREE.Vector3());
  const scale = arScale(Math.max(size.x, size.y, size.z), options);
  const centre = box.getCenter(new THREE.Vector3());
  scene.scale.setScalar(scale);
  scene.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  scene.updateMatrixWorld(true);
  return { scene, scale };
}

const TYPES: Record<ArFormat, string> = { glb: "model/gltf-binary", usdz: "model/vnd.usdz+zip" };

export interface ArSource {
  root: THREE.Object3D;
  plan: ExplodePlan;
  parts: Iterable<ArPart>;
  /** The live explode value, put back once the assembled copy has been made. */
  k: number;
}

/** Exports the assembled model as a GLB or a USDZ. The exporters are fetched here, on first use. */
export async function exportForAr(kind: ArFormat, { root, plan, parts, k }: ArSource, options: ArOptions): Promise<Blob> {
  // Awaited before the pose changes, so nothing is left half-assembled while the WASM loads.
  let simplify: Simplifier | undefined;
  if (options.simplify) {
    const lean = await import("./ar-simplify");
    await lean.ready();
    simplify = lean.simplify;
  }
  // The copy is taken in the assembled pose and the live one put straight back: nothing is drawn in between.
  applyExplode(plan, 0);
  root.updateMatrixWorld(true);
  let built: ReturnType<typeof buildArScene>;
  try {
    built = buildArScene(root, parts, options, simplify);
  } finally {
    applyExplode(plan, k);
    root.updateMatrixWorld(true);
  }
  if (kind === "glb") {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const buffer = (await new GLTFExporter().parseAsync(built.scene, { binary: true, onlyVisible: true })) as ArrayBuffer;
    return new Blob([buffer], { type: TYPES.glb });
  }
  const { USDZExporter } = await import("three/addons/exporters/USDZExporter.js");
  const bytes = await new USDZExporter().parseAsync(built.scene, { quickLookCompatible: true });
  return new Blob([bytes as BlobPart], { type: TYPES.usdz });
}
