/**
 * Smooth shading with real edges: recomputes a mesh's normals from its triangles, averaging the faces
 * that meet at a vertex only when they are within `angle` of each other (three's `toCreasedNormals`).
 * Curved bodywork then shades smoothly while a fold sharper than the angle stays a crisp edge.
 *
 * Pure arrays in and out, so the pipeline (build-car.mjs) and the tests share it. The result is indexed
 * again: a vertex is split only where two faces disagree by more than the angle.
 */
import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** toCreasedNormals welds vertices on a 0.01 grid, so the mesh is scaled to a fixed extent first. */
const GRID_EXTENT = 100;

/**
 * @param {ArrayLike<number>} positions xyz triples
 * @param {ArrayLike<number> | null} indices triangle indices, or null for a triangle list
 * @param {number} angle crease angle in radians
 * @param {ArrayLike<number>} [reference] the mesh's existing per-vertex normals, xyz triples. A mirrored part
 *   (a node with a negative scale) has its winding reversed against its normals; when most triangles
 *   disagree with the reference the result is flipped so it still points the way the source did.
 * @returns {{ positions: Float32Array, normals: Float32Array, smooth: Float32Array, indices: Uint32Array }} `smooth`
 *   is a second, continuous normal per vertex: the creased normals averaged over every vertex sharing a position,
 *   for work that must not jump at a crease (the livery decides paint regions from it).
 */
export function creasedMesh(positions, indices, angle, reference) {
  let extent = 0;
  for (let axis = 0; axis < 3; axis++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = axis; i < positions.length; i += 3) {
      lo = Math.min(lo, positions[i]);
      hi = Math.max(hi, positions[i]);
    }
    extent = Math.max(extent, hi - lo);
  }
  const scale = extent > 0 ? GRID_EXTENT / extent : 1;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(positions, (v) => v * scale), 3));
  if (indices) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
  const merged = mergeVertices(toCreasedNormals(geo, angle), 1e-4);
  const out = merged.getAttribute("position");
  const sign = reference && windingOpposesNormals(positions, indices, reference) ? -1 : 1;
  const normals = Float32Array.from(merged.getAttribute("normal").array, (v) => v * sign + 0);
  return {
    positions: Float32Array.from(out.array, (v) => v / scale),
    normals,
    smooth: averageByPosition(out.array, normals),
    indices: Uint32Array.from(merged.getIndex().array),
  };
}

/** Each vertex's normal replaced by the normalised sum of the normals at its position. */
function averageByPosition(positions, normals) {
  const sums = new Map();
  const key = (i) => `${Math.round(positions[i] * 1e3)},${Math.round(positions[i + 1] * 1e3)},${Math.round(positions[i + 2] * 1e3)}`;
  for (let i = 0; i < positions.length; i += 3) {
    const sum = sums.get(key(i)) ?? [0, 0, 0];
    for (let k = 0; k < 3; k++) sum[k] += normals[i + k];
    sums.set(key(i), sum);
  }
  const out = new Float32Array(normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    const sum = sums.get(key(i));
    const length = Math.hypot(...sum) || 1;
    for (let k = 0; k < 3; k++) out[i + k] = sum[k] / length;
  }
  return out;
}

/** True when most triangles' winding normals point against the reference normals at their corners. */
function windingOpposesNormals(positions, indices, reference) {
  const count = indices ? indices.length : positions.length / 3;
  let against = 0;
  let along = 0;
  for (let t = 0; t < count; t += 3) {
    const [a, b, c] = indices ? [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3] : [t * 3, t * 3 + 3, t * 3 + 6];
    const e1 = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]);
    const e2 = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
    const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const agree = [0, 1, 2].reduce((sum, k) => sum + face[k] * (reference[a + k] + reference[b + k] + reference[c + k]), 0);
    if (agree < 0) against++;
    else if (agree > 0) along++;
  }
  return against > along;
}

/** The custom vertex attribute that carries the continuous normal (see `creasedMesh`). */
export const PAINT_NORMAL = "_LIVNORMAL";

/**
 * Replaces every primitive's normals, positions and indices of a glTF-Transform mesh with creased ones.
 * A primitive for which `wantsPaintNormal(prim)` is true also gets the continuous normal as PAINT_NORMAL
 * (normalised int16, 6 bytes a vertex).
 */
export function creaseMesh(mesh, angle, wantsPaintNormal = () => false) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const indices = prim.getIndices();
    const flat = new Float32Array(pos.getCount() * 3);
    const tmp = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) flat.set(pos.getElement(i, tmp), i * 3);
    const normal = prim.getAttribute("NORMAL");
    const old = normal ? new Float32Array(normal.getCount() * 3) : undefined;
    if (normal) for (let i = 0; i < normal.getCount(); i++) old.set(normal.getElement(i, tmp), i * 3);
    const result = creasedMesh(flat, indices ? indices.getArray() : null, angle, old);
    pos.setArray(result.positions);
    if (normal) normal.setArray(result.normals);
    else prim.setAttribute("NORMAL", pos.clone().setArray(result.normals));
    if (indices) indices.setArray(result.indices);
    else prim.setIndices(pos.clone().setType("SCALAR").setArray(result.indices));
    if (wantsPaintNormal(prim)) {
      const packed = Int16Array.from(result.smooth, (v) => Math.round(v * 32767));
      prim.setAttribute(PAINT_NORMAL, pos.clone().setArray(packed).setNormalized(true));
    }
    // Any other per-vertex attribute no longer lines up with the rebuilt vertices.
    for (const sem of prim.listSemantics()) if (sem !== "POSITION" && sem !== "NORMAL" && sem !== PAINT_NORMAL) prim.setAttribute(sem, null);
  }
}
