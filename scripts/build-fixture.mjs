/**
 * Builds the fixture model: a nine-part "machine" written with @gltf-transform/core,
 * Meshopt-compressed, and saved as public/models/fixture.<8-char content hash>.glb. It then points
 * src/data/fixture.sidecar.json's `model` at the new file and removes older fixture GLBs, so a
 * changed model is always a new URL (the /models/ path is cached as immutable).
 *
 * The layout exercises every branch of the explode maths: `base_plate` and `core` sit at the
 * assembly centre (the thinnest-axis push), `cover_top` has an authored vector, `cover_front` keeps
 * its node origin at (0, 0, 0) with its vertices baked in place (centres come from bounds, never from
 * `position`), and the rest are radial. Mesh names end in `_mesh` because GLTFLoader gives nodes and
 * meshes one pool of unique names: a mesh called `head` would push a later node `head` to `head_1`.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { ROOT } from "./lib/dev-server.mjs";

const MODELS = path.join(ROOT, "public", "models");
const SIDECAR = path.join(ROOT, "src", "data", "fixture.sidecar.json");

/** Flat-shaded triangle soup builder: every face gets its own vertices so normals stay crisp. */
function soup() {
  const pos = [], nor = [], idx = [];
  const tri = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    const base = pos.length / 3;
    for (const p of [a, b, c]) { pos.push(...p); nor.push(n[0] / l, n[1] / l, n[2] / l); }
    idx.push(base, base + 1, base + 2);
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  return { tri, quad, done: () => ({ pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }) };
}

/** An axis-aligned box of size [w, h, d] centred on `o`. */
function boxGeo([w, h, d], o = [0, 0, 0]) {
  const s = soup();
  const [x0, x1, y0, y1, z0, z1] = [o[0] - w / 2, o[0] + w / 2, o[1] - h / 2, o[1] + h / 2, o[2] - d / 2, o[2] + d / 2];
  s.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // +z
  s.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // -z
  s.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // +x
  s.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // -x
  s.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // +y
  s.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // -y
  return s.done();
}

/** A spur gear facing +z: `teeth` square teeth around radius r, depth d, centred on the origin. */
function gearGeo(r, d, teeth) {
  const s = soup();
  const ring = [];
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r * 0.82;
    ring.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const zf = d / 2, zb = -d / 2;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n];
    s.quad([ax, ay, zb], [bx, by, zb], [bx, by, zf], [ax, ay, zf]);
    s.tri([0, 0, zf], [ax, ay, zf], [bx, by, zf]);
    s.tri([0, 0, zb], [bx, by, zb], [ax, ay, zb]);
  }
  return s.done();
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

// name, geometry, node translation, sRGB colour.
const PARTS = [
  ["base_plate", boxGeo([2.4, 0.1, 1.6]), [0, 0, 0], 0x4a5468],
  ["column_left", boxGeo([0.2, 2.0, 0.2]), [-1.05, 0, -0.55], 0x7d8aa3],
  ["column_right", boxGeo([0.2, 2.0, 0.2]), [1.05, 0, -0.55], 0x98a4bb],
  ["head", boxGeo([2.4, 0.3, 0.7]), [0, 1.15, -0.45], 0x2f6f9f],
  ["gear_a", gearGeo(0.38, 0.12, 12), [-0.35, 0.5, 0.1], 0xe8b84c],
  ["gear_b", gearGeo(0.26, 0.12, 8), [0.33, 0.5, 0.1], 0xd9822b],
  ["cover_top", boxGeo([1.8, 0.06, 1.2]), [0, 0.95, 0.15], 0x3c9a7e],
  // Origin left at (0, 0, 0), vertices baked where the panel sits.
  ["cover_front", boxGeo([1.8, 0.9, 0.05], [0, -0.5, 0.82]), [0, 0, 0], 0x6c5fc7],
  ["core", boxGeo([0.22, 0.22, 0.22]), [0, 0, 0], 0xe5484d],
];

async function main() {
  await MeshoptEncoder.ready;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("fixture");
  const root = doc.createNode("machine");
  scene.addChild(root);

  for (const [name, g, at, colour] of PARTS) {
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(g.pos).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(g.nor).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(g.idx).setBuffer(buffer))
      .setMaterial(doc.createMaterial(`${name}_mat`).setBaseColorFactor([...hex(colour), 1]).setRoughnessFactor(0.55).setMetallicFactor(0.15));
    const mesh = doc.createMesh(`${name}_mesh`).addPrimitive(prim);
    root.addChild(doc.createNode(name).setTranslation(at).setMesh(mesh));
  }

  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const glb = await io.writeBinary(doc);

  const hash = createHash("sha256").update(glb).digest("hex").slice(0, 8);
  const file = `fixture.${hash}.glb`;
  for (const old of readdirSync(MODELS).filter((f) => /^fixture\.[0-9a-f]{8}\.glb$/.test(f) && f !== file)) {
    rmSync(path.join(MODELS, old));
  }
  writeFileSync(path.join(MODELS, file), glb);

  const sidecar = JSON.parse(readFileSync(SIDECAR, "utf8"));
  sidecar.model = `/models/${file}`;
  writeFileSync(SIDECAR, `${JSON.stringify(sidecar, null, 2)}\n`);

  const names = (await io.readBinary(glb)).getRoot().listNodes().map((n) => n.getName());
  console.log(`wrote public/models/${file} (${(glb.byteLength / 1024).toFixed(1)} KB, meshopt)`);
  console.log(`nodes: ${names.join(", ")}`);
  console.log(`src/data/fixture.sidecar.json model -> /models/${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
