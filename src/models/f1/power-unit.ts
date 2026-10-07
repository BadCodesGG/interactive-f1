/**
 * The procedural power unit. The scanned car is a shell with nothing inside, so the engine bay is
 * built here from primitives: a 1.6 L V6 with its cam covers and plenum, the turbo, the MGU-K, the
 * energy store, the control electronics, the two sidepod radiators, the intercooler, the gearbox
 * with its rear suspension pick-ups, and the fuel cell. Shapes are illustrative, sizes roughly real.
 *
 * Coordinates are the built model's (metres, nose towards -x, +y up, +z to the car's left, the
 * wheelbase midpoint on the origin, the ground on y = 0), measured from public/models/f1-2026.*.glb.
 * Vertices are baked in place and every part is a Group at the origin, the same as the GLB's parts,
 * so the explode maths reads each part's centre from its bounds.
 *
 * Each part's geometry is merged per material, so the whole unit costs about 25 draw calls. The
 * sidecar marks these parts `procedural`; power-unit.test.ts keeps the names and the sidecar in step.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const POWER_UNIT_PARTS = [
  "pu-ice",
  "pu-turbo",
  "pu-mgu-k",
  "pu-energy-store",
  "pu-control-electronics",
  "pu-radiator-left",
  "pu-radiator-right",
  "pu-intercooler",
  "pu-gearbox",
  "pu-fuel-cell",
] as const;

export type PowerUnitPart = (typeof POWER_UNIT_PARTS)[number];

type V3 = [number, number, number];
interface Place {
  p?: V3;
  /** Euler angles, radians, XYZ order. */
  r?: V3;
  s?: V3;
}

const matrix = new THREE.Matrix4();
const euler = new THREE.Euler();
const quat = new THREE.Quaternion();

function place(geo: THREE.BufferGeometry, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }: Place = {}): THREE.BufferGeometry {
  matrix.compose(new THREE.Vector3(...p), quat.setFromEuler(euler.set(...r)), new THREE.Vector3(...s));
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.applyMatrix4(matrix);
  // mergeGeometries needs one attribute set: keep position, normal, uv.
  for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
  return g;
}

const box = (w: number, h: number, d: number, radius = 0.012) => new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2) * 0.999);
/** A cylinder along +x. */
const cylX = (r: number, len: number, seg = 24, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateZ(-Math.PI / 2);

/** Cooling fins: `n` thin plates of w x h spaced along z over `depth`, centred on the origin. */
function fins(n: number, w: number, h: number, depth: number, t = 0.004): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) out.push(place(new THREE.BoxGeometry(w, h, t), { p: [0, 0, -depth / 2 + (depth * (i + 0.5)) / n] }));
  return out;
}

interface Palette {
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  alloy: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
}

/**
 * Lighter than a real engine's greys on purpose: the stage is a dark studio and these parts float in
 * the gap between the body and the floor, so a true gunmetal read as a black silhouette. The steels sit
 * mid-grey to pale, the gold is fully saturated, and only the rubber bladder stays near black.
 */
function palette(): Palette {
  const m = (color: string, metalness: number, roughness: number, name: string) => new THREE.MeshStandardMaterial({ color, metalness, roughness, name });
  return {
    metal: m("#8d95a3", 0.8, 0.34, "pu-metal"),
    dark: m("#5a6170", 0.7, 0.42, "pu-dark-metal"),
    accent: m("#ffc93c", 0.55, 0.3, "pu-accent"),
    rubber: m("#2c2f37", 0.0, 0.86, "pu-rubber"),
    alloy: m("#d3dae5", 0.75, 0.36, "pu-alloy"),
    carbon: m("#3b4150", 0.25, 0.5, "pu-carbon"),
  };
}

/** Collects geometry per material, then emits one merged mesh per material under a named group. */
function part(id: PowerUnitPart) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (mat: THREE.Material, ...geos: THREE.BufferGeometry[]) => {
    const list = byMat.get(mat) ?? [];
    list.push(...geos.map((g) => (g.index || g.attributes.color ? place(g) : g)));
    byMat.set(mat, list);
  };
  const build = () => {
    const group = new THREE.Group();
    group.name = id;
    let i = 0;
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      if (!merged) throw new Error(`${id}: could not merge geometry`);
      for (const g of geos) g.dispose();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${id}-mesh-${i++}`;
      group.add(mesh);
    }
    return group;
  };
  return { add, build };
}

// ------------------------------------------------------------------------------ the parts

function ice(c: Palette) {
  const b = part("pu-ice");
  const x = 0.93;
  // Crankcase and sump: 0.55 m long, 0.36 m wide.
  b.add(c.metal, place(box(0.55, 0.2, 0.36, 0.025), { p: [x, 0.25, 0] }));
  b.add(c.dark, place(box(0.5, 0.06, 0.3, 0.015), { p: [x, 0.13, 0] }));
  // Two cylinder banks at 90 degrees, with a cam cover on each.
  for (const side of [1, -1]) {
    const tilt = side * (Math.PI / 4);
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
    const centre: V3 = [x, 0.4, side * 0.1];
    b.add(c.metal, place(box(0.52, 0.2, 0.15, 0.02), { p: centre, r: [tilt, 0, 0] }));
    // The cam cover stops short of the bank's rear end: the engine cover narrows to the tail, and a full-length one poked its gold corner out of the cover's side.
    b.add(c.accent, place(box(0.42, 0.045, 0.12, 0.018), { p: [x - 0.04, centre[1] + up.y * 0.12, centre[2] + up.z * 0.12], r: [tilt, 0, 0] }));
    // Exhaust primaries leaving the outer face of each bank.
    for (let k = 0; k < 3; k++) {
      b.add(c.dark, place(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12), { p: [x - 0.16 + k * 0.16, 0.36, side * 0.22], r: [side * 1.2, 0, 0] }));
    }
  }
  // Intake plenum in the vee, with trumpets down into each bank.
  b.add(c.dark, place(new THREE.CapsuleGeometry(0.06, 0.34, 6, 18).rotateZ(Math.PI / 2), { p: [x, 0.585, 0] }));
  for (let k = 0; k < 3; k++) {
    for (const side of [1, -1]) {
      b.add(c.metal, place(new THREE.CylinderGeometry(0.022, 0.026, 0.1, 12), { p: [x - 0.16 + k * 0.16, 0.53, side * 0.05], r: [side * 0.5, 0, 0] }));
    }
  }
  // Front timing cover.
  b.add(c.dark, place(box(0.04, 0.26, 0.3, 0.012), { p: [x - 0.29, 0.34, 0] }));
  return b.build();
}

function turbo(c: Palette) {
  const b = part("pu-turbo");
  const x = 1.32;
  const y = 0.56;
  // Compressor: a lathed housing with its inlet facing forward.
  const compressor = new THREE.LatheGeometry(
    [new THREE.Vector2(0.03, -0.05), new THREE.Vector2(0.05, -0.05), new THREE.Vector2(0.09, -0.01), new THREE.Vector2(0.095, 0.03), new THREE.Vector2(0.06, 0.05), new THREE.Vector2(0.03, 0.05)],
    28,
  ).rotateZ(Math.PI / 2);
  b.add(c.alloy, place(compressor, { p: [x - 0.08, y, 0] }));
  // Bearing housing and the turbine volute behind it.
  b.add(c.dark, place(cylX(0.04, 0.08), { p: [x, y, 0] }));
  b.add(c.metal, place(new THREE.TorusGeometry(0.06, 0.028, 12, 28).rotateY(Math.PI / 2), { p: [x + 0.07, y, 0] }));
  b.add(c.metal, place(cylX(0.055, 0.06), { p: [x + 0.07, y, 0] }));
  b.add(c.accent, place(cylX(0.098, 0.012), { p: [x - 0.03, y, 0] }));
  return b.build();
}

function mguK(c: Palette) {
  const b = part("pu-mgu-k");
  const [x, y, z] = [0.8, 0.2, -0.27];
  b.add(c.metal, place(cylX(0.07, 0.24, 28), { p: [x, y, z] }));
  for (let k = 0; k < 8; k++) b.add(c.dark, place(cylX(0.076, 0.008, 28), { p: [x - 0.1 + k * 0.028, y, z] }));
  b.add(c.accent, place(cylX(0.074, 0.02, 28), { p: [x + 0.13, y, z] }));
  b.add(c.dark, place(cylX(0.03, 0.05), { p: [x + 0.16, y, z] }));
  return b.build();
}

function energyStore(c: Palette) {
  const b = part("pu-energy-store");
  const [x, y] = [0.32, 0.11];
  // 0.45 x 0.12 x 0.35 m, flat under the fuel cell.
  b.add(c.carbon, place(box(0.45, 0.12, 0.35, 0.02), { p: [x, y, 0] }));
  for (let k = 0; k < 5; k++) b.add(c.dark, place(box(0.4, 0.012, 0.018, 0.004), { p: [x, y + 0.064, -0.12 + k * 0.06] }));
  b.add(c.accent, place(box(0.455, 0.02, 0.355, 0.006), { p: [x, y - 0.03, 0] }));
  return b.build();
}

function controlElectronics(c: Palette) {
  const b = part("pu-control-electronics");
  const [x, y, z] = [0.6, 0.31, -0.4];
  b.add(c.dark, place(box(0.28, 0.1, 0.18, 0.012), { p: [x, y, z] }));
  b.add(c.alloy, ...fins(9, 0.24, 0.035, 0.16).map((g) => place(g, { p: [x, y + 0.066, z] })));
  for (let k = 0; k < 3; k++) b.add(c.accent, place(cylX(0.012, 0.03, 12), { p: [x - 0.155, y - 0.02, z - 0.05 + k * 0.05] }));
  return b.build();
}

function radiator(c: Palette, side: 1 | -1) {
  const b = part(side === 1 ? "pu-radiator-left" : "pu-radiator-right");
  // Leaning back 25 degrees and toed out 18 degrees, as sidepod radiators sit.
  const at: Place = { p: [-0.2, 0.38, side * 0.5], r: [0, side * -0.32, -0.44] };
  const put = (g: THREE.BufferGeometry, local: V3 = [0, 0, 0]) => place(place(g, { p: local }), at);
  // Core: fins across the face, then the end tanks and the frame.
  b.add(c.alloy, ...fins(16, 0.05, 0.4, 0.3, 0.005).map((g) => put(g)));
  b.add(c.dark, put(box(0.07, 0.42, 0.02, 0.006), [0, 0, 0.16]), put(box(0.07, 0.42, 0.02, 0.006), [0, 0, -0.16]));
  b.add(c.metal, put(box(0.07, 0.03, 0.34, 0.008), [0, 0.22, 0]), put(box(0.07, 0.03, 0.34, 0.008), [0, -0.22, 0]));
  return b.build();
}

function intercooler(c: Palette) {
  const b = part("pu-intercooler");
  const [x, y, z] = [0.6, 0.35, 0.4];
  b.add(c.alloy, ...fins(12, 0.24, 0.16, 0.14, 0.004).map((g) => place(g, { p: [x, y, z] })));
  b.add(c.dark, place(box(0.26, 0.02, 0.16, 0.006), { p: [x, y + 0.09, z] }), place(box(0.26, 0.02, 0.16, 0.006), { p: [x, y - 0.09, z] }));
  // Charge pipes towards the plenum.
  b.add(c.metal, place(cylX(0.03, 0.14), { p: [x + 0.19, y + 0.03, z - 0.06] }));
  b.add(c.accent, place(cylX(0.034, 0.02), { p: [x + 0.13, y + 0.03, z - 0.06] }));
  return b.build();
}

function gearbox(c: Palette) {
  const b = part("pu-gearbox");
  // A 0.6 m casing behind the engine, tapering towards the back, extruded across the car.
  const profile = new THREE.Shape();
  profile.moveTo(0, 0);
  profile.lineTo(0.6, 0.05);
  profile.lineTo(0.6, 0.22);
  profile.lineTo(0, 0.3);
  profile.closePath();
  const casing = new THREE.ExtrudeGeometry(profile, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, steps: 1 });
  casing.translate(0, 0, -0.1);
  b.add(c.metal, place(casing, { p: [1.22, 0.15, 0] }));
  // Bell housing where the engine bolts on.
  b.add(c.dark, place(cylX(0.15, 0.06, 32), { p: [1.23, 0.3, 0] }));
  // Rear suspension pick-ups: brackets on each flank, and the pushrod rocker mounts on top.
  for (const side of [1, -1]) {
    for (const [px, py] of [
      [1.55, 0.25],
      [1.72, 0.26],
      [1.55, 0.36],
      [1.72, 0.34],
    ]) {
      b.add(c.accent, place(box(0.05, 0.035, 0.05, 0.008), { p: [px, py, side * 0.135] }));
    }
    b.add(c.dark, place(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 16), { p: [1.62, 0.42, side * 0.06] }));
  }
  return b.build();
}

function fuelCell(c: Palette) {
  const b = part("pu-fuel-cell");
  // A rubber bladder behind the driver: soft corners, under the airbox.
  b.add(c.rubber, place(box(0.55, 0.42, 0.6, 0.08), { p: [0.33, 0.41, 0] }));
  b.add(c.dark, place(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 20), { p: [0.2, 0.64, 0.12] }));
  b.add(c.accent, place(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 20), { p: [0.2, 0.668, 0.12] }));
  return b.build();
}

export interface PowerUnit {
  group: THREE.Group;
  names: readonly PowerUnitPart[];
}

/** Builds the power unit. Add `group` under the loaded scene root before the explode plan is made. */
export function createPowerUnit(): PowerUnit {
  const c = palette();
  const group = new THREE.Group();
  group.name = "power-unit";
  group.add(ice(c), turbo(c), mguK(c), energyStore(c), controlElectronics(c), radiator(c, 1), radiator(c, -1), intercooler(c), gearbox(c), fuelCell(c));
  return { group, names: POWER_UNIT_PARTS };
}
