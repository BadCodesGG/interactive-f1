/**
 * Leaner geometry for the AR file (see `ArSimplify` in ./ar). A USDZ is uncompressed, so its size is
 * the vertex and triangle count and nothing else: this welds a mesh's vertices and lets meshoptimizer
 * collapse the triangles that add least to the shape, within an error the app sets. Permissive lets it
 * collapse across a mesh's hard edges (a plain run keeps every seam and stalls near 60% of the triangles);
 * Prune drops islands smaller than the error (a screw on a board). The on-screen
 * model is never touched (the export works on a copy). Loaded by ./ar-export only when an app asks
 * for it, so its WASM stays out of every other route and app.
 */
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";
import type { ArSimplify } from "./ar";

/** Two vertices closer than this (model units) in every attribute are one. */
const WELD = 1e-4;
/** Attributes the simplifier tries to keep true: they are what a viewer shades and textures by. */
const KEPT: [name: string, size: number][] = [["normal", 3], ["color", 3], ["uv", 2]];

/** A plain, non-interleaved, Float32 attribute: what the simplifier can read. */
function plain(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): a is THREE.BufferAttribute {
  return !!a && !("isInterleavedBufferAttribute" in a && a.isInterleavedBufferAttribute) && a.array instanceof Float32Array;
}

/** Waits for the WASM, after which `simplify` may be called. */
export const ready = () => MeshoptSimplifier.ready;

/**
 * `geometry` with about `keep` of its triangles, never straying further than `error` (a fraction of
 * its own extent) from the original surface, and no vertex left unused. Returns `geometry` itself when
 * it cannot be simplified (drawn in groups, or its data is not plain floats) or would not shrink.
 * Call `ready()` first.
 */
export function simplify(geometry: THREE.BufferGeometry, { keep, error = 0.005 }: ArSimplify): THREE.BufferGeometry {
  if (geometry.groups.length > 0 || !plain(geometry.getAttribute("position"))) return geometry;
  const welded = mergeVertices(geometry, WELD);
  const position = welded.getAttribute("position") as THREE.BufferAttribute;
  const index = welded.index;
  if (!index || !plain(position) || position.itemSize !== 3) return geometry;

  const names = KEPT.filter(([name, size]) => {
    const a = welded.getAttribute(name);
    return plain(a) && a.itemSize === size;
  });
  const stride = names.reduce((n, [, size]) => n + size, 0);
  const vertices = position.count;
  const attributes = new Float32Array(vertices * stride);
  let at = 0;
  for (const [name, size] of names) {
    const a = welded.getAttribute(name) as THREE.BufferAttribute;
    for (let v = 0; v < vertices; v++) for (let c = 0; c < size; c++) attributes[v * stride + at + c] = a.getComponent(v, c);
    at += size;
  }

  const before = index.count;
  const target = Math.max(3, Math.floor((before * keep) / 3) * 3);
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(
    Uint32Array.from(index.array),
    position.array as Float32Array,
    3,
    attributes,
    stride,
    new Array<number>(stride).fill(1),
    null,
    target,
    error,
    ["Prune", "Permissive"],
  );
  if (kept.length >= before) return geometry;

  // Only the vertices the kept triangles use, so the file is not left carrying the collapsed ones.
  const [remap, used] = MeshoptSimplifier.compactMesh(kept);
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(welded.attributes)) {
    const a = welded.getAttribute(name);
    if (!plain(a)) continue;
    const next = new Float32Array(used * a.itemSize);
    for (let old = 0; old < vertices; old++) {
      const to = remap[old];
      if (to === 0xffffffff || to >= used) continue;
      for (let c = 0; c < a.itemSize; c++) next[to * a.itemSize + c] = a.getComponent(old, c);
    }
    out.setAttribute(name, new THREE.BufferAttribute(next, a.itemSize, a.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(kept, 1));
  return out;
}
