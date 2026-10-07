/**
 * Measures the Formula F226 in its rest pose and writes src/models/f1/car-frame.ts: per-part bounds
 * in metres, the two ends of `t` (nose tip, rear wing trailing edge), the body's height range, its
 * cross-section stations (the shoulder line the livery's wrap coordinate is measured from), the
 * halo's box and the anchor points the logo decals sit on. Same frame the livery shader reads
 * (vertex positions through the mesh's rest matrix): metres, x along the car with the nose negative,
 * y up from the ground, z across. Run after `npm run car`: `node scripts/measure-car-frame.mjs`
 * (`--check` exits 1 if the committed file is stale).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { ROOT } from "./lib/dev-server.mjs";

const OUT = path.join(ROOT, "src", "models", "f1", "car-frame.ts");
const STATION = 0.15;
/** The halo: the arc over the cockpit, above the chassis shoulders and ahead of the airbox. */
const HALO_QUERY = { x: [-1.1, 0.1], yMin: 0.7 };
const r = (v) => Math.round(v * 1000) / 1000;
const median = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];

const sidecar = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "f1.sidecar.json"), "utf8"));
const model = path.join(ROOT, "public", sidecar.model);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(model);

/** partId -> material -> world-space vertices. */
const clouds = {};
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  const part = node.getParentNode()?.getName();
  if (!mesh || !part) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial()?.getName() ?? "none";
    const pos = prim.getAttribute("POSITION");
    const list = ((clouds[part] ??= {})[mat] ??= []);
    const v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      list.push([0, 1, 2].map((a) => m[a] * v[0] + m[4 + a] * v[1] + m[8 + a] * v[2] + m[12 + a]));
    }
  }
}
const bounds = (pts) => ({ min: [0, 1, 2].map((a) => r(Math.min(...pts.map((p) => p[a])))), max: [0, 1, 2].map((a) => r(Math.max(...pts.map((p) => p[a])))) });

const parts = {};
for (const [part, mats] of Object.entries(clouds)) for (const [mat, pts] of Object.entries(mats)) (parts[part] ??= {})[mat] = bounds(pts);

const body = clouds.bodywork.BodyLivery;
const nose = Math.min(...body.map((p) => p[0]));
const tail = Math.max(...clouds["rear-wing"].RearEndplateLivery.map((p) => p[0]), ...clouds["rear-wing"].RearWingLivery.map((p) => p[0]));
const bodyBounds = bounds(body);

// Stations: per bin, the widest point's half-width and the top of the widest points (the shoulder).
const sections = [];
for (let x = Math.ceil(nose / STATION) * STATION; x <= bodyBounds.max[0] + 1e-6; x += STATION) {
  const s = body.filter((p) => Math.abs(p[0] - x) <= STATION / 2);
  if (s.length < 8) continue;
  const zmax = Math.max(...s.map((p) => Math.abs(p[2])));
  const wide = s.filter((p) => Math.abs(p[2]) >= zmax - 0.05);
  sections.push([r(x), r(Math.min(...s.map((p) => p[1]))), r(Math.max(...wide.map((p) => p[1]))), r(median(wide.map((p) => Math.abs(p[2]))))]);
}

const halo = bounds(body.filter((p) => p[0] >= HALO_QUERY.x[0] && p[0] <= HALO_QUERY.x[1] && p[1] >= HALO_QUERY.yMin));
const near = (pts, f) => pts.filter(f);
/** Least-squares line through points: the mean and the slope of the second against the first. */
const fit = (pts) => {
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return { mx, my, slope, at: (x) => my + slope * (x - mx) };
};
/** The nose top on the centreline: the highest point per 0.1 m of x, then a line through them (the nose ramps up to the cockpit). */
const noseTops = [];
for (let x = -2.7; x < -2.0; x += 0.1) {
  const ys = near(body, (p) => p[0] >= x && p[0] < x + 0.1 && Math.abs(p[2]) < 0.06).map((p) => p[1]);
  if (ys.length) noseTops.push([x + 0.05, Math.max(...ys)]);
}
const noseFit = fit(noseTops);
/** The fin is the engine cover's raised blade: its side face's half-width against height, over the tall part (x 0.3 to 0.55). */
const finRows = [];
for (let y = 0.78; y <= 1.0; y += 0.04) {
  const zs = near(body, (p) => p[0] > 0.3 && p[0] < 0.55 && Math.abs(p[1] - y) < 0.02).map((p) => Math.abs(p[2]));
  if (zs.length) finRows.push([y, Math.max(...zs)]);
}
const finFit = fit(finRows);
/** The chassis nose ahead of the cockpit (x -2.0 to -1.62): its top line, where the livery's big monogram sits (the cone flattens out here). */
const chassisTops = [];
for (let x = -2.0; x < -1.6; x += 0.1) {
  const ys = near(body, (p) => p[0] >= x && p[0] < x + 0.1 && Math.abs(p[2]) < 0.06).map((p) => p[1]);
  if (ys.length) chassisTops.push([x + 0.05, Math.max(...ys)]);
}
const chassisFit = fit(chassisTops);
/** The rear engine cover's blade (the fin): its side face's half-width against height, over x 1.15 to 1.5 and y 0.5 to 0.75, where it is a plain wedge. */
const bladeRows = [];
for (let y = 0.5; y <= 0.75 + 1e-6; y += 0.05) {
  const zs = near(body, (p) => p[0] > 1.15 && p[0] < 1.5 && Math.abs(p[1] - y) < 0.02).map((p) => Math.abs(p[2]));
  if (zs.length) bladeRows.push([y, Math.max(...zs)]);
}
const bladeFit = fit(bladeRows);
/** The sidepod flank is a near-vertical wall at its widest: its outer face at x, read where the wall is (y about 0.4). */
const flankAt = (x) => Math.max(...near(body, (p) => Math.abs(p[0] - x) < 0.1 && Math.abs(p[1] - 0.4) < 0.1).map((p) => Math.abs(p[2])));
const rw = bounds(clouds["rear-wing"].RearWingLivery);

const frame = {
  model: sidecar.model.split("/").pop(),
  nose: r(nose),
  tail: r(tail),
  body: { min: bodyBounds.min, max: bodyBounds.max },
  sections,
  halo,
  anchors: {
    noseTop: { x: -2.35, y: r(noseFit.at(-2.35)), slope: r(noseFit.slope) },
    noseChassis: { x: -1.78, y: r(chassisFit.at(-1.78)), slope: r(chassisFit.slope) },
    finBlade: { x: 1.32, y: 0.62, z: r(bladeFit.at(0.62)), dzdy: r(bladeFit.slope) },
    finSide: { x: 0.42, y: 0.86, z: r(finFit.at(0.86)), dzdy: r(finFit.slope) },
    flank: { y: 0.4, x0: -0.3, z0: r(flankAt(-0.3)), x1: 0.5, z1: r(flankAt(0.5)) },
    rearWingTop: { x: r((rw.min[0] + rw.max[0]) / 2), yMin: rw.min[1], yMax: rw.max[1], halfWidth: rw.max[2] },
  },
  parts,
};

/** Short numeric arrays on one line, so the stations read as a table. */
const compact = (json) =>
  json
    .replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_, body) => `[${body.replace(/\s+/g, " ")}]`)
    .replace(/"([A-Za-z_]\w*)":/g, "$1:");

const text = `/**
 * The Formula F226 measured in its rest pose, in metres. Generated by scripts/measure-car-frame.mjs
 * from public/models/${frame.model}: do not edit by hand, rerun the script after \`npm run car\`.
 *
 * x runs along the car with the nose negative, y is up from the ground, z is across. \`t\` is the
 * normalised position along the car: 0 at the nose tip (the body's lowest x), 1 at the rear wing's
 * trailing edge (its highest x).
 */
export const CAR_FRAME = ${compact(JSON.stringify(frame, null, 2))} as const;
`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {}
  // A checkout with core.autocrlf (the Windows default) has CRLF line endings, which is not a change.
  if (current.replace(/\r\n/g, "\n") !== text) {
    console.error("src/models/f1/car-frame.ts is stale: run node scripts/measure-car-frame.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}: nose ${frame.nose}, tail ${frame.tail}, ${sections.length} stations`);
}
