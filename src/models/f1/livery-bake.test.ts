import { describe, expect, it } from "vitest";
import { bakeMesh, drain, TEXELS_PER_METRE, type BakedMesh, type BakeMesh, type DecalPixels } from "./livery-bake";
import { decalHit, paintAt, toHex } from "./livery-paint";
import type { Livery } from "./livery-spec";

type Vec3 = [number, number, number];

/** A livery with a red stripe along the centreline on a dark body; the top of the box is one finish, the rest another. */
const LIV: Livery = {
  id: "t",
  name: "T",
  palette: { ink: "#101820", red: "#e02020", blue: "#2050e0", white: "#ffffff" },
  parts: {
    body: {
      colour: "ink",
      finish: "matte",
      layers: [
        { colour: "red", finish: "gloss", region: { kind: "centre", from: -10, to: 10, half: 0.1 } },
        { colour: "blue", region: { kind: "box", min: [-10, -10, -10], max: [10, 0.05, 10] } },
      ],
    },
  },
  decals: [],
};

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A flat quad in the xz plane at height y, facing up: x from -1 to 1, z from -0.5 to 0.5. */
function quad(y = 0.3): BakeMesh {
  return {
    part: "body",
    rest: IDENTITY,
    positions: new Float32Array([-1, y, -0.5, 1, y, -0.5, 1, y, 0.5, -1, y, 0.5]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    index: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

/** A closed box 1.2 x 0.4 x 0.6 with its own vertices per face, so every face has its normal. */
function box(): BakeMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  const [hx, hy, hz] = [0.6, 0.2, 0.3];
  const faces: { n: Vec3; u: Vec3; v: Vec3 }[] = [
    { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  ];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(...[0, 1, 2].map((k) => [hx, hy, hz][k] * (f.n[k] + a * f.u[k] + b * f.v[k])));
      normals.push(...f.n);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { part: "body", rest: IDENTITY, positions: new Float32Array(positions), normals: new Float32Array(normals), index: new Uint32Array(index) };
}

/** The colour the atlas holds at a uv, as #rrggbb. */
function texel(atlas: { size: number; colour: Uint8Array }, u: number, v: number): string {
  const x = Math.min(atlas.size - 1, Math.floor(u * atlas.size));
  const y = Math.min(atlas.size - 1, Math.floor(v * atlas.size));
  const at = (y * atlas.size + x) * 4;
  return toHex([atlas.colour[at] / 255, atlas.colour[at + 1] / 255, atlas.colour[at + 2] / 255]);
}

/** Where a surface point lands in the baked mesh's uv: the triangle of the baked geometry that holds it, by barycentric weights over positions. */
function uvOf(baked: BakedMesh, p: Vec3): [number, number] | null {
  const P = baked.position;
  const at = (i: number): Vec3 => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  for (let t = 0; t < baked.index.length; t += 3) {
    const [a, b, c] = [at(baked.index[t]), at(baked.index[t + 1]), at(baked.index[t + 2])];
    const n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(...n);
    if (len < 1e-9) continue;
    const q = sub(p, a);
    if (Math.abs(dot(q, n) / len) > 1e-4) continue;
    const w1 = dot(cross(q, sub(c, a)), n) / (len * len);
    const w2 = dot(cross(sub(b, a), q), n) / (len * len);
    const w0 = 1 - w1 - w2;
    if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
    const uv = (i: number, k: number) => baked.uv[baked.index[t + i] * 2 + k];
    return [0, 1].map((k) => w0 * uv(0, k) + w1 * uv(1, k) + w2 * uv(2, k)) as [number, number];
  }
  return null;
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const NO_DECALS = { mark: null, wordmark: null };

describe("bakeMesh", () => {
  it("paints the atlas as the evaluator does: a texel at any surface point holds paintAt's colour there", () => {
    const mesh = quad();
    const baked = drain(bakeMesh(mesh, LIV, NO_DECALS))!;
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const p: Vec3 = [-0.98 + 1.96 * ((i * 0.6180339) % 1), 0.3, -0.48 + 0.96 * ((i * 0.7548776) % 1)];
      // Skip points near a stripe edge, where a texel straddles two colours.
      if (Math.abs(Math.abs(p[2]) - 0.1) < 1.5 / TEXELS_PER_METRE) continue;
      const uv = uvOf(baked, p)!;
      expect(uv, `point ${p}`).not.toBeNull();
      expect(texel(baked.atlas, uv[0], uv[1]), `point ${p}`).toBe(toHex(paintAt(LIV, "body", p)!.colour));
      checked++;
    }
    expect(checked).toBeGreaterThan(250);
  });

  it("keeps the geometry: every original vertex position is still there, the triangles still span the same surface, and the uvs are in the atlas", () => {
    const mesh = box();
    const baked = drain(bakeMesh(mesh, LIV, NO_DECALS))!;
    const area = (pos: ArrayLike<number>, idx: ArrayLike<number>) => {
      let s = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const at = (i: number): Vec3 => [pos[idx[t + i] * 3], pos[idx[t + i] * 3 + 1], pos[idx[t + i] * 3 + 2]];
        s += 0.5 * Math.hypot(...cross(sub(at(1), at(0)), sub(at(2), at(0))));
      }
      return s;
    };
    expect(baked.index.length).toBe(mesh.index!.length);
    expect(area(baked.position, baked.index)).toBeCloseTo(area(mesh.positions, mesh.index!), 5);
    const original = new Set<string>();
    for (let i = 0; i < mesh.positions.length; i += 3) original.add(`${mesh.positions[i]},${mesh.positions[i + 1]},${mesh.positions[i + 2]}`);
    for (let i = 0; i < baked.position.length; i += 3) expect(original.has(`${baked.position[i]},${baked.position[i + 1]},${baked.position[i + 2]}`)).toBe(true);
    expect(baked.normal.length).toBe(baked.position.length);
    expect(baked.uv.length / 2).toBe(baked.position.length / 3);
    for (const c of baked.uv) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("gives every face of a closed box its own texels, so the top and the bottom, which a livery may paint differently, never share one", () => {
    const mesh = box();
    const baked = drain(bakeMesh(mesh, LIV, NO_DECALS))!;
    // The livery is blue below y 0.05 and ink above: the top face (y 0.2) ink, the bottom (y -0.2) blue, at the same x and z.
    const at = (p: Vec3) => texel(baked.atlas, ...uvOf(baked, p)!);
    const top = at([0.3, 0.2, 0.2]);
    const bottom = at([0.3, -0.2, 0.2]);
    expect(top).toBe(toHex(paintAt(LIV, "body", [0.3, 0.2, 0.2])!.colour));
    expect(bottom).toBe(toHex(paintAt(LIV, "body", [0.3, -0.2, 0.2])!.colour));
    expect(top).not.toBe(bottom);
    // And the flanks, both sides, and the ends.
    for (const p of [[0.6, 0.0, 0.1], [-0.6, 0.1, -0.1], [0.2, 0.1, 0.3], [0.2, 0.1, -0.3]] as Vec3[]) {
      const uv = uvOf(baked, p);
      expect(uv, `${p}`).not.toBeNull();
      if (Math.abs(Math.abs(p[2]) - 0.1) > 0.02) expect(texel(baked.atlas, ...uv!), `${p}`).toBe(toHex(paintAt(LIV, "body", p)!.colour));
    }
  });

  it("uses the rest matrix, not the local positions: a mesh whose geometry sits elsewhere is painted where the car's rest pose puts it", () => {
    const mesh = quad(0);
    // Local y 0 is rest y 0.3: the stripe and the colours are read at the rest position.
    const shifted: BakeMesh = { ...mesh, rest: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.3, 0, 1] };
    const baked = drain(bakeMesh(shifted, LIV, NO_DECALS))!;
    const uv = uvOf(baked, [0.4, 0, 0.05])!;
    expect(texel(baked.atlas, ...uv)).toBe(toHex(paintAt(LIV, "body", [0.4, 0.3, 0.05])!.colour));
    // The positions stay local: the geometry the exporter writes is the mesh's own.
    expect(baked.position[1]).toBe(0);
  });

  it("puts the decals in: a texel where the artwork is holds the artwork's colour, oriented as decalHit says", () => {
    // An asymmetric mask: the left half of the artwork, top to bottom, opaque.
    const w = 16;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) data.set([255, 255, 255, 255], (y * w + x) * 4);
    const decals = { mark: { width: w, height: h, data } satisfies DecalPixels, wordmark: { width: w, height: h, data } satisfies DecalPixels };
    const placed: Livery = {
      ...LIV,
      decals: [{ id: "d", texture: "wordmark", part: "body", centre: [0.2, 0.3, 0], normal: [0, 1, 0], up: [-1, 0, 0], size: [0.5, 0.25], depth: 0.05, colour: "white", facing: 0.3 }],
    };
    const baked = drain(bakeMesh(quad(), placed, decals))!;
    let inside = 0;
    let outside = 0;
    for (let i = 0; i < 400; i++) {
      const p: Vec3 = [-0.98 + 1.96 * ((i * 0.6180339) % 1), 0.3, -0.48 + 0.96 * ((i * 0.7548776) % 1)];
      if (Math.abs(Math.abs(p[2]) - 0.1) < 2 / TEXELS_PER_METRE) continue;
      const hit = decalHit(placed.decals[0], p, [0, 1, 0]);
      // Near the artwork's own edges (its mask or the clip box) a texel straddles; only clear cases are compared.
      const clear = hit && hit.u > 0.04 && hit.u < 0.46 - 0.0 ? true : hit && hit.u > 0.54 && hit.u < 0.96 ? true : false;
      if (hit && !clear) continue;
      const want = hit && hit.u < 0.5 ? "#ffffff" : toHex(paintAt(LIV, "body", p)!.colour);
      const got = texel(baked.atlas, ...uvOf(baked, p)!);
      expect(got, `point ${p}`).toBe(want);
      if (hit) inside++;
      else outside++;
    }
    expect(inside).toBeGreaterThan(20);
    expect(outside).toBeGreaterThan(20);
  });

  it("groups a mesh's triangles by the finish at their middle, so a material per finish can carry what a texture cannot", () => {
    const baked = drain(bakeMesh(quad(), LIV, NO_DECALS))!;
    // The centre stripe (|z| under 0.1) is gloss on matte: the triangles are big, so the quad is one finish or two by its middle.
    const covered = baked.groups.reduce((n, g) => n + g.count, 0);
    expect(covered).toBe(baked.index.length);
    expect(baked.groups.every((g) => g.count > 0)).toBe(true);
    expect(new Set(baked.groups.map((g) => g.finish)).size).toBe(baked.groups.length);
    for (const g of baked.groups) {
      for (let t = g.start; t < g.start + g.count; t += 3) {
        const c = [0, 1, 2].map((k) => [0, 1, 2].reduce((s, i) => s + baked.position[baked.index[t + i] * 3 + k], 0) / 3) as Vec3;
        expect(paintAt(LIV, "body", c)!.finishName, `triangle ${t / 3}`).toBe(g.finish);
      }
    }
  });

  it("pads every island, so a bilinear read at its edge does not pick up an empty texel: the texels just outside a triangle repeat the colour at its edge", () => {
    const mesh = quad();
    const baked = drain(bakeMesh(mesh, LIV, NO_DECALS))!;
    // The quad's far edge in x: a point just past it, in uv, is the colour of the edge.
    const inside = uvOf(baked, [0.99, 0.3, 0.4])!;
    const past = [inside[0] + 2 / baked.atlas.size, inside[1]] as [number, number];
    expect(texel(baked.atlas, ...past)).toBe(texel(baked.atlas, ...inside));
  });

  it("sizes the atlas to the mesh: a power of two between 64 and 1024, at the target resolution when it fits", () => {
    const small = drain(bakeMesh(quad(), LIV, NO_DECALS))!;
    expect([64, 128, 256, 512, 1024]).toContain(small.atlas.size);
    expect(small.atlas.colour.length).toBe(small.atlas.size ** 2 * 4);
    // The quad is 2 m x 1 m: at the target it needs about 2 * TEXELS_PER_METRE px each way, plus padding.
    expect(small.atlas.size).toBeGreaterThanOrEqual(2 * TEXELS_PER_METRE);
    expect(small.atlas.size).toBeLessThanOrEqual(1024);
  });

  it("reports a part the livery does not paint as nothing to bake", () => {
    const none: Livery = { ...LIV, parts: {} };
    expect(drain(bakeMesh(quad(), none, NO_DECALS))).toBeNull();
  });

  it("can be run in slices: the generator yields while it works and returns the same bake", () => {
    const gen = bakeMesh(quad(), LIV, NO_DECALS);
    let yields = 0;
    let r = gen.next();
    while (!r.done) {
      yields++;
      r = gen.next();
    }
    expect(yields).toBeGreaterThan(0);
    const direct = drain(bakeMesh(quad(), LIV, NO_DECALS))!;
    expect(Buffer.from(r.value!.atlas.colour).equals(Buffer.from(direct.atlas.colour))).toBe(true);
  });
});
