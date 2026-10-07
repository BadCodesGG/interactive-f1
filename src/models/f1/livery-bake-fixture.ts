/**
 * Test support: the real F226's painted meshes as the bake takes them (local arrays and the rest matrix),
 * read from public/models with gltf-transform. Not a test, so it is not collected; imported by the bake's tests.
 */
import path from "node:path";
import { NodeIO, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import type { BakeMesh } from "./livery-bake";
import { PART_MATERIAL, type LiveryPart } from "./livery-spec";

/** Every mesh of the real F226 that a livery part paints, as the bake takes it: local arrays and the rest matrix. */
export async function carMeshes(): Promise<BakeMesh[]> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(path.join(process.cwd(), "public", "models", "f226.f3ba7133.glb"));
  const partOf = new Map(Object.entries(PART_MATERIAL).map(([part, mat]) => [mat, part as LiveryPart]));
  const out: BakeMesh[] = [];
  for (const node of doc.getRoot().listNodes() as Node[]) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const part = partOf.get(prim.getMaterial()?.getName() ?? "");
      if (!part) continue;
      const pos = prim.getAttribute("POSITION")!;
      const nor = prim.getAttribute("NORMAL")!;
      const positions = new Float32Array(pos.getCount() * 3);
      const normals = new Float32Array(pos.getCount() * 3);
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        positions.set(pos.getElement(i, v), i * 3);
        normals.set(nor.getElement(i, v), i * 3);
      }
      const idx = prim.getIndices()!;
      out.push({ part, positions, normals, index: idx.getArray()!, rest: node.getWorldMatrix() });
    }
  }
  return out;
}

