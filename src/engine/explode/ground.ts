/**
 * Where the ground (the shadow catcher and, a hair above it, the contact shadow) sits: on the model's
 * lowest point as it is posed right now. Measured from the visible parts' world bounds each time a part moves,
 * so the assembled model rests on its shadow, and exploded parts, whichever way they travelled, never
 * sink through the floor. The shadow camera's frustum is fixed and covers both poses.
 */
import * as THREE from "three";

/** The ground plane sits this far below the lowest point, as a fraction of the model's radius: no visible gap, no z-fight. */
export const GROUND_CLEARANCE = 0.0015;

/** The ground's height for a model whose lowest point is `lowest` and whose bounding radius is `radius`. */
export function groundHeight(lowest: number, radius: number): number {
  return lowest - radius * GROUND_CLEARANCE;
}

const total = new THREE.Box3();
const mine = new THREE.Box3();

function expand(o: THREE.Object3D): void {
  // A hidden part is not on screen, so it cannot be what the model stands on.
  if (!o.visible) return;
  const mesh = o as THREE.Mesh;
  if (mesh.isMesh) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    total.union(mine.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
  }
  for (const c of o.children) expand(c);
}

/**
 * The lowest world y of the visible geometry bounds under the given parts, or null when there is none.
 * Reads the objects' `matrixWorld` as it is: the caller updates it after moving anything.
 */
export function lowestPoint(parts: Iterable<THREE.Object3D>): number | null {
  total.makeEmpty();
  for (const o of parts) expand(o);
  return total.isEmpty() ? null : total.min.y;
}
