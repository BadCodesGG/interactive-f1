/**
 * Test support for the tunnel car's marks: its triangles in the F226's frame, and a probe that casts a ray
 * through a grid over a mark's whole rectangle. Not a test, so it is not collected.
 */
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { decalFrame } from "./livery-paint";
import type { DecalPlacement } from "./livery-spec";
import { TUNNEL_FRAME } from "./tunnel-frame";

type Vec3 = readonly [number, number, number];

/** The world-space triangles (metres), nine numbers each, of the primitives `pick(parentNodeName)` accepts. */
export async function triangles(file: string, pick: (parent: string) => boolean): Promise<Float64Array> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(path.join(process.cwd(), "public", "models", file));
  const out: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !pick(node.getParentNode()?.getName() ?? node.getName())) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION")!;
      const idx = prim.getIndices();
      const world: number[][] = [];
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        world.push([0, 1, 2].map((a) => m[a] * v[0] + m[4 + a] * v[1] + m[8 + a] * v[2] + m[12 + a]));
      }
      const count = idx ? idx.getCount() : pos.getCount();
      for (let i = 0; i < count; i++) out.push(...world[idx ? idx.getScalar(i) : i]);
    }
  }
  return Float64Array.from(out);
}


/** The tunnel car's body and rear wing triangles, in the F226's frame. */
export async function tunnelSurface(): Promise<Float64Array> {
  const [sx, sy, sz] = TUNNEL_FRAME.scale;
  const [tx, ty, tz] = TUNNEL_FRAME.offset;
  const own = await triangles("f1-2026.1d32fb13.glb", (p) => ["chassis", "left-sidepod", "right-sidepod", "engine-cover", "halo", "rear-wing"].includes(p));
  return Float64Array.from(own, (v, i) => [sx * v + tx, sy * v + ty, sz * v + tz][i % 3]);
}

/**
 * Casts a ray along -normal from 0.3 m above each point of a grid over the mark's whole rectangle (corners
 * and edges included) and reports, per sample, where the outermost surface is: its offset from the mark's
 * plane along the normal, and the angle between that surface's face normal and the mark's projection axis.
 * A sample that hits nothing is reported as missing.
 */
export function probe(d: DecalPlacement, tris: Float64Array, cols = 9, rows = 5) {
  const f = decalFrame(d);
  const out: { a: number; b: number; offset: number; angle: number }[] = [];
  const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = (i / (cols - 1) - 0.5) * d.size[0];
      const b = (j / (rows - 1) - 0.5) * d.size[1];
      const o: Vec3 = [0, 1, 2].map((k) => d.centre[k] + a * f.right[k] + b * f.up[k] + 0.3 * f.normal[k]) as unknown as Vec3;
      const dir: Vec3 = [-f.normal[0], -f.normal[1], -f.normal[2]];
      let best = Infinity;
      let face: Vec3 | null = null;
      for (let t = 0; t < tris.length; t += 9) {
        const e1: Vec3 = [tris[t + 3] - tris[t], tris[t + 4] - tris[t + 1], tris[t + 5] - tris[t + 2]];
        const e2: Vec3 = [tris[t + 6] - tris[t], tris[t + 7] - tris[t + 1], tris[t + 8] - tris[t + 2]];
        const pv: Vec3 = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
        const det = dot(e1, pv);
        if (Math.abs(det) < 1e-12) continue;
        const tv: Vec3 = [o[0] - tris[t], o[1] - tris[t + 1], o[2] - tris[t + 2]];
        const u = dot(tv, pv) / det;
        if (u < 0 || u > 1) continue;
        const qv: Vec3 = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
        const v = dot(dir, qv) / det;
        if (v < 0 || u + v > 1) continue;
        const dist = dot(e2, qv) / det;
        if (dist < 0 || dist >= best) continue;
        best = dist;
        face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      }
      if (!face) {
        out.push({ a, b, offset: NaN, angle: NaN });
        continue;
      }
      const len = Math.hypot(...face);
      // The face normal on the side the ray came from.
      const c = Math.abs(dot(face, f.normal)) / len;
      out.push({ a, b, offset: 0.3 - best, angle: (Math.acos(Math.min(1, c)) * 180) / Math.PI });
    }
  }
  return out;
}

/** The marks a livery puts on the tunnel car that fail the probe: off the surface by more than `offset` metres, or on a face more than `angle` degrees off the projection axis. */
export function failures(d: DecalPlacement, tris: Float64Array, limits = { offset: 0.03, angle: 25 }) {
  return probe(d, tris).filter((s) => !(Math.abs(s.offset) <= limits.offset) || !(s.angle <= limits.angle));
}

