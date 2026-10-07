/**
 * Bakes a livery into a texture for one mesh of the car, for the AR export. The scan has no UVs and the
 * livery is a procedural shader, which the exporters cannot carry; this evaluates the same rules the
 * shader is generated from (`paintAt`, `decalHit` in livery-paint.ts) at every texel of a generated atlas
 * and gives the mesh the UVs to read it.
 *
 * Why a texture and not vertex colours: the body's triangles are 3.5 cm at the median and 13 cm at the
 * 90th percentile, against pinlines of 1 to 2 cm and wordmarks 15 cm tall, so a colour per vertex would
 * smear every hard edge and could not draw a logo at all.
 *
 * The UV layout is planar, per island: each triangle is assigned to one of six directions by its face
 * normal, triangles of one direction that share vertices form an island, each island is projected flat
 * along its direction and packed into the atlas with padding. Islands of different directions or that
 * do not touch never share a texel, so the top of a sidepod and the floor under it, which a livery
 * paints differently at the same x and z, stay apart. Vertices on an island boundary are duplicated.
 *
 * Each texel holds the colour at the surface point it covers, found by interpolating the triangle's
 * rest-pose positions, so the paint is where the shader puts it. Finish (roughness, metalness) cannot
 * ride in the texture through the engine's exporter, which carries one value per material: triangles are
 * grouped by the finish at their middle instead, for a material per finish.
 *
 * Pure (typed arrays in, typed arrays out; no three, no DOM), so it runs in a test and is written as a
 * generator that yields between slices of work, so the page can keep drawing while it runs.
 */
import { colourAt, decalHit, linearToSrgb, paintAt, srgbToLinear } from "./livery-paint";
import type { DecalPlacement, DecalTexture, FinishName, Livery, LiveryPart, Vec3 } from "./livery-spec";

/** The atlas resolution asked for, texels per metre of surface: 4 mm, so a 12 mm pinline is three texels wide. */
export const TEXELS_PER_METRE = 250;
/** The largest atlas side. A USDZ export shrinks any texture to 1024 (three's default), so a bigger one would be thrown away. */
export const MAX_ATLAS = 1024;
/** Texels of padding around each island, filled from its edge, so filtering and mipmaps do not read the gap. */
const PAD = 4;
/** A surface under another in an island by more than this, metres, is moved to an island of its own. */
const BURY = 0.01;
/** The grid, metres, the burial is checked on. */
const BURY_CELL = 0.004;
/** Work done between yields, in milliseconds. */
const SLICE_MS = 6;

export interface BakeMesh {
  part: LiveryPart;
  /** Local vertex positions and normals, xyz each. */
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  index: ArrayLike<number> | null;
  /** Column-major 4x4: local to the car's rest pose in metres (the frame of car-frame.ts), as the shader's `uRest`. */
  rest: ArrayLike<number>;
}

export interface DecalPixels {
  width: number;
  height: number;
  /** RGBA, row 0 at the top, straight (not premultiplied) alpha. */
  data: Uint8ClampedArray | Uint8Array;
}

export type DecalSet = Record<DecalTexture, DecalPixels | null>;

export interface BakedMesh {
  position: Float32Array;
  normal: Float32Array;
  /** Texture coordinates with (0, 0) at the atlas's top left, as glTF and three's GLTFLoader have them (a texture with flipY off). */
  uv: Float32Array;
  index: Uint32Array;
  /** Runs of `index` by finish, in order; together they cover it. */
  groups: { start: number; count: number; finish: FinishName }[];
  /** `size` x `size` RGBA8, sRGB, row 0 at the top. */
  atlas: { size: number; colour: Uint8Array };
}

/** Runs a bake to its end, for a caller that does not need to keep drawing. */
export function drain<T>(gen: Generator<void, T>): T {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** The inverse transpose of a column-major 4x4's upper 3x3, row-major: what carries a normal through the matrix. */
function normalMatrix(m: ArrayLike<number>): number[] {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  // The cofactor matrix over the determinant is the inverse transpose.
  return [A / det, B / det, C / det, (c * h - b * i) / det, (a * i - c * g) / det, (b * g - a * h) / det, (b * f - c * e) / det, (c * d - a * f) / det, (a * e - b * d) / det];
}

interface Island {
  layer: number;
  triangles: number[];
  /** Unique vertex ids of the island. */
  vertices: number[];
  /** Planar coordinates per vertex id, metres. */
  a: Map<number, number>;
  b: Map<number, number>;
  min: [number, number];
  size: [number, number];
  /** Top left of its padded rectangle in the atlas, texels, once packed. */
  x: number;
  y: number;
}

/** Shelf-packs rectangles into a size x size square; the x and y of each, or null if they do not fit. */
function pack(sizes: [number, number][], size: number): [number, number][] | null {
  const order = sizes.map((_, i) => i).sort((p, q) => sizes[q][1] - sizes[p][1]);
  const out: [number, number][] = new Array(sizes.length);
  let x = 0;
  let y = 0;
  let row = 0;
  for (const i of order) {
    const [w, h] = sizes[i];
    if (w > size || h > size) return null;
    if (x + w > size) {
      x = 0;
      y += row;
      row = 0;
    }
    if (y + h > size) return null;
    out[i] = [x, y];
    x += w;
    row = Math.max(row, h);
  }
  return out;
}

/** The smallest power-of-two atlas (up to MAX_ATLAS) the islands fit at the target resolution, else the biggest with the resolution lowered to fit. */
function layout(islands: Island[]): { size: number; scale: number } {
  const need = (scale: number) => islands.map((i): [number, number] => [Math.ceil(i.size[0] * scale) + 1 + 2 * PAD, Math.ceil(i.size[1] * scale) + 1 + 2 * PAD]);
  for (let size = 64; size <= MAX_ATLAS; size *= 2) {
    if (pack(need(TEXELS_PER_METRE), size)) return { size, scale: TEXELS_PER_METRE };
  }
  let scale = TEXELS_PER_METRE;
  while (!pack(need(scale), MAX_ATLAS) && scale > 10) scale *= 0.94;
  return { size: MAX_ATLAS, scale };
}

/** Bilinear read of a decal's pixels at (u, v) with v up; RGBA as 0..1. */
function sample(px: DecalPixels, u: number, v: number): [number, number, number, number] {
  const x = Math.min(px.width - 1, Math.max(0, u * px.width - 0.5));
  const y = Math.min(px.height - 1, Math.max(0, (1 - v) * px.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(px.width - 1, x0 + 1);
  const y1 = Math.min(px.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number, k: number) => px.data[(yy * px.width + xx) * 4 + k] / 255;
  return [0, 1, 2, 3].map((k) => at(x0, y0, k) * (1 - fx) * (1 - fy) + at(x1, y0, k) * fx * (1 - fy) + at(x0, y1, k) * (1 - fx) * fy + at(x1, y1, k) * fx * fy) as [number, number, number, number];
}

/** The colour (sRGB, 0..1) of one surface point: the paint, then the part's decals over it, mixed in linear light as the shader does. */
function shade(livery: Livery, part: LiveryPart, decals: readonly DecalPlacement[], pixels: DecalSet, p: Vec3, n: Vec3): [number, number, number] {
  const paint = paintAt(livery, part, p)!;
  let rgb: [number, number, number] | null = null;
  for (const d of decals) {
    const px = pixels[d.texture];
    if (!px) continue;
    const hit = decalHit(d, p, n);
    if (!hit) continue;
    const t = sample(px, hit.u, hit.v);
    // The monogram is a picture (its alpha is its shape); the wordmark is a mask, its shape in the red channel, filled with one colour.
    const m = d.texture === "mark" ? t[3] : t[0];
    if (m <= 0) continue;
    const fill = d.colour ? colourAt(livery, d.colour, p) : ([srgbToLinear(t[0]), srgbToLinear(t[1]), srgbToLinear(t[2])] as const);
    const base = rgb ?? (paint.colour.map(srgbToLinear) as [number, number, number]);
    rgb = base.map((c, k) => c + (fill[k] - c) * m) as [number, number, number];
  }
  return rgb ? (rgb.map(linearToSrgb) as [number, number, number]) : ([paint.colour[0], paint.colour[1], paint.colour[2]] as [number, number, number]);
}

/**
 * Bakes one mesh's paint. Yields between slices of work; returns null for a part the livery does not
 * paint. `decals` holds each logo's pixels (null leaves that logo out).
 */
export function* bakeMesh(mesh: BakeMesh, livery: Livery, decals: DecalSet, options: { decals?: readonly DecalPlacement[] } = {}): Generator<void, BakedMesh | null> {
  if (!livery.parts[mesh.part]) return null;
  const nV = mesh.positions.length / 3;
  const nT = (mesh.index ? mesh.index.length : nV) / 3;
  const vid = (t: number, k: number) => (mesh.index ? mesh.index[t * 3 + k] : t * 3 + k);
  const partDecals = (options.decals ?? livery.decals).filter((d) => d.part === mesh.part);

  // Rest-pose positions and normals.
  const m = mesh.rest;
  const nm = normalMatrix(m);
  const P = new Float64Array(nV * 3);
  const N = new Float64Array(nV * 3);
  for (let v = 0; v < nV; v++) {
    const [x, y, z] = [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
    P[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    P[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    P[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const [nx, ny, nz] = [mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]];
    const ax = nm[0] * nx + nm[1] * ny + nm[2] * nz;
    const ay = nm[3] * nx + nm[4] * ny + nm[5] * nz;
    const az = nm[6] * nx + nm[7] * ny + nm[8] * nz;
    const len = Math.hypot(ax, ay, az) || 1;
    N[v * 3] = ax / len;
    N[v * 3 + 1] = ay / len;
    N[v * 3 + 2] = az / len;
  }

  // Each triangle's direction, from its geometric normal: 0 to 5 is +x, -x, +y, -y, +z, -z.
  const layerOf = new Int8Array(nT);
  for (let t = 0; t < nT; t++) {
    const [a, b, c] = [vid(t, 0), vid(t, 1), vid(t, 2)];
    const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const w = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    let axis = 0;
    if (Math.abs(n[1]) > Math.abs(n[axis])) axis = 1;
    if (Math.abs(n[2]) > Math.abs(n[axis])) axis = 2;
    layerOf[t] = axis * 2 + (n[axis] < 0 ? 1 : 0);
  }

  // Islands: triangles of one direction that share a vertex.
  const parent = new Int32Array(nV);
  const find = (v: number): number => {
    while (parent[v] >= 0) {
      if (parent[parent[v]] >= 0) parent[v] = parent[parent[v]];
      v = parent[v];
    }
    return v;
  };
  /** The connected islands (by shared vertices) of a set of triangles that all face one direction. */
  const islandsOf = (tris: number[], layer: number): Island[] => {
    parent.fill(-1);
    for (const t of tris) {
      let r = find(vid(t, 0));
      for (let k = 1; k < 3; k++) {
        const s = find(vid(t, k));
        if (s !== r) parent[s] = r;
        r = find(r);
      }
    }
    const byRoot = new Map<number, Island>();
    const out: Island[] = [];
    const axis = layer >> 1;
    const [ua, ub] = [(axis + 1) % 3, (axis + 2) % 3];
    for (const t of tris) {
      const root = find(vid(t, 0));
      let isl = byRoot.get(root);
      if (!isl) {
        isl = { layer, triangles: [], vertices: [], a: new Map(), b: new Map(), min: [Infinity, Infinity], size: [0, 0], x: 0, y: 0 };
        byRoot.set(root, isl);
        out.push(isl);
      }
      isl.triangles.push(t);
      for (let k = 0; k < 3; k++) {
        const v = vid(t, k);
        if (isl.a.has(v)) continue;
        isl.vertices.push(v);
        isl.a.set(v, P[v * 3 + ua]);
        isl.b.set(v, P[v * 3 + ub]);
      }
    }
    for (const isl of out) {
      let [a0, b0, a1, b1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const a of isl.a.values()) {
        if (a < a0) a0 = a;
        if (a > a1) a1 = a;
      }
      for (const b of isl.b.values()) {
        if (b < b0) b0 = b;
        if (b > b1) b1 = b;
      }
      isl.min = [a0, b0];
      isl.size = [a1 - a0, b1 - b0];
    }
    return out;
  };

  /**
   * The triangles of an island that are buried: another surface of the same island lies over them in the
   * projection (a halo over the chassis top, say), by more than BURY metres, so the two would want the
   * same texels. Checked on a coarse grid; a triangle is buried if a tenth of the cells it covers are (two at least), since a surface lying partly under another would clash with it along that edge.
   */
  const buried = (isl: Island): number[] => {
    const axis = isl.layer >> 1;
    const sign = isl.layer & 1 ? -1 : 1;
    const cols = Math.ceil(isl.size[0] / BURY_CELL) + 2;
    const rows = Math.ceil(isl.size[1] / BURY_CELL) + 2;
    if (cols * rows > 4e6) return [];
    const top = new Float32Array(cols * rows).fill(-Infinity);
    const cover = (t: number, visit: (cell: number, depth: number) => void) => {
      const v = [vid(t, 0), vid(t, 1), vid(t, 2)];
      const [xs, ys, ds] = [v.map((i) => ((isl.a.get(i) as number) - isl.min[0]) / BURY_CELL), v.map((i) => ((isl.b.get(i) as number) - isl.min[1]) / BURY_CELL), v.map((i) => sign * P[i * 3 + axis])];
      const det = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
      const cx = (xs[0] + xs[1] + xs[2]) / 3;
      const cy = (ys[0] + ys[1] + ys[2]) / 3;
      visit(Math.floor(cy) * cols + Math.floor(cx), (ds[0] + ds[1] + ds[2]) / 3);
      if (Math.abs(det) < 1e-12) return;
      for (let j = Math.floor(Math.min(...ys)); j <= Math.ceil(Math.max(...ys)); j++) {
        for (let i = Math.floor(Math.min(...xs)); i <= Math.ceil(Math.max(...xs)); i++) {
          const [x, y] = [i + 0.5, j + 0.5];
          const w0 = ((ys[1] - ys[2]) * (x - xs[2]) + (xs[2] - xs[1]) * (y - ys[2])) / det;
          const w1 = ((ys[2] - ys[0]) * (x - xs[2]) + (xs[0] - xs[2]) * (y - ys[2])) / det;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          visit(j * cols + i, w0 * ds[0] + w1 * ds[1] + w2 * ds[2]);
        }
      }
    };
    for (const t of isl.triangles) cover(t, (cell, d) => void (d > top[cell] && (top[cell] = d)));
    const out: number[] = [];
    for (const t of isl.triangles) {
      let total = 0;
      let under = 0;
      cover(t, (cell, d) => {
        total++;
        if (top[cell] - d > BURY) under++;
      });
      if (under >= Math.max(2, total * 0.1)) out.push(t);
    }
    return out;
  };

  const islands: Island[] = [];
  for (let layer = 0; layer < 6; layer++) {
    const tris: number[] = [];
    for (let t = 0; t < nT; t++) if (layerOf[t] === layer) tris.push(t);
    const queue = islandsOf(tris, layer);
    // Surfaces that lie over one another in an island are separated into islands of their own, until none do.
    for (let round = 0; queue.length; ) {
      const isl = queue.shift()!;
      const under = round < 64 ? buried(isl) : [];
      if (under.length && under.length < isl.triangles.length) {
        const gone = new Set(under);
        queue.push(...islandsOf(isl.triangles.filter((t) => !gone.has(t)), layer), ...islandsOf(under, layer));
        round++;
      } else islands.push(isl);
      yield;
    }
  }
  yield;

  // Pack them.
  const { size, scale } = layout(islands);
  const slots = pack(islands.map((i): [number, number] => [Math.ceil(i.size[0] * scale) + 1 + 2 * PAD, Math.ceil(i.size[1] * scale) + 1 + 2 * PAD]), size)!;
  islands.forEach((isl, i) => {
    isl.x = slots[i][0];
    isl.y = slots[i][1];
  });
  const texX = (isl: Island, v: number) => isl.x + PAD + 0.5 + ((isl.a.get(v) as number) - isl.min[0]) * scale;
  const texY = (isl: Island, v: number) => isl.y + PAD + 0.5 + ((isl.b.get(v) as number) - isl.min[1]) * scale;

  // Rasterise every island: each texel centre inside a triangle takes the colour at its surface point.
  const colour = new Uint8Array(size * size * 4);
  const covered = new Uint8Array(size * size);
  let clock = now();
  const p: [number, number, number] = [0, 0, 0];
  const n: [number, number, number] = [0, 0, 1];
  for (const isl of islands) {
    for (const t of isl.triangles) {
      const [v0, v1, v2] = [vid(t, 0), vid(t, 1), vid(t, 2)];
      const [x0, y0, x1, y1, x2, y2] = [texX(isl, v0), texY(isl, v0), texX(isl, v1), texY(isl, v1), texX(isl, v2), texY(isl, v2)];
      const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      /** Paints texel (i, j) with the colour at the surface point of barycentric weights w. */
      const put = (i: number, j: number, w0: number, w1: number, w2: number) => {
        for (let k = 0; k < 3; k++) {
          p[k] = w0 * P[v0 * 3 + k] + w1 * P[v1 * 3 + k] + w2 * P[v2 * 3 + k];
          n[k] = w0 * N[v0 * 3 + k] + w1 * N[v1 * 3 + k] + w2 * N[v2 * 3 + k];
        }
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        n[0] /= len;
        n[1] /= len;
        n[2] /= len;
        const c = shade(livery, mesh.part, partDecals, decals, p, n);
        const at = (j * size + i) * 4;
        colour[at] = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
        colour[at + 1] = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
        colour[at + 2] = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
        colour[at + 3] = 255;
        covered[j * size + i] = 1;
      };
      let stamped = 0;
      if (Math.abs(det) > 1e-9) {
        const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
        const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)));
        const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
        const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));
        for (let j = minY; j <= maxY; j++) {
          for (let i = minX; i <= maxX; i++) {
            const cx = i + 0.5;
            const cy = j + 0.5;
            const w0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / det;
            const w1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / det;
            const w2 = 1 - w0 - w1;
            if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
            put(i, j, w0, w1, w2);
            stamped++;
          }
        }
      }
      // A sliver or a speck that holds no texel centre still owns the texel under its middle, so its uvs read paint, not the empty fill.
      if (!stamped) {
        const [i, j] = [Math.min(size - 1, Math.max(0, Math.floor((x0 + x1 + x2) / 3))), Math.min(size - 1, Math.max(0, Math.floor((y0 + y1 + y2) / 3)))];
        if (!covered[j * size + i]) put(i, j, 1 / 3, 1 / 3, 1 / 3);
      }
      if (now() - clock > SLICE_MS) {
        yield;
        clock = now();
      }
    }
    yield;
    clock = now();
  }

  // Padding: grow each island's edge texels outward, so a filtered read at the edge finds paint.
  for (let pass = 0; pass < PAD; pass++) {
    const fresh: number[] = [];
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        if (covered[j * size + i]) continue;
        let src = -1;
        for (let dj = -1; dj <= 1 && src < 0; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= size || jj >= size || !covered[jj * size + ii]) continue;
            src = jj * size + ii;
            break;
          }
        }
        if (src >= 0) fresh.push(j * size + i, src);
      }
    }
    for (let f = 0; f < fresh.length; f += 2) {
      const [to, from] = [fresh[f] * 4, fresh[f + 1] * 4];
      colour[to] = colour[from];
      colour[to + 1] = colour[from + 1];
      colour[to + 2] = colour[from + 2];
      colour[to + 3] = 255;
    }
    for (let f = 0; f < fresh.length; f += 2) covered[fresh[f]] = 1;
    yield;
  }
  // What no island reaches is an opaque neutral, so the image is one flat run there and compresses to nothing.
  for (let q = 0; q < size * size; q++) {
    if (covered[q]) continue;
    colour[q * 4] = colour[q * 4 + 1] = colour[q * 4 + 2] = 48;
    colour[q * 4 + 3] = 255;
  }

  // The geometry: a vertex per island and original vertex, triangles ordered by the finish at their middle.
  const finishOf = new Array<FinishName>(nT);
  const mid: [number, number, number] = [0, 0, 0];
  for (let t = 0; t < nT; t++) {
    for (let k = 0; k < 3; k++) mid[k] = (P[vid(t, 0) * 3 + k] + P[vid(t, 1) * 3 + k] + P[vid(t, 2) * 3 + k]) / 3;
    finishOf[t] = paintAt(livery, mesh.part, mid)!.finishName;
  }
  const order = [...new Set(finishOf)];
  const islandOfTriangle = new Int32Array(nT);
  islands.forEach((isl, i) => isl.triangles.forEach((t) => (islandOfTriangle[t] = i)));
  const remap = new Map<number, number>();
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const groups: BakedMesh["groups"] = [];
  for (const finish of order) {
    const start = index.length;
    for (let t = 0; t < nT; t++) {
      if (finishOf[t] !== finish) continue;
      const isl = islands[islandOfTriangle[t]];
      const ii = islandOfTriangle[t];
      for (let k = 0; k < 3; k++) {
        const v = vid(t, k);
        const key = ii * nV + v;
        let nvid = remap.get(key);
        if (nvid === undefined) {
          nvid = position.length / 3;
          remap.set(key, nvid);
          position.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
          normal.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
          uv.push(texX(isl, v) / size, texY(isl, v) / size);
        }
        index.push(nvid);
      }
    }
    groups.push({ start, count: index.length - start, finish });
  }
  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    uv: new Float32Array(uv),
    index: new Uint32Array(index),
    groups,
    atlas: { size, colour },
  };
}
