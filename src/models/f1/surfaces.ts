/**
 * Real surfaces for the exploded car: the stage's `materials` hook. The livery (livery.ts) already
 * decides every colour and pattern in the fragment shader, so this only changes what the surface
 * does with light: a clear coat over the pearl, navy and gold paint, dark satin carbon, matte rubber
 * that stays black, brushed metal, glass for the visor. Each replacement is a MeshPhysicalMaterial
 * that keeps the livery's shader hook, so the paint job survives the swap.
 *
 * Imports three and the engine's presets, so it belongs to the lazy stage chunk only (stage.tsx).
 * A module function, so it is stable across renders.
 */
import { MeshPhysicalMaterial, type Material, type Mesh } from "three";
import { brushedMetal, clearcoatPaint, glass, satinPlastic } from "@/engine/explode/materials";
import { PAINT_MATERIAL } from "./livery-apply";

type Standard = Material & { color?: { getHex(): number }; side: number };

/** A fresh physical material for the one the livery or the power unit built, or null to leave it. */
function surfaceFor(old: Standard): MeshPhysicalMaterial | null {
  const colour = old.color?.getHex() ?? 0xffffff;
  switch (old.name) {
    case "livery-pearl": {
      // White here: the shader paints pearl, navy and gold. Near dielectric: the base layer's own reflection would smear the studio's softboxes into a glare, so the clear coat alone draws them, as crisp stripes.
      const m = clearcoatPaint(0xffffff);
      m.metalness = 0.05;
      m.roughness = 0.3;
      m.clearcoatRoughness = 0.03;
      return m;
    }
    case PAINT_MATERIAL: {
      // A data livery (livery-apply.ts) sets metalness, roughness and the clear coat per fragment from its finishes; this only has to be physical, with a clear coat on, so the shader has one to set.
      const m = clearcoatPaint(0xffffff);
      m.metalness = 0;
      m.roughness = 0.18;
      m.clearcoatRoughness = 0.06;
      return m;
    }
    case "showroom-RearEndplateLivery":
    case "pu-accent": {
      const m = clearcoatPaint(colour);
      m.metalness = 0.35;
      m.roughness = 0.32;
      return m;
    }
    case "livery-satin":
    case "pu-carbon": {
      const m = satinPlastic(colour);
      m.metalness = 0.1;
      m.roughness = 0.6;
      m.clearcoat = 0.25;
      m.clearcoatRoughness = 0.35;
      return m;
    }
    case "livery-tyre":
    case "pu-rubber": {
      // Rubber reflects almost nothing: a low specular keeps it black instead of grey under the room.
      const m = satinPlastic(colour);
      m.roughness = 0.96;
      m.clearcoat = 0;
      m.specularIntensity = 0.3;
      return m;
    }
    case "showroom-Cover":
    case "showroom-Metal": {
      const m = brushedMetal(colour);
      m.roughness = 0.3;
      return m;
    }
    case "pu-metal":
    case "pu-dark-metal":
    case "pu-alloy": {
      // Not a mirror: a near-full metalness reflects only the dark studio around it and the engine goes black, so a good part of the colour is left to show as diffuse.
      const m = brushedMetal(colour);
      m.metalness = 0.6;
      m.roughness = 0.38;
      return m;
    }
    case "showroom-Screen":
      return glass();
    default:
      return null;
  }
}

/** Swaps every slot of a mesh for its real surface, carrying over the shader hook, name and sidedness. */
export function surfaces(mesh: Mesh): void {
  const swap = (old: Material): Material => {
    const next = surfaceFor(old as Standard);
    if (!next) return old;
    next.name = old.name;
    next.side = old.side;
    next.onBeforeCompile = old.onBeforeCompile;
    next.customProgramCacheKey = old.customProgramCacheKey;
    old.dispose();
    return next;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
}
