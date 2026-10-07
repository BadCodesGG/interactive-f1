/**
 * The sidecar-versus-model check behind `npm run check:sidecar` and its Vitest test.
 *
 * For every src/data/<feature>.sidecar.json it validates the sidecar's schema, reads its `model`
 * GLB with @gltf-transform/core, and fails when:
 *   - a sidecar part key has no node in the model;
 *   - a node name would be changed by three's sanitiser (it would load under another name);
 *   - two nodes load under the same sanitised name (three renames the second to `name_1`);
 *   - a part's `copy` key has no entry in src/data/<feature>.copy.ts;
 *   - three's own GLTFLoader, run here in Node, does not give each part key to exactly one object.
 * A part marked `procedural` is built in code at load time, so only its copy key is checked here.
 * The last one is the ground truth: a multi-primitive mesh's children take `mesh_1`-style names
 * from the same pool as nodes, which no name list alone can predict.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { sanitizeNodeName, validateSidecar } from "../../src/engine/explode/sidecar.ts";
import { ROOT } from "./dev-server.mjs";

const DATA = path.join(ROOT, "src", "data");

/** Parses GLB bytes: the node names as authored, plus the bytes for three to load. */
export async function readModel(bytes) {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.readBinary(bytes);
  return { nodeNames: doc.getRoot().listNodes().map((n) => n.getName()), bytes };
}

/** Loads the GLB with three's GLTFLoader and counts objects per name. */
async function threeNames(bytes) {
  const [{ GLTFLoader }, { MeshoptDecoder: ThreeMeshopt }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().setMeshoptDecoder(ThreeMeshopt).parseAsync(ab, "");
  const counts = new Map();
  gltf.scene.traverse((o) => counts.set(o.name, (counts.get(o.name) ?? 0) + 1));
  return counts;
}

/** Every problem with one sidecar against its model and copy book, as readable lines. */
export async function checkSidecarFile(name, json, model, copyBook) {
  const errors = [];
  const at = (m) => errors.push(`${name}: ${m}`);
  const valid = validateSidecar(json);
  if (!valid.ok) {
    valid.errors.forEach(at);
    return errors;
  }
  const { parts } = valid.sidecar;

  const loaded = new Map();
  for (const n of model.nodeNames) {
    if (!n) continue;
    const s = sanitizeNodeName(n);
    if (s !== n) at(`node "${n}" would load as "${s}": rename it in the source file`);
    loaded.set(s, (loaded.get(s) ?? 0) + 1);
  }
  for (const [s, count] of loaded) if (count > 1) at(`${count} nodes load as "${s}": three renames all but the first to "${s}_1" and so on`);

  for (const [id, part] of Object.entries(parts)) {
    if (!part.procedural && !loaded.has(id)) at(`part "${id}" has no node in the model (${model.nodeNames.filter(Boolean).length} named nodes)`);
    if (!copyBook || !(part.copy in copyBook)) at(`parts.${id}.copy "${part.copy}" has no entry in the copy book`);
    else if (copyBook[part.copy].id !== part.copy) at(`copy book entry "${part.copy}" has id "${copyBook[part.copy].id}"`);
  }

  const counts = await threeNames(model.bytes);
  for (const [id, part] of Object.entries(parts)) {
    if (part.procedural) continue;
    const c = counts.get(id) ?? 0;
    if (c !== 1 && loaded.has(id)) at(`part "${id}" resolves to ${c} objects in three (expected exactly 1)`);
  }
  return errors;
}

/** Checks every src/data/*.sidecar.json. */
export async function checkSidecars(dataDir = DATA) {
  const files = readdirSync(dataDir).filter((f) => f.endsWith(".sidecar.json")).sort();
  const errors = [];
  for (const file of files) {
    const feature = file.replace(/\.sidecar\.json$/, "");
    let json;
    try {
      json = JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
    } catch (e) {
      errors.push(`${file}: not valid JSON (${e.message})`);
      continue;
    }
    const modelPath = typeof json.model === "string" ? path.join(ROOT, "public", json.model) : null;
    if (!modelPath || !existsSync(modelPath)) {
      errors.push(`${file}: model ${JSON.stringify(json.model)} is not a file under public/ (run npm run fixture?)`);
      continue;
    }
    const copyPath = path.join(dataDir, `${feature}.copy.ts`);
    const copyBook = existsSync(copyPath) ? (await import(pathToFileURL(copyPath).href)).copyBook : undefined;
    if (!copyBook) errors.push(`${file}: ${feature}.copy.ts is missing or does not export copyBook`);
    const model = await readModel(new Uint8Array(readFileSync(modelPath)));
    errors.push(...(await checkSidecarFile(file, json, model, copyBook ?? {})));
  }
  return { files, errors };
}
