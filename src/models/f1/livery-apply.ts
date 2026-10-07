/**
 * Paints the F226 in a data livery (livery-spec.ts): each painted part gets a material whose fragment
 * shader is generated from the livery's rules (livery-glsl.ts), reading the vertex's rest-pose
 * position in metres, so the pattern stays put on a part the explode moves.
 *
 * The stage still tints through `color` and `emissive`: the base colour stays white and the shader
 * multiplies `diffuseColor` by the paint, so hover glow, isolate dimming and X-ray all work on it.
 * The finish (metalness, roughness, clear coat) is set per fragment from the livery's finishes,
 * over whatever the surfaces hook (surfaces.ts) builds; that hook must make the body physical, or
 * there is no clear coat to set.
 *
 * The paint is a program per livery and part, so a repaint (repaintLivery) swaps each material's hook
 * and cache key in place and asks for a rebuild: the stage's own references to the materials (its
 * hover, isolate and X-ray tints) stay valid. The part and the rest matrix of each painted slot are
 * kept per mesh, not per material, because the stage and the surfaces hook replace the materials.
 *
 * Imports three: it belongs to the lazy stage chunk. The logo textures are fetched from there too,
 * never from a route's initial JS.
 */
import { invalidate } from "@react-three/fiber";
import * as THREE from "three";
import { DECALS } from "./decals";
import { BEGIN_VERTEX, COMMON_VERTEX, DEFORM_NORMAL, DEFORM_POSITION, DEFORM_VERTEX, PAINT_NORMAL_BEGIN, PAINT_NORMAL_VERTEX, type TunnelDeform } from "./livery";
import { decalSampler, liveryGlsl, liveryGlslSplit } from "./livery-glsl";
import { heldPaint } from "./paint-hold";
import { LIVERY_PARTS, PART_MATERIAL, type DecalPlacement, type DecalTexture, type Livery, type LiveryPart } from "./livery-spec";

/** The name of every material this module builds: the surfaces hook keys on it. */
export const PAINT_MATERIAL = "livery-paint";

const textures = new Map<DecalTexture, THREE.Texture>();

/**
 * A logo texture, fetched once and shared. Until it arrives it samples as transparent (three binds
 * an empty texture to one with no image), so nothing flashes; when it lands the stage is asked for a
 * frame, because it only draws on demand.
 */
function decalTexture(kind: DecalTexture): THREE.Texture {
  let tex = textures.get(kind);
  if (!tex) {
    tex = new THREE.TextureLoader().load(DECALS[kind].url, () => invalidate());
    // The monogram is a picture in sRGB; the wordmark is a mask, read as data.
    tex.colorSpace = kind === "mark" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 8;
    textures.set(kind, tex);
  }
  return tex;
}

/** A logo's image once it has loaded (the bake reads its pixels), else null. */
export function decalImage(kind: DecalTexture): (CanvasImageSource & { width: number; height: number }) | null {
  const image = decalTexture(kind).image as (CanvasImageSource & { width: number; height: number }) | undefined;
  return image && image.width > 0 ? image : null;
}

const PART_OF_MATERIAL = new Map(LIVERY_PARTS.map((part) => [PART_MATERIAL[part], part]));

/** What the wind tunnel adds to a paint hook: the wing and diffuser bend, and the map from its car into the livery's frame. */
export interface PaintOptions {
  deform?: { uniforms: TunnelDeform; part: number };
  /** Takes a rest-pose point of this car into the frame the livery rules are written in (the F226's). Paint only: the bend stays in the car's own metres. */
  frame?: THREE.Matrix4;
  /** The mesh is this part and another at once (a wing scan): beyond `cut` metres from the centreline, in the livery's frame, it is `plate`. */
  split?: { plate: LiveryPart; cut: number };
  /** This car's own version of the livery's decal list (its surface is not the F226's, so its marks move). */
  decals?: (all: readonly DecalPlacement[]) => readonly DecalPlacement[];
}

/** Declared in the vertex shader when the paint reads through a frame map. */
const FRAME_VERTEX = /* glsl */ `
uniform mat4 uFrame;
uniform mat3 uFrameN;
`;
const FRAME_BEGIN = /* glsl */ `
vLivPos = (uFrame * (uRest * vec4(position, 1.0))).xyz;
vLivNor = normalize(uFrameN * (mat3(uRest) * objectNormal));
`;

/** The shader hook and program key that paint one part of a livery on a mesh whose rest pose is `rest`. */
export function paintHook(livery: Livery, part: LiveryPart, rest: THREE.Matrix4, options: PaintOptions = {}): Pick<THREE.Material, "onBeforeCompile" | "customProgramCacheKey"> {
  const { deform, frame, split } = options;
  const decals = options.decals ? options.decals(livery.decals) : livery.decals;
  const glsl = split ? liveryGlslSplit(livery, part, split.plate, split.cut, decals) : liveryGlsl(livery, part, decals);
  const uniforms: Record<string, THREE.IUniform> = { uRest: { value: rest.clone() } };
  for (const kind of glsl.textures) uniforms[decalSampler(kind)] = { value: decalTexture(kind) };
  if (deform) Object.assign(uniforms, deform.uniforms, { uPart: { value: deform.part }, uRestInv: { value: rest.clone().invert() } });
  if (frame) {
    uniforms.uFrame = { value: frame.clone() };
    uniforms.uFrameN = { value: new THREE.Matrix3().getNormalMatrix(frame) };
  }
  return {
    onBeforeCompile(shader) {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${COMMON_VERTEX}${frame ? FRAME_VERTEX : PAINT_NORMAL_VERTEX}${deform ? DEFORM_VERTEX : ""}`)
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${deform ? DEFORM_NORMAL : ""}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${deform ? DEFORM_POSITION : ""}${BEGIN_VERTEX}${frame ? FRAME_BEGIN : PAINT_NORMAL_BEGIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vLivPos;\nvarying vec3 vLivNor;\n${glsl.source}`)
        .replace("#include <color_fragment>", "#include <color_fragment>\nLivOut livO = livPaint(vLivPos, normalize(vLivNor));\ndiffuseColor.rgb *= livO.colour;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = livO.fin.y;")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = livO.fin.x;")
        .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat = livO.fin.z;\nmaterial.clearcoatRoughness = livO.fin.w;\n#endif");
    },
    // One program per livery and part: the source differs, the uniforms (the rest matrix) do not.
    customProgramCacheKey: () => `badcodes-livery-data-${livery.id}-${part}${split ? `+${split.plate}` : ""}${deform ? "-bend" : ""}${frame ? "-frame" : ""}`,
  };
}

/** A fresh paint material for one part of a livery (what the stage later clones and the surfaces hook upgrades). */
export function paintMaterial(livery: Livery, part: LiveryPart, rest: THREE.Matrix4, options?: PaintOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ name: PAINT_MATERIAL, color: "#ffffff", metalness: 0, roughness: 0.18, side: THREE.DoubleSide });
  return Object.assign(mat, paintHook(livery, part, rest, options));
}

/** One painted material slot of a mesh: which part it is, the pose the paint reads, and what the paint was asked to do. */
export interface PaintedSlot {
  part: LiveryPart;
  rest: THREE.Matrix4;
  options?: PaintOptions;
  /** The livery the slot wears now. */
  livery: Livery;
}

const painted = new WeakMap<THREE.Mesh, (PaintedSlot | null)[]>();

/** The painted slots of a mesh (null for one left alone), or undefined for a mesh this module did not paint. */
export const paintedSlots = (mesh: THREE.Mesh): readonly (PaintedSlot | null)[] | undefined => painted.get(mesh);

/** Records the slots a mesh was painted in, so a repaint and the AR bake can find them. */
export function registerPainted(mesh: THREE.Mesh, slots: (PaintedSlot | null)[]): void {
  painted.set(mesh, slots);
}

/**
 * Paints every part the livery names on the loaded scene root. Call before applyShowroomLivery, which
 * leaves a material it does not know alone, and before the explode plan is made (it reads the rest pose).
 */
export function applyLiveryDef(root: THREE.Object3D, livery: Livery): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const rest = mesh.matrixWorld.clone();
    const slots = old.map((m): PaintedSlot | null => {
      const part = PART_OF_MATERIAL.get(m.name);
      return part && livery.parts[part] ? { part, rest, livery } : null;
    });
    const next = old.map((m, i) => {
      const slot = slots[i];
      return slot ? paintMaterial(livery, slot.part, slot.rest) : m;
    });
    for (const m of old) if (!next.includes(m)) m.dispose();
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
    if (slots.some(Boolean)) painted.set(mesh, slots);
  });
}

/**
 * Puts another livery on a car applyLiveryDef (or the tunnel's equivalent) painted, in place: each painted
 * slot's hook and program key are replaced and the material is rebuilt on its next draw. The materials
 * are the ones on the meshes now, so a stage that has cloned or swapped them since is followed. A slot
 * the new livery does not paint keeps the paint it has.
 */
export function repaintLivery(root: THREE.Object3D, livery: Livery): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const slots = mesh.isMesh ? painted.get(mesh) : undefined;
    if (!slots) return;
    const worn = heldPaint(mesh) ?? mesh.material;
    const materials = Array.isArray(worn) ? worn : [worn];
    slots.forEach((slot, i) => {
      if (!slot || slot.livery === livery || !livery.parts[slot.part] || (slot.options?.split && !livery.parts[slot.options.split.plate])) return;
      slot.livery = livery;
      Object.assign(materials[i], paintHook(livery, slot.part, slot.rest, slot.options));
      materials[i].needsUpdate = true;
    });
  });
  invalidate();
}
