/**
 * Builds a showroom car: reads a source glTF (a Sketchfab download with its own textures), groups
 * its named Blender objects into a sidecar's parts, bakes every mesh's world transform into metres
 * with the wheelbase midpoint on the origin and the tyres on y = 0 (nose towards -x, +z to the car's
 * left, the same frame as the power unit and the tunnel car), strips the textures and UVs, rebuilds
 * every mesh's normals with a 35 degree crease angle so curved bodywork shades smoothly while real
 * edges stay sharp, compresses with Meshopt, and writes public/models/<prefix>.<8-char content hash>.glb.
 * It then points the car's sidecar's `model` at the new file and removes older GLBs of that prefix (the
 * /models/ path is cached as immutable).
 *
 *   node scripts/build-car.mjs [f226|f222] [path/to/scene.gltf]   (f226 by default)
 *   F226_SOURCE=<scene.gltf> npm run car
 *   F222_SOURCE=<scene.gltf> npm run car:2022
 *
 * The source is the scene.gltf of the unzipped Sketchfab download. It is not in the repo and has no
 * default: pass its path as the second argument or set the environment variable named below.
 *
 * Each car is one entry of CARS: its sidecar, the wheelbase that sets its scale, its parts map
 * (sidecar part id -> the source's object names) and how it is finished.
 *
 * - f226, the 2026 car (src/data/f1.sidecar.json): the livery is painted in the shader, so the GLB
 *   keeps only its material names. Source: F226_SOURCE. Credit: "Formula F226" by CarlosCG31, CC BY 4.0.
 * - f222, the 2022 car (src/data/f222.sidecar.json): it has no livery, so its materials are renamed to
 *   the ones the stage's surfaces hook dresses (src/models/f1/surfaces.ts) and given flat colours: a
 *   neutral pearl-white body on dark carbon. Source: F222_SOURCE. Credit: "Formula F222 Ultimate" by
 *   CarlosCG31, CC BY 4.0.
 *
 * The wind tunnel keeps the older concept car (scripts/build-models.mjs): its flow field and wing
 * hinges were measured on that model.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { creaseMesh } from "./lib/creased-normals.mjs";
import { ROOT } from "./lib/dev-server.mjs";

const MODELS = path.join(ROOT, "public", "models");
/** Faces meeting at less than this angle share a smooth normal; a sharper fold stays a crisp edge. */
const CREASE_ANGLE = (35 * Math.PI) / 180;

/** The source materials the livery paints pearl (livery.ts SHOWROOM_FINISH): they read the paint normal. */
const PEARL_MATERIALS = new Set(["BodyLivery", "FrontEndplateLivery"]);

/** The F226's parts: sidecar part id -> the source's object names (Sketchfab's `_<n>` suffix removed). */
export const PARTS = {
  "front-wing": ["FrontWing", "ActiveFront", "Endplate", "Aero2", "FrontSupport"],
  "rear-wing": ["Rear Wing", "ActiveRear", "AeroPart2", "RearSupport", "RearSupport2"],
  floor: ["Floor", "AeroPart1", "AeroPart3", "Carbon5"],
  bodywork: ["Body"],
  cockpit: ["Interior", "Seat", "Steer", "SteerColum"],
  mirrors: ["Mirrors", "Carbon4"],
  cameras: ["OnboardCam", "LateralCam", "Carbon3"],
  "front-suspension": ["Front Suspension"],
  "rear-suspension": ["Rear Suspension"],
  "front-left-wheel": ["FL"],
  "front-right-wheel": ["FR"],
  "rear-left-wheel": ["RL"],
  "rear-right-wheel": ["RR"],
  exhaust: ["Exhaust"],
  "rain-light": ["RearLight"],
};

/**
 * The F222's parts, from the same kinds of object as the F226's. Its body is one mesh (chassis, sidepods,
 * engine cover and halo), its wheels are a tyre, a rim and a cover each, and a few small Blender cubes
 * are the rear wing's support, the crash structure under it, the camera pods and the mirror stays.
 */
export const PARTS_F222 = {
  "front-wing": ["Front Wing", "Vert"],
  "rear-wing": ["Rear Wing", "DRS", "Cube.001", "Vert.016"],
  floor: ["Floor", "Cube.002"],
  bodywork: ["Main Body", "Part", "RollHoopIntake", "Cube.006", "SidepodIntake"],
  cockpit: ["Interior", "Seat", "Steer", "Cilindro.001"],
  mirrors: ["Mirrors", "Cube.005"],
  cameras: ["Cube.003", "Cube.004"],
  "front-suspension": ["FSUS"],
  "rear-suspension": ["RLSUS"],
  "front-left-wheel": ["FLAXIS"],
  "front-right-wheel": ["FRAXIS"],
  "rear-left-wheel": ["RLAXIS"],
  "rear-right-wheel": ["RRAXIS"],
  exhaust: ["Cylinder.001"],
  "rain-light": ["Floor.001"],
};

/**
 * The F222's neutral finish. Its source materials carry the original livery in textures, which are
 * stripped, so each becomes one of the names the stage's surfaces hook dresses (surfaces.ts): a pearl
 * body with a clear coat, satin carbon, matte rubber, brushed metal. `any` maps a source material to
 * its finish; `parts` overrides it for one part (the source paints the body, the cockpit and the wheel
 * rims all with `material_0`). `colours` are sRGB; glTF wants them linear.
 */
const FINISH_F222 = {
  colours: {
    "livery-pearl": { color: "#ffffff", metalness: 0.05, roughness: 0.3 },
    "livery-satin": { color: "#1b1e24", metalness: 0.1, roughness: 0.6 },
    "livery-tyre": { color: "#16181d", metalness: 0, roughness: 0.9 },
    "showroom-Cover": { color: "#cdd3dc", metalness: 0.95, roughness: 0.3 },
    "showroom-Metal": { color: "#8b919c", metalness: 0.95, roughness: 0.3 },
    "showroom-Redlight": { color: "#d61f1f", metalness: 0, roughness: 0.4 },
  },
  any: {
    material_0: "livery-pearl",
    material: "livery-satin",
    Carbon: "livery-satin",
    "Carbon.001": "livery-satin",
    "Carbon.003": "livery-satin",
    "Carbon.004": "livery-satin",
    "Carbon.005": "livery-satin",
    "Carbon.006": "livery-satin",
    carbon: "livery-satin",
    Front_Wing: "livery-satin",
    RearWing: "livery-satin",
    NOTMIRROR: "livery-satin",
    Screen: "livery-satin",
    mirror: "showroom-Cover",
    "Metal.001": "showroom-Metal",
    Tyre: "livery-tyre",
    REDLIGHT: "showroom-Redlight",
  },
  parts: {
    cockpit: { material_0: "livery-satin" },
    "front-left-wheel": { material_0: "showroom-Cover" },
    "front-right-wheel": { material_0: "showroom-Cover" },
    "rear-left-wheel": { material_0: "showroom-Cover" },
    "rear-right-wheel": { material_0: "showroom-Cover" },
  },
};

/** The cars this script builds. `wheelbase` (metres) sets the scale: the source is unitless. */
const CARS = {
  f226: {
    prefix: "f226",
    sidecar: path.join(ROOT, "src", "data", "f1.sidecar.json"),
    envName: "F226_SOURCE",
    /** A 2026 car's maximum wheelbase. */
    wheelbase: 3.4,
    parts: PARTS,
    pearl: PEARL_MATERIALS,
    /** One rear tyre carries the source's "Screen" material; it is a tyre like the other three. */
    screenIsTyre: true,
    finish: null,
  },
  f222: {
    prefix: "f222",
    sidecar: path.join(ROOT, "src", "data", "f222.sidecar.json"),
    envName: "F222_SOURCE",
    /** A 2022 car's maximum wheelbase (Technical Regulations article 3.4.2). */
    wheelbase: 3.6,
    parts: PARTS_F222,
    pearl: new Set(),
    screenIsTyre: false,
    finish: FINISH_F222,
  },
};

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToLinear = (hex) => [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

/** Gives every mesh of every part the flat finish its source material maps to; a material with no rule is an error. */
function applyFinish(doc, members, finish) {
  const made = new Map();
  const material = (name) => {
    if (!made.has(name)) {
      const spec = finish.colours[name];
      if (!spec) throw new Error(`Finish names "${name}" but defines no colour for it`);
      made.set(name, doc.createMaterial(name).setBaseColorFactor([...hexToLinear(spec.color), 1]).setMetallicFactor(spec.metalness).setRoughnessFactor(spec.roughness));
    }
    return made.get(name);
  };
  for (const [id, list] of members) {
    const rules = { ...finish.any, ...finish.parts[id] };
    for (const group of list) {
      group.traverse((n) => {
        for (const prim of n.getMesh()?.listPrimitives() ?? []) {
          const from = prim.getMaterial()?.getName();
          const to = rules[from];
          if (!to) throw new Error(`Part ${id}: material "${from}" has no finish`);
          prim.setMaterial(material(to));
        }
      });
    }
  }
}

const WHEELS = ["front-left-wheel", "front-right-wheel", "rear-left-wheel", "rear-right-wheel"];
const baseName = (n) => n.replace(/_\d+$/, "");

/** Column-major 4x4 product, as glTF stores matrices. */
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

async function main(car) {
  const PARTS = car.parts;
  const source = process.argv[3] ?? process.env[car.envName];
  if (!source) {
    console.error(`Usage: node scripts/build-car.mjs ${which} <path/to/scene.gltf>\n   or: set ${car.envName} (see the README, "Rebuilding the assets")`);
    process.exit(1);
  }
  if (!existsSync(source)) throw new Error(`Source glTF not found: ${source} (pass a path or set ${car.envName})`);
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(source);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];

  // Each source object belongs to exactly one part; anything unmapped is an error, not a silent drop.
  const owner = new Map(Object.entries(PARTS).flatMap(([id, names]) => names.map((n) => [n, id])));
  const axis = root.listNodes().find((n) => baseName(n.getName()) === "CARAXIS");
  if (!axis) throw new Error("Source has no CARAXIS node");
  const members = new Map(Object.keys(PARTS).map((id) => [id, []]));
  for (const child of axis.listChildren()) {
    const id = owner.get(baseName(child.getName()));
    if (!id) throw new Error(`Source object "${child.getName()}" has no part`);
    members.get(id).push(child);
  }
  for (const [id, list] of members) if (list.length !== PARTS[id].length) throw new Error(`Part ${id}: found ${list.length} of ${PARTS[id].length} objects`);

  // Scale from the wheelbase, centre on the wheelbase midpoint, ground at the lowest point.
  const centre = (nodes) => {
    const b = nodes.map((n) => getBounds(n));
    return [0, 1, 2].map((i) => b.reduce((s, x) => s + (x.min[i] + x.max[i]) / 2, 0) / b.length);
  };
  const [fl, fr, rl, rr] = WHEELS.map((w) => centre(members.get(w)));
  const wheelbase = (rl[0] + rr[0]) / 2 - (fl[0] + fr[0]) / 2;
  const s = car.wheelbase / wheelbase;
  const all = getBounds(scene);
  const c = [(fl[0] + fr[0] + rl[0] + rr[0]) / 4, all.min[1], (fl[2] + fr[2] + rl[2] + rr[2]) / 4];
  const place = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -c[0] * s, -c[1] * s, -c[2] * s, 1];

  // New part nodes at the scene root, each holding its meshes with the world transform baked in.
  const old = scene.listChildren();
  const tyre = root.listMaterials().find((m) => m.getName() === "Tyre");
  if (car.screenIsTyre) {
    for (const id of WHEELS) {
      for (const group of members.get(id)) {
        group.traverse((n) => {
          for (const prim of n.getMesh()?.listPrimitives() ?? []) if (prim.getMaterial()?.getName() === "Screen") prim.setMaterial(tyre);
        });
      }
    }
  }
  if (car.finish) applyFinish(doc, members, car.finish);

  for (const [id, list] of members) {
    const part = doc.createNode(id);
    scene.addChild(part);
    for (const group of list) {
      group.traverse((n) => {
        if (!n.getMesh()) return;
        part.addChild(doc.createNode(n.getName()).setMesh(n.getMesh()).setMatrix(mul(place, n.getWorldMatrix())));
      });
    }
  }
  for (const n of old) scene.removeChild(n);

  // The livery is procedural: no textures, no UVs. Material names stay, the livery keys on them.
  for (const m of root.listMaterials()) {
    m.setBaseColorTexture(null).setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    for (const ext of m.listExtensions()) m.setExtension(ext.extensionName, null);
  }
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) for (const sem of prim.listSemantics()) if (sem.startsWith("TEXCOORD")) prim.setAttribute(sem, null);
  for (const ext of root.listExtensionsUsed()) ext.dispose();

  // Smooth shading with real edges: the source's normals dent the curved bodywork, so rebuild them.
  // The pearl paint decides its regions from a continuous normal, since the shading normal jumps at a crease.
  const isPearl = (prim) => car.pearl.has(prim.getMaterial()?.getName());
  for (const mesh of root.listMeshes()) creaseMesh(mesh, CREASE_ANGLE, isPearl);

  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const glb = await io.writeBinary(doc);
  const hash = createHash("sha256").update(glb).digest("hex").slice(0, 8);
  const file = `${car.prefix}.${hash}.glb`;
  for (const f of readdirSync(MODELS).filter((f) => new RegExp(`^${car.prefix}\\.[0-9a-f]{8}\\.glb$`).test(f) && f !== file)) rmSync(path.join(MODELS, f));
  writeFileSync(path.join(MODELS, file), glb);

  const sidecar = JSON.parse(readFileSync(car.sidecar, "utf8"));
  sidecar.model = `/models/${file}`;
  writeFileSync(car.sidecar, `${JSON.stringify(sidecar, null, 2)}\n`);
  const b = getBounds(scene);
  console.log(`wrote public/models/${file} (${(glb.length / 1024).toFixed(0)} KB), scale ${s.toFixed(4)}`);
  console.log(`bounds min ${b.min.map((v) => v.toFixed(3))} max ${b.max.map((v) => v.toFixed(3))}`);
}

const which = process.argv[2] ?? "f226";
if (!CARS[which]) {
  const looksLikePath = /[\\/]|\.(gltf|glb)$/i.test(which);
  const reason = looksLikePath ? `"${which}" is a path, but the car name comes first.` : `Unknown car "${which}".`;
  console.error(`${reason}\nUsage: node scripts/build-car.mjs <${Object.keys(CARS).join("|")}> <path/to/scene.gltf>`);
  process.exit(1);
}
main(CARS[which]).catch((e) => {
  console.error(e);
  process.exit(1);
});
