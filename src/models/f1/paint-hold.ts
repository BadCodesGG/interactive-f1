/**
 * Materials a layer has swapped out of a mesh for a stand-in (the lap's flap tint), by mesh. A repaint
 * (livery-apply.ts repaintLivery) follows the material the mesh is meant to wear, not the stand-in, so the
 * livery picked meanwhile is on it when the layer puts it back. A module of its own, with no imports but
 * types, so the lap's chunk can use it without pulling livery-apply and the renderer's code in with it.
 */
import type { Material, Mesh } from "three";

const held = new WeakMap<Mesh, Material | Material[]>();

/** Tells repaintLivery that `mesh` wears a stand-in for now, and that `original` is the paint to keep current. */
export const holdPaint = (mesh: Mesh, original: Material | Material[]): void => void held.set(mesh, original);

/** The stand-in is gone: repaints go to `mesh.material` again. */
export const releasePaint = (mesh: Mesh): void => void held.delete(mesh);

/** The paint a mesh is meant to wear while a stand-in is on it, or undefined when it wears its own. */
export const heldPaint = (mesh: Mesh): Material | Material[] | undefined => held.get(mesh);
