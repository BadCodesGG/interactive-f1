/**
 * Registers the wind tunnel's car (public/models/f1-2026.*.glb, a different scan of a 2026 car) onto the
 * Formula F226's frame (src/models/f1/car-frame.ts) and writes src/models/f1/tunnel-frame.ts.
 *
 * The livery rules are functions of a rest-pose position in the F226's metres, so the tunnel car is
 * painted by sending each of its rest positions through one per-axis affine map (scale and offset on x,
 * y, z; z mirrored about the centreline) into that frame. The map is fitted, not guessed: it minimises
 * the trimmed chamfer distance between points sampled over the tunnel car's bodywork and wings and
 * points sampled over the F226's painted parts (BodyLivery, the wings and their endplates), so the
 * nose, the halo, the sidepod flank, the fin and the wings all land within the reported residual of
 * the place they have on the F226. Trimmed, because the tunnel car carries fences and pylons the F226
 * does not: the worst 25 percent of each direction is ignored.
 *
 * Run after `npm run models` or `npm run car`: `node scripts/measure-tunnel-frame.mjs`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { ROOT } from "./lib/dev-server.mjs";

const OUT = path.join(ROOT, "src", "models", "f1", "tunnel-frame.ts");
const F226 = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "f1.sidecar.json"), "utf8")).model;
const TUNNEL = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "f1-tunnel.json"), "utf8")).model;
const SAMPLES = 15000;
const CELL = 0.06;
const TRIM = 0.75;

// The tunnel nodes that carry the livery, and the F226 materials they correspond to.
const TUNNEL_NODES = new Set(["chassis", "left-sidepod", "right-sidepod", "engine-cover", "halo", "front-wing", "rear-wing"]);
const F226_MATERIALS = new Set(["BodyLivery", "FrontWingLivery", "FrontEndplateLivery", "RearWingLivery", "RearEndplateLivery"]);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

/** Triangles in world space (metres) of every primitive `pick(nodeName, parentName, materialName)` accepts. */
async function triangles(file, pick) {
  const doc = await io.read(path.join(ROOT, "public", file));
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const parent = node.getParentNode()?.getName() ?? node.getName();
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (!pick(parent, prim.getMaterial()?.getName())) continue;
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const world = [];
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        world.push([0, 1, 2].map((a) => m[a] * v[0] + m[4 + a] * v[1] + m[8 + a] * v[2] + m[12 + a]));
      }
      const count = idx ? idx.getCount() : pos.getCount();
      for (let i = 0; i < count; i += 3) out.push([0, 1, 2].map((k) => world[idx ? idx.getScalar(i + k) : i + k]));
    }
  }
  return out;
}

/** A small deterministic generator, so a rerun measures the same numbers. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** `count` points spread over the triangles in proportion to their areas. */
function sample(tris, count, rand) {
  const areas = tris.map(([a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
  });
  const cdf = [];
  areas.reduce((s, a, i) => (cdf[i] = s + a), 0);
  const total = cdf[cdf.length - 1];
  const pts = [];
  for (let n = 0; n < count; n++) {
    const target = rand() * total;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const [a, b, c] = tris[lo];
    let r1 = rand();
    let r2 = rand();
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    pts.push([0, 1, 2].map((k) => a[k] + r1 * (b[k] - a[k]) + r2 * (c[k] - a[k])));
  }
  return pts;
}

/** A uniform grid over points: nearest-neighbour distance by searching growing shells of cells. */
function grid(pts) {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (const p of pts) {
    const k = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), Math.floor(p[2] / CELL));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(p);
  }
  return (q, limit = 0.12) => {
    const cx = Math.floor(q[0] / CELL);
    const cy = Math.floor(q[1] / CELL);
    const cz = Math.floor(q[2] / CELL);
    let best = limit * limit;
    const reach = Math.ceil(limit / CELL);
    for (let dx = -reach; dx <= reach; dx++)
      for (let dy = -reach; dy <= reach; dy++)
        for (let dz = -reach; dz <= reach; dz++) {
          const list = cells.get(key(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const p of list) {
            const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
            if (d < best) best = d;
          }
        }
    return Math.sqrt(best);
  };
}

const rand = rng(226);
const tunnelPts = sample(await triangles(TUNNEL, (parent) => TUNNEL_NODES.has(parent)), SAMPLES, rand);
const f226Pts = sample(await triangles(F226, (_p, mat) => F226_MATERIALS.has(mat)), SAMPLES, rand);
const nearF226 = grid(f226Pts);
// The transformed tunnel points move, so the reverse direction needs the tunnel cloud indexed per candidate:
// instead it samples fewer points and brute-forces against the mapped tunnel grid rebuilt per evaluation.
const reverseSample = f226Pts.filter((_, i) => i % 3 === 0);

const apply = (p, x) => [x[0] * p[0] + x[1], x[2] * p[1] + x[3], x[4] * p[2]];
const trimmed = (ds) => {
  ds.sort((a, b) => a - b);
  const n = Math.floor(ds.length * TRIM);
  return ds.slice(0, n).reduce((s, d) => s + d, 0) / n;
};
function cost(x) {
  const mapped = tunnelPts.map((p) => apply(p, x));
  const forward = trimmed(mapped.map((p) => nearF226(p)));
  const nearMapped = grid(mapped);
  const reverse = trimmed(reverseSample.map((p) => nearMapped(p)));
  return forward + reverse;
}

/** Nelder-Mead over [sx, tx, sy, ty, sz]. */
function minimise(start, steps) {
  const n = start.length;
  let simplex = [start, ...start.map((_, i) => start.map((v, j) => (i === j ? v + steps[i] : v)))].map((x) => ({ x, f: cost(x) }));
  for (let iter = 0; iter < 140; iter++) {
    simplex.sort((a, b) => a.f - b.f);
    const centroid = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((s, v) => s + v.x[j], 0) / n);
    const worst = simplex[n];
    const at = (t) => centroid.map((c, j) => c + t * (worst.x[j] - c));
    const reflected = at(-1);
    const fr = cost(reflected);
    if (fr < simplex[0].f) {
      const expanded = at(-2);
      const fe = cost(expanded);
      simplex[n] = fe < fr ? { x: expanded, f: fe } : { x: reflected, f: fr };
    } else if (fr < simplex[n - 1].f) simplex[n] = { x: reflected, f: fr };
    else {
      const contracted = at(fr < worst.f ? -0.5 : 0.5);
      const fc = cost(contracted);
      if (fc < Math.min(fr, worst.f)) simplex[n] = { x: contracted, f: fc };
      else simplex = simplex.map((v, i) => (i === 0 ? v : { x: v.x.map((c, j) => simplex[0].x[j] + 0.5 * (c - simplex[0].x[j])), f: NaN })).map((v) => (Number.isNaN(v.f) ? { ...v, f: cost(v.x) } : v));
    }
  }
  simplex.sort((a, b) => a.f - b.f);
  return simplex[0];
}

const identity = [1, 0, 1, 0, 1];
console.log(`identity cost ${cost(identity).toFixed(4)}`);
const fit = minimise(identity, [0.02, 0.05, 0.02, 0.05, 0.02]);
const x = fit.x;
const round = (v) => Math.round(v * 1e4) / 1e4;

// Residual of the final map: the trimmed mean and the 90th percentile of tunnel-to-F226 distance, in cm.
const ds = tunnelPts.map((p) => nearF226(apply(p, x)) * 100).sort((a, b) => a - b);
const keep = ds.slice(0, Math.floor(ds.length * TRIM));
const frame = {
  model: TUNNEL.split("/").pop(),
  reference: F226.split("/").pop(),
  scale: [round(x[0]), round(x[2]), round(x[4])],
  offset: [round(x[1]), round(x[3]), 0],
  residualCm: { mean: Math.round((keep.reduce((s, d) => s + d, 0) / keep.length) * 100) / 100, p90: Math.round(keep[Math.floor(keep.length * 0.9)] * 100) / 100 },
};

const text = `/**
 * Where the wind tunnel's car sits in the Formula F226's frame (src/models/f1/car-frame.ts). Generated by
 * scripts/measure-tunnel-frame.mjs from public/models/${frame.model} and public/models/${frame.reference}: do not
 * edit by hand, rerun the script after \`npm run models\` or \`npm run car\`.
 *
 * A point of the tunnel car, (x, y, z) in its rest pose in metres, is at
 * (scale[0] * x + offset[0], scale[1] * y + offset[1], scale[2] * z + offset[2]) in the F226's frame, which is
 * the frame the livery rules are written in. The fit is over the bodywork and wings (trimmed chamfer
 * distance); \`residualCm\` is the tunnel car's own distance from the F226's painted surfaces after the map.
 */
export const TUNNEL_FRAME = ${JSON.stringify(frame, null, 2).replace(/\[\s*([^\]]*?)\s*\]/g, (_, body) => `[${body.replace(/\s+/g, " ")}]`).replace(/"([A-Za-z_]\w*)":/g, "$1:")} as const;
`;
writeFileSync(OUT, text);
console.log(`identity residual: ${(cost(identity) * 100).toFixed(2)}; fitted ${JSON.stringify(frame.scale)} + ${JSON.stringify(frame.offset)}; residual ${JSON.stringify(frame.residualCm)} cm`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
