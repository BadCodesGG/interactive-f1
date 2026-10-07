import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { decalHit } from "./livery-paint";
import { LIVERIES, LIVERY_IDS } from "./liveries";
import { TUNNEL_FRAME } from "./tunnel-frame";
import { failures, tunnelSurface } from "./tunnel-probe";
import { tunnelDecals } from "./tunnel-livery";

type Vec3 = readonly [number, number, number];
interface Vertex {
  p: Vec3;
  n: Vec3;
}

/** The world-space vertices and normals (metres) of the primitives `pick(parentNodeName, materialName)` accepts. */
async function vertices(file: string, pick: (parent: string, material: string | undefined) => boolean): Promise<Vertex[]> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(path.join(process.cwd(), "public", "models", file));
  const out: Vertex[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const parent = node.getParentNode()?.getName() ?? node.getName();
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (!pick(parent, prim.getMaterial()?.getName())) continue;
      const pos = prim.getAttribute("POSITION")!;
      const nor = prim.getAttribute("NORMAL")!;
      const v = [0, 0, 0];
      const nn = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        nor.getElement(i, nn);
        out.push({
          p: [0, 1, 2].map((a) => m[a] * v[0] + m[4 + a] * v[1] + m[8 + a] * v[2] + m[12 + a]) as [number, number, number],
          n: [0, 1, 2].map((a) => m[a] * nn[0] + m[4 + a] * nn[1] + m[8 + a] * nn[2]) as [number, number, number],
        });
      }
    }
  }
  return out;
}

describe("the tunnel car in the F226's frame", () => {
  it("is a small correction: near-unit scales, offsets of a few centimetres, a residual under 4 cm", () => {
    for (const s of TUNNEL_FRAME.scale) expect(Math.abs(s - 1)).toBeLessThan(0.03);
    for (const o of TUNNEL_FRAME.offset) expect(Math.abs(o)).toBeLessThan(0.06);
    expect(TUNNEL_FRAME.residualCm.mean).toBeLessThan(4);
  });

  it("keeps every mark the livery names, each on real F226 surface as the F226 carries it", async () => {
    const f226 = await vertices("f226.f3ba7133.glb", (_p, mat) => mat === "BodyLivery" || mat === "RearWingLivery");
    const marks = LIVERIES.ghost.decals;
    expect(tunnelDecals(marks).map((d) => d.id)).toEqual(marks.map((d) => d.id));
    for (const d of marks) expect(f226.filter((q) => decalHit(d, q.p, q.n)).length, `${d.id} on the F226`).toBeGreaterThan(20);
  });

  it("puts every mark, in every livery, flat on the tunnel car: a ray through any point of its whole rectangle meets the surface within 3 cm of its plane, on a face within 25 degrees of its projection axis", async () => {
    const tris = await tunnelSurface();
    const seen = new Set<string>();
    const bad: string[] = [];
    for (const id of LIVERY_IDS) {
      for (const d of tunnelDecals(LIVERIES[id].decals)) {
        const key = JSON.stringify([d.id, d.centre, d.normal, d.up, d.size]);
        if (seen.has(key)) continue;
        seen.add(key);
        const miss = failures(d, tris);
        if (miss.length) {
          const hits = miss.filter((s) => !Number.isNaN(s.offset));
          bad.push(`${id} ${d.id}: ${miss.length} of 45 samples off (${miss.length - hits.length} hit nothing), worst offset ${Math.max(0, ...hits.map((s) => Math.abs(s.offset))).toFixed(3)} m, worst angle ${Math.max(0, ...hits.map((s) => s.angle)).toFixed(0)} deg`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 120000);
});
