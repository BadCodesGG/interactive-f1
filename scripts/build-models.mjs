/**
 * Builds the wind tunnel's car model: reads the decimated source GLB (millimetres, 16 named part
 * nodes), converts it to metres, recentres it so the wheelbase midpoint sits on the origin with the
 * tyre contact patch on y = 0, and writes public/models/f1-2026.<8-char content hash>.glb. It then
 * points src/data/f1-tunnel.json's `model` at the new file and removes older f1-2026 GLBs (the /models/
 * path is cached as immutable, so a changed model must be a new URL).
 *
 * The source is Meshopt-compressed with KHR_mesh_quantization, so its vertices are normalised
 * integers and each node's TRS carries the dequantisation. The unit change is therefore baked into
 * every root node's transform (T' = s (T - c), S' = s S) rather than into the vertices: world space
 * comes out in metres, which is what the explode maths, the livery shader and the tunnel SDF read.
 *
 * Source (not in the repo; the built GLB is, so this is optional): a GLB made from "F1 2026 concept"
 * by Qvist_Designs (CC BY 4.0), split into the 16 named parts of filan214's APEX project
 * (src/data/credits.ts). Pass it as the first argument or set F1_SOURCE_GLB:
 *   node scripts/build-models.mjs <path/to/f1-2026.glb>
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { ROOT } from "./lib/dev-server.mjs";

const MODELS = path.join(ROOT, "public", "models");
// The tunnel keeps this car: its flow field and wing hinges were measured on it. The exploded view
// shows the Formula F226 (scripts/build-car.mjs).
const TUNNEL = path.join(ROOT, "src", "data", "f1-tunnel.json");
// The prepped source is not committed (too large); it is always given explicitly.
const SOURCE = process.argv[2] ?? process.env.F1_SOURCE_GLB;
if (!SOURCE) {
  console.error("Usage: node scripts/build-models.mjs <path/to/f1-2026.glb>\n   or: set F1_SOURCE_GLB (see the README, \"Rebuilding the assets\")");
  process.exit(1);
}
const SCALE = 0.001;
const WHEELS = ["front-left-wheel", "front-right-wheel", "rear-left-wheel", "rear-right-wheel"];

const round = (v) => v.map((x) => Math.round(x * 1000) / 1000);

async function main() {
  if (!existsSync(SOURCE)) throw new Error(`Source GLB not found: ${SOURCE} (pass a path or set F1_SOURCE_GLB)`);
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(SOURCE);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const byName = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));

  // Wheelbase midpoint in x and z from the four wheel centres; ground from the lowest point.
  const centres = WHEELS.map((w) => {
    const node = byName.get(w);
    if (!node) throw new Error(`Source has no node "${w}"`);
    const { min, max } = getBounds(node);
    return min.map((m, i) => (m + max[i]) / 2);
  });
  const all = getBounds(scene);
  const c = [
    centres.reduce((s, p) => s + p[0], 0) / 4,
    all.min[1],
    centres.reduce((s, p) => s + p[2], 0) / 4,
  ];

  for (const node of scene.listChildren()) {
    const t = node.getTranslation();
    const s = node.getScale();
    node.setTranslation([(t[0] - c[0]) * SCALE, (t[1] - c[1]) * SCALE, (t[2] - c[2]) * SCALE]);
    node.setScale([s[0] * SCALE, s[1] * SCALE, s[2] * SCALE]);
  }

  // Keep the source's compression: Meshopt with filters (octahedral normals, quantised positions).
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const glb = await io.writeBinary(doc);
  const hash = createHash("sha256").update(glb).digest("hex").slice(0, 8);
  const file = `f1-2026.${hash}.glb`;
  for (const old of readdirSync(MODELS).filter((f) => /^f1-2026\.[0-9a-f]{8}\.glb$/.test(f) && f !== file)) {
    rmSync(path.join(MODELS, old));
  }
  writeFileSync(path.join(MODELS, file), glb);

  const tunnel = existsSync(TUNNEL) ? JSON.parse(readFileSync(TUNNEL, "utf8")) : {};
  writeFileSync(TUNNEL, `${JSON.stringify({ ...tunnel, model: `/models/${file}` }, null, 2)}\n`);

  const out = await io.readBinary(glb);
  const outScene = out.getRoot().listScenes()[0];
  const b = getBounds(outScene);
  console.log(`wrote public/models/${file} (${(glb.byteLength / 1024).toFixed(1)} KB, meshopt, metres)`);
  console.log(`bounds min ${round(b.min).join(", ")}  max ${round(b.max).join(", ")}`);
  for (const n of outScene.listChildren()) {
    const nb = getBounds(n);
    console.log(`  ${n.getName().padEnd(18)} min ${round(nb.min).join(", ").padEnd(24)} max ${round(nb.max).join(", ")}`);
  }
  console.log(`src/data/f1-tunnel.json model -> /models/${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
