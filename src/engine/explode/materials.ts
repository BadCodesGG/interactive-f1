/**
 * Material presets for the stage's `materials` hook. Like ./stage, this imports three, so it is not
 * in the barrel: import it from the same lazy chunk as the stage (`@/engine/explode/materials`).
 *
 * Every preset is a MeshPhysicalMaterial, which is a MeshStandardMaterial, so the stage's per-part
 * state keeps working on it: the stage clones the material once per mesh and then drives `color`
 * (tint and the isolate fade toward the page background) and `emissive` (the hover and selection
 * glow). So a preset leaves `emissive` black and `emissiveIntensity` at 1, and never bakes a colour
 * into a map. `opacity` and `transparent` are left alone for the same reason: a ghost or X-ray look
 * will own them.
 */
import { Color, MeshPhysicalMaterial, type ColorRepresentation, type Mesh } from "three";

/**
 * Runs once per mesh of each part after the model loads, before the stage clones and tints its
 * materials. Assign `mesh.material` (see `setMaterial`) or edit it in place. Must be stable across
 * renders (a module function or a memoised callback), or the model reloads.
 */
export type MaterialHook = (mesh: Mesh, partId: string) => void;

/** Puts one material on every slot of a mesh; the stage clones it per mesh afterwards, so sharing it is fine. */
export function setMaterial(mesh: Mesh, material: MeshPhysicalMaterial): void {
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(() => material) : material;
}

/** A car-paint finish: a tinted, slightly metallic base under a glossy clear layer. */
export function clearcoatPaint(color: ColorRepresentation): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04 });
}

/** Machined metal: fully metallic and moderately rough. No anisotropy, which needs UVs a procedural part lacks. */
export function brushedMetal(color: ColorRepresentation): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color, metalness: 0.95, roughness: 0.42 });
}

/** Moulded plastic with a faint sheen of clear coat over a matte-ish base. */
export function satinPlastic(color: ColorRepresentation): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 });
}

/**
 * Soft, slightly wet organic tissue: a fibre sheen (in a paler shade of the colour, since black sheen
 * shows nothing) and a light clear coat.
 */
export function tissue(color: ColorRepresentation): MeshPhysicalMaterial {
  const base = new Color(color);
  return new MeshPhysicalMaterial({
    color: base,
    metalness: 0,
    roughness: 0.62,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: base.clone().lerp(new Color(1, 1, 1), 0.5),
    clearcoat: 0.15,
    clearcoatRoughness: 0.45,
  });
}

/** Clear glass by transmission: it refracts what is behind it, at the cost of a transmission pass per frame. */
export function glass(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.15, ior: 1.45 });
}
