import { describe, expect, it } from "vitest";
import { Document, NodeIO } from "@gltf-transform/core";
import { checkSidecarFile, checkSidecars, readModel } from "./lib/check-sidecar.mjs";

async function glbWith(names: string[], meshNames: string[] = []) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  names.forEach((name, i) => {
    const node = doc.createNode(name);
    const meshName = meshNames[i];
    if (meshName !== undefined) {
      const prim = doc.createPrimitive().setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer));
      node.setMesh(doc.createMesh(meshName).addPrimitive(prim));
    }
    scene.addChild(node);
  });
  return new NodeIO().writeBinary(doc);
}

const sidecar = (parts: string[]) => ({
  schema: 1,
  model: "/models/t.glb",
  assembly: {},
  groups: {},
  parts: Object.fromEntries(parts.map((p) => [p, { label: p, copy: `t.${p}` }])),
});
const book = (parts: string[]) => Object.fromEntries(parts.map((p) => [`t.${p}`, { id: `t.${p}` }]));

describe("check:sidecar", () => {
  it("passes for every sidecar in src/data", async () => {
    const { files, errors } = await checkSidecars();
    expect(files.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it("reports a sidecar part the model does not contain", async () => {
    const model = await readModel(await glbWith(["a"], ["a_mesh"]));
    const errors = await checkSidecarFile("t", sidecar(["a", "b"]), model, book(["a", "b"]));
    expect(errors.join("\n")).toMatch(/part "b" has no node in the model/);
  });

  it("reports node names three would rewrite, and two nodes that sanitise to one name", async () => {
    const model = await readModel(await glbWith(["Left Lobe.001", "Left_Lobe001", "ok"]));
    const errors = (await checkSidecarFile("t", sidecar(["ok"]), model, book(["ok"]))).join("\n");
    expect(errors).toMatch(/"Left Lobe\.001" would load as "Left_Lobe001"/);
    expect(errors).toMatch(/2 nodes load as "Left_Lobe001"/);
  });

  it("skips the model check for a part marked procedural (built in code at load time)", async () => {
    const model = await readModel(await glbWith(["a"], ["a_mesh"]));
    const json = sidecar(["a", "pu"]);
    (json.parts.pu as Record<string, unknown>).procedural = true;
    expect(await checkSidecarFile("t", json, model, book(["a", "pu"]))).toEqual([]);
    // Without the flag the same part is reported.
    const plain = await checkSidecarFile("t", sidecar(["a", "pu"]), model, book(["a", "pu"]));
    expect(plain.join("\n")).toMatch(/part "pu" has no node in the model/);
  });

  it("reports a copy key with no entry in the copy book", async () => {
    const model = await readModel(await glbWith(["a"], ["a_mesh"]));
    const errors = await checkSidecarFile("t", sidecar(["a"]), model, {});
    expect(errors.join("\n")).toMatch(/parts\.a\.copy "t\.a" has no entry/);
  });

  it("reports a part name three gives to two objects (a multi-primitive mesh's children)", async () => {
    // Node "b" holds a two-primitive mesh also named "b", whose child Meshes load as "b_1" and "b_2": a real node
    // called "b_1" is then one of two objects with that name.
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();
    const prim = () => doc.createPrimitive().setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer));
    scene.addChild(doc.createNode("b").setMesh(doc.createMesh("b").addPrimitive(prim()).addPrimitive(prim())));
    scene.addChild(doc.createNode("b_1").setMesh(doc.createMesh("c_mesh").addPrimitive(prim())));
    const model = await readModel(await new NodeIO().writeBinary(doc));
    const errors = await checkSidecarFile("t", sidecar(["b", "b_1"]), model, book(["b", "b_1"]));
    expect(errors.join("\n")).toMatch(/part "b_1" resolves to 2 objects in three/);
  });
});
