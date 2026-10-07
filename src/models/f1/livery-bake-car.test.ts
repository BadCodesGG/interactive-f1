import { describe, expect, it } from "vitest";
import { bakeMesh, drain, MAX_ATLAS, type BakeMesh } from "./livery-bake";
import { LIVERIES, LIVERY_IDS } from "./liveries";
import { carMeshes } from "./livery-bake-fixture";
import { paintAt, toHex } from "./livery-paint";

type Vec3 = [number, number, number];

const restPoint = (m: BakeMesh, local: Vec3): Vec3 => {
  const r = m.rest;
  return [r[0] * local[0] + r[4] * local[1] + r[8] * local[2] + r[12], r[1] * local[0] + r[5] * local[1] + r[9] * local[2] + r[13], r[2] * local[0] + r[6] * local[1] + r[10] * local[2] + r[14]];
};

describe("the bake on the real car", () => {
  it("reproduces paintAt on the body's own surface, for every livery, at sampled points away from a paint edge; and stays inside the atlas and the file budget", async () => {
    const meshes = await carMeshes();
    const body = meshes.find((m) => m.part === "body")!;
    expect(body.positions.length / 3).toBeGreaterThan(5000);
    for (const id of LIVERY_IDS) {
      const livery = LIVERIES[id];
      const started = performance.now();
      const baked = drain(bakeMesh(body, livery, { mark: null, wordmark: null }, { decals: [] }))!;
      const ms = Math.round(performance.now() - started);
      // The body bakes in well under a second; a regression to something slow is a finding.
      expect(ms, `${id} bake time`).toBeLessThan(15000);
      expect(baked!.atlas.size).toBeLessThanOrEqual(MAX_ATLAS);
      expect(baked.index.length).toBe(body.index!.length);

      // Random points on the surface: a triangle of the baked mesh, barycentric weights from a fixed sequence.
      let checked = 0;
      for (let s = 0; s < 4000 && checked < 400; s++) {
        const t = Math.floor(((s * 0.6180339887) % 1) * (baked.index.length / 3));
        let w0 = (s * 0.7548776662) % 1;
        let w1 = (s * 0.5698402909) % 1;
        if (w0 + w1 > 1) [w0, w1] = [1 - w0, 1 - w1];
        const w = [w0, w1, 1 - w0 - w1];
        const local: Vec3 = [0, 0, 0];
        let u = 0;
        let v = 0;
        for (let k = 0; k < 3; k++) {
          const vi = baked.index[t * 3 + k];
          for (let a = 0; a < 3; a++) local[a] += w[k] * baked.position[vi * 3 + a];
          u += w[k] * baked.uv[vi * 2];
          v += w[k] * baked.uv[vi * 2 + 1];
        }
        const p = restPoint(body, local);
        const want = toHex(paintAt(livery, "body", p)!.colour);
        // A texel spans about 4 mm: skip a point with a different colour within 8 mm of it in any axis direction.
        const steady = [[0.008, 0, 0], [-0.008, 0, 0], [0, 0.008, 0], [0, -0.008, 0], [0, 0, 0.008], [0, 0, -0.008]].every((d) => toHex(paintAt(livery, "body", [p[0] + d[0], p[1] + d[1], p[2] + d[2]])!.colour) === want);
        if (!steady) continue;
        const x = Math.min(baked.atlas.size - 1, Math.floor(u * baked.atlas.size));
        const y = Math.min(baked.atlas.size - 1, Math.floor(v * baked.atlas.size));
        const at = (y * baked.atlas.size + x) * 4;
        const got = toHex([baked.atlas.colour[at] / 255, baked.atlas.colour[at + 1] / 255, baked.atlas.colour[at + 2] / 255]);
        expect(got, `${id} triangle ${t} point ${p.map((c) => c.toFixed(3))}`).toBe(want);
        checked++;
      }
      expect(checked, id).toBeGreaterThan(300);
    }
  }, 600000);
});
