/**
 * The BadCodes livery. The scanned car has four flat materials and no UVs, so the paint is worked
 * out in the fragment shader from each vertex's rest-pose world position (metres): a navy body, an
 * accent stripe that sweeps from the nose along the sidepods and up the engine cover, a thin ink
 * pinstripe under it and along the top centreline, matte carbon on the wings and floor, dark rubber
 * tyres with pale rims. No team names, no logos.
 *
 * Rest pose, not live world position: the explode moves parts, and a pattern read from the live
 * position would slide across them. Each mesh gets its own material carrying its rest matrix.
 *
 * The stage tints materials through `color` (the shader's `diffuse`) and `emissive`. The pattern
 * multiplies `diffuseColor` after it is set from `diffuse`, so hover glow and isolate dimming still
 * work: the base colour is white and the pattern supplies the paint.
 *
 * The wind tunnel passes a TunnelDeform: its uniforms bend the wing elements and the diffuser in the
 * vertex shader (the scan has one mesh per wing, so a flap cannot be moved as a node). Hinges and
 * regions are in rest-pose world metres, read off side profiles of the built model.
 */
import * as THREE from "three";

export const LIVERY_COLOURS = {
  /** The site's --bg navy, lifted so it still reads as navy under the stage's lights. */
  base: "#1e2b4c",
  accent: "#e8b84c",
  ink: "#f1f3f8",
  carbon: "#15171d",
  rubber: "#141519",
  rim: "#cdd3dc",
} as const;

/**
 * The showroom livery (the Car 26 design system): the exploded view's Formula F226 in pearl, so the
 * car never sinks into the dark studio, with a navy undercut and nose, a gold pinstripe on the line
 * between them and along the top centreline, satin carbon wing elements and floor, navy rear wing
 * endplates, pale rims and a soft-compound band on each tyre's sidewall.
 */
export const SHOWROOM_COLOURS = {
  pearl: "#f2f1ec",
  navy: "#1e2b4c",
  gold: "#e8b84c",
  carbon: "#1a1c21",
  rubber: "#141519",
  rim: "#cdd3dc",
  soft: "#e5484d",
} as const;

type Finish = "paint" | "carbon" | "satin" | "rubber" | "plain" | "pearl" | "tyre";

const FINISH: Record<string, Finish> = {
  chassis: "paint",
  "engine-cover": "paint",
  "left-sidepod": "paint",
  "right-sidepod": "paint",
  mirrors: "satin",
  "front-wing": "carbon",
  "rear-wing": "carbon",
  floor: "carbon",
  halo: "carbon",
  "front-suspension": "carbon",
  "rear-suspension": "carbon",
  "front-left-wheel": "rubber",
  "front-right-wheel": "rubber",
  "rear-left-wheel": "rubber",
  "rear-right-wheel": "rubber",
  exhaust: "plain",
};

export const COMMON_VERTEX = /* glsl */ `
uniform mat4 uRest;
varying vec3 vLivPos;
varying vec3 vLivNor;
varying vec3 vLivObj;
`;

/**
 * The pearl paint reads the continuous normal the build stores as _LIVNORMAL (scripts/lib/creased-normals.mjs):
 * the shading normal jumps at every crease, and a paint line decided from it would follow the mesh edges. A mesh
 * without the attribute (WebGL reads zero) falls back to the shading normal.
 */
export const PAINT_NORMAL_VERTEX = /* glsl */ `
attribute vec3 _livnormal;
`;

export const BEGIN_VERTEX = /* glsl */ `
vLivPos = (uRest * vec4(position, 1.0)).xyz;
vLivNor = normalize(mat3(uRest) * objectNormal);
vLivObj = position;
`;

/** Tunnel-only vertex code: which part this mesh is, and the shared deformation uniforms. */
export const PAINT_NORMAL_BEGIN = /* glsl */ `
if (dot(_livnormal, _livnormal) > 0.25) vLivNor = normalize(mat3(uRest) * _livnormal);
`;

export const DEFORM_VERTEX = /* glsl */ `
uniform mat4 uRestInv;
uniform int uPart;
uniform float uRearAoA;
uniform float uRearFlap;
uniform float uFrontFlap;
uniform float uFrontChord;
uniform float uDiffuser;

vec2 livRot(vec2 p, vec2 c, float a) {
  vec2 d = p - c;
  float s = sin(a);
  float k = cos(a);
  return c + vec2(k * d.x - s * d.y, s * d.x + k * d.y);
}

// Bends a rest-pose world point; ang returns the rotation applied about z, for the normal.
vec3 livDeform(vec3 w, out float ang) {
  ang = 0.0;
  if (uPart == 1) {
    // Rear wing: the three upper elements, inside the endplates.
    if (w.y > 0.735 && abs(w.z) < 0.52) {
      if (w.x > 2.2) { w.xy = livRot(w.xy, vec2(2.37, 0.91), uRearFlap); ang += uRearFlap; }
      w.xy = livRot(w.xy, vec2(1.93, 0.79), uRearAoA);
      ang += uRearAoA;
    }
  } else if (uPart == 2) {
    // Front wing: the flaps above the mainplane, outboard of the nose and inboard of the endplates.
    float az = abs(w.z);
    if (w.y > 0.196 && w.x > -2.72 && az > 0.25 && az < 0.86) {
      vec2 h = vec2(-2.62, 0.2);
      w.x = h.x + (w.x - h.x) * uFrontChord;
      w.xy = livRot(w.xy, h, uFrontFlap);
      ang += uFrontFlap;
    }
  } else if (uPart == 3) {
    // Floor: the diffuser ramp behind the kick point.
    float a = uDiffuser * smoothstep(1.3, 1.45, w.x) * step(w.y, 0.215) * step(abs(w.z), 0.62);
    w.xy = livRot(w.xy, vec2(1.33, 0.06), a);
    ang += a;
  }
  return w;
}
`;

export const DEFORM_NORMAL = /* glsl */ `
float livAng;
vec3 livW = livDeform((uRest * vec4(position, 1.0)).xyz, livAng);
{
  vec3 nw = mat3(uRest) * objectNormal;
  float s = sin(livAng);
  float k = cos(livAng);
  nw.xy = vec2(k * nw.x - s * nw.y, s * nw.x + k * nw.y);
  objectNormal = mat3(uRestInv) * nw;
}
`;

export const DEFORM_POSITION = /* glsl */ `
transformed = (uRestInv * vec4(livW, 1.0)).xyz;
`;

/** Shared by every tunnel material: set `.value` and the next frame shows it. Angles in radians. */
export interface TunnelDeform {
  uRearAoA: THREE.IUniform<number>;
  uRearFlap: THREE.IUniform<number>;
  uFrontFlap: THREE.IUniform<number>;
  uFrontChord: THREE.IUniform<number>;
  uDiffuser: THREE.IUniform<number>;
}

export function createTunnelDeform(): TunnelDeform {
  return { uRearAoA: { value: 0 }, uRearFlap: { value: 0 }, uFrontFlap: { value: 0 }, uFrontChord: { value: 1 }, uDiffuser: { value: 0 } };
}

export const DEFORM_PART: Record<string, number> = { "rear-wing": 1, "front-wing": 2, floor: 3 };

const COMMON_FRAGMENT = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uAccent;
uniform vec3 uInk;
uniform vec3 uRim;
uniform vec3 uWheelCentre;
uniform vec3 uWheelAxis;
uniform float uWheelRadius;
varying vec3 vLivPos;
varying vec3 vLivNor;
varying vec3 vLivObj;

float livHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// 1 inside [a, b] along v, antialiased by the screen-space rate of v.
float livBand(float v, float a, float b) {
  float w = max(fwidth(v), 1e-4);
  return smoothstep(a - w, a + w, v) - smoothstep(b - w, b + w, v);
}

// Height of the sweep: level along the nose, rising over the sidepods to the engine cover.
float livSweep(float x) { return mix(0.4, 0.8, smoothstep(-0.7, 1.9, x)); }

vec3 livPaint(vec3 p, vec3 n) {
  float f = livSweep(p.x);
  float side = smoothstep(0.15, 0.45, abs(n.z));
  float accent = livBand(p.y, f, f + 0.075) * side;
  float ink = livBand(p.y, f - 0.036, f - 0.022) * side;
  float top = smoothstep(0.55, 0.8, n.y);
  ink = max(ink, livBand(p.z, -0.012, 0.012) * top);
  accent = max(accent, (livBand(p.z, 0.03, 0.06) + livBand(p.z, -0.06, -0.03)) * top * step(0.1, p.x));
  vec3 c = mix(uBase, uAccent, clamp(accent, 0.0, 1.0));
  return mix(c, uInk, clamp(ink, 0.0, 1.0));
}

// A hard edge at edge: 0 below, 1 above, blended over about one pixel (the screen-space rate of v).
// The width is capped so a pixel straddling a crease (where a normal jumps) cannot smear the line.
float livStep(float v, float edge) {
  float w = clamp(fwidth(v), 1e-5, 0.1);
  return smoothstep(edge - w, edge + w, v);
}

// Showroom pearl: navy below an undercut line that rises toward the rear, navy on the nose tip and the
// underside, a gold pinstripe riding just above the line and down the top centreline. Every pearl and
// navy boundary is a livStep, so paint lines are crisp and antialiased instead of a blend over a
// distance; only the centreline stripe fades in along its length, where the roof turns to the flank.
vec3 livPearl(vec3 p, vec3 n) {
  float f = mix(0.3, 0.5, smoothstep(-1.4, 1.2, p.x));
  float above = p.y - f;
  float side = livStep(abs(n.z), 0.4);
  float under = (1.0 - livStep(above, 0.0)) * side;
  float nose = 1.0 - livStep(p.x, -2.3);
  float below = 1.0 - livStep(n.y, -0.475);
  float navy = max(max(under, nose), below);
  float top = smoothstep(0.55, 0.8, n.y);
  float gold = livBand(above, 0.012, 0.026) * side * (1.0 - nose);
  gold = max(gold, livBand(p.z, -0.012, 0.012) * top * livStep(p.x, -2.25));
  vec3 c = mix(uBase, uAccent, navy);
  return mix(c, uInk, clamp(gold, 0.0, 1.0));
}

// Twill carbon: tri-planar 2x2 weave, faded out where it would shimmer at a distance.
vec2 livPlanar(vec3 p, vec3 n) {
  vec3 a = abs(n);
  return a.x > a.y && a.x > a.z ? p.zy : (a.y > a.z ? p.xz : p.xy);
}
float livWeave(vec3 p, vec3 n) {
  vec2 uv = livPlanar(p, n) * 70.0;
  vec2 cell = floor(uv);
  float twill = mod(cell.x + floor(cell.y * 0.5), 2.0);
  float grain = livHash(cell);
  float fade = 1.0 - smoothstep(0.35, 0.9, length(fwidth(uv)));
  return mix(0.5, twill * 0.8 + grain * 0.2, fade);
}
`;

interface LiveryUniforms {
  [name: string]: THREE.IUniform;
  uRest: THREE.IUniform<THREE.Matrix4>;
  uBase: THREE.IUniform<THREE.Color>;
  uAccent: THREE.IUniform<THREE.Color>;
  uInk: THREE.IUniform<THREE.Color>;
  uRim: THREE.IUniform<THREE.Color>;
  uWheelCentre: THREE.IUniform<THREE.Vector3>;
  uWheelAxis: THREE.IUniform<THREE.Vector3>;
  uWheelRadius: THREE.IUniform<number>;
}

const FRAGMENT_BY_FINISH: Record<Finish, { colour: string; roughness: string }> = {
  paint: {
    colour: "diffuseColor.rgb *= livPaint(vLivPos, normalize(vLivNor));",
    roughness: "roughnessFactor = clamp(roughnessFactor + (livHash(floor(vLivPos.xz * 400.0)) - 0.5) * 0.04, 0.0, 1.0);",
  },
  carbon: {
    colour: "float livW = livWeave(vLivPos, normalize(vLivNor)); diffuseColor.rgb *= uBase * (0.7 + 0.6 * livW);",
    roughness: "roughnessFactor = clamp(roughnessFactor + (livW - 0.5) * 0.3, 0.0, 1.0);",
  },
  rubber: {
    colour: [
      "vec3 livD = vLivObj - uWheelCentre;",
      "float livR = length(livD - uWheelAxis * dot(livD, uWheelAxis)) / uWheelRadius;",
      "float livRim = 1.0 - smoothstep(0.6, 0.64, livR);",
      "float livLip = livBand(livR, 0.66, 0.68) * 0.6;",
      "diffuseColor.rgb *= mix(uBase, uRim, max(livRim, livLip));",
    ].join("\n"),
    roughness: "roughnessFactor = mix(roughnessFactor, 0.32, livRim);",
  },
  satin: {
    colour: "float livW = livWeave(vLivPos, normalize(vLivNor)); diffuseColor.rgb *= uBase * (0.7 + 0.6 * livW);",
    roughness: "roughnessFactor = clamp(roughnessFactor + (livW - 0.5) * 0.2, 0.0, 1.0);",
  },
  pearl: {
    colour: "diffuseColor.rgb *= livPearl(vLivPos, normalize(vLivNor));",
    roughness: "roughnessFactor = clamp(roughnessFactor + (livHash(floor(vLivPos.xz * 400.0)) - 0.5) * 0.03, 0.0, 1.0);",
  },
  tyre: {
    // A tyre on its own (the rim is separate geometry): the compound band sits on the sidewall.
    colour: [
      "vec3 livD = vLivObj - uWheelCentre;",
      "float livR = length(livD - uWheelAxis * dot(livD, uWheelAxis)) / uWheelRadius;",
      "float livBandC = livBand(livR, 0.8, 0.86);",
      "diffuseColor.rgb *= mix(uBase, uRim, livBandC);",
    ].join("\n"),
    roughness: "roughnessFactor = mix(roughnessFactor, 0.55, livBandC);",
  },
  plain: { colour: "", roughness: "" },
};

interface Paint {
  base: string;
  accent: string;
  ink: string;
  rim: string;
}

function liveryMaterial(
  finish: Finish,
  rest: THREE.Matrix4,
  wheel?: { centre: THREE.Vector3; axis: THREE.Vector3; radius: number },
  deform?: { uniforms: TunnelDeform; part: number },
): THREE.MeshStandardMaterial {
  const c = LIVERY_COLOURS;
  const s = SHOWROOM_COLOURS;
  const look: Record<Finish, { base: string; metalness: number; roughness: number }> = {
    paint: { base: c.base, metalness: 0.35, roughness: 0.34 },
    carbon: { base: c.carbon, metalness: 0.15, roughness: 0.58 },
    // The showroom's rim lights glint off glossier carbon at grazing angles and wash it grey.
    satin: { base: s.carbon, metalness: 0, roughness: 0.8 },
    rubber: { base: c.rubber, metalness: 0.05, roughness: 0.9 },
    plain: { base: "#8a8f99", metalness: 0.85, roughness: 0.3 },
    pearl: { base: s.pearl, metalness: 0.2, roughness: 0.3 },
    tyre: { base: s.rubber, metalness: 0.02, roughness: 0.85 },
  };
  const paint: Paint =
    finish === "pearl" ? { base: s.pearl, accent: s.navy, ink: s.gold, rim: s.rim } : finish === "tyre" ? { base: s.rubber, accent: s.navy, ink: s.gold, rim: s.soft } : { base: look[finish].base, accent: c.accent, ink: c.ink, rim: c.rim };
  const { metalness, roughness } = look[finish];
  const base = paint.base;
  const mat = new THREE.MeshStandardMaterial({
    name: `livery-${finish}`,
    // Plain parts carry their colour in `color`; patterned parts keep `color` white and paint in the shader.
    color: finish === "plain" ? base : "#ffffff",
    metalness,
    roughness,
    side: THREE.DoubleSide,
  });
  if (finish === "plain") return mat;
  const uniforms: LiveryUniforms = {
    uRest: { value: rest.clone() },
    uBase: { value: new THREE.Color(paint.base) },
    uAccent: { value: new THREE.Color(paint.accent) },
    uInk: { value: new THREE.Color(paint.ink) },
    uRim: { value: new THREE.Color(paint.rim) },
    uWheelCentre: { value: wheel?.centre.clone() ?? new THREE.Vector3() },
    uWheelAxis: { value: wheel?.axis.clone() ?? new THREE.Vector3(0, 0, 1) },
    uWheelRadius: { value: wheel?.radius ?? 1 },
  };
  const frag = FRAGMENT_BY_FINISH[finish];
  const bend = deform ? { ...deform.uniforms, uPart: { value: deform.part }, uRestInv: { value: rest.clone().invert() } } : null;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, bend ?? {});
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON_VERTEX}${finish === "pearl" ? PAINT_NORMAL_VERTEX : ""}${bend ? DEFORM_VERTEX : ""}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${bend ? DEFORM_NORMAL : ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${bend ? DEFORM_POSITION : ""}${BEGIN_VERTEX}${finish === "pearl" ? PAINT_NORMAL_BEGIN : ""}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON_FRAGMENT}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${frag.colour}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${frag.roughness}`);
  };
  // One program per finish: the uniforms differ per mesh, the source does not.
  mat.customProgramCacheKey = () => `badcodes-livery-${finish}${bend ? "-bend" : ""}`;
  return mat;
}

/** Wheel axis and radius in the mesh's own (quantised) vertex space: the thinnest bounds axis. */
function wheelFrame(geo: THREE.BufferGeometry) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const size = b.getSize(new THREE.Vector3());
  const centre = b.getCenter(new THREE.Vector3());
  const axisIndex = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
  const axis = new THREE.Vector3().setComponent(axisIndex, 1);
  const radius = Math.max(...[size.x, size.y, size.z].filter((_, i) => i !== axisIndex)) / 2;
  return { centre, axis, radius };
}

/**
 * Paints the car: call on the loaded scene root, before the explode plan is made (it reads the rest
 * pose). Parts not in the livery table, such as the procedural power unit, keep their materials.
 */
export function applyLivery(root: THREE.Object3D, deform?: TunnelDeform): void {
  root.updateMatrixWorld(true);
  for (const [id, finish] of Object.entries(FINISH)) {
    const node = root.getObjectByName(id);
    if (!node) continue;
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const part = deform ? DEFORM_PART[id] : undefined;
      mesh.material = liveryMaterial(finish, mesh.matrixWorld, finish === "rubber" ? wheelFrame(mesh.geometry) : undefined, part && deform ? { uniforms: deform, part } : undefined);
      for (const m of old) m.dispose();
    });
  }
}

/** The Formula F226's material names, as its source file has them, to a showroom finish. */
const SHOWROOM_FINISH: Record<string, Finish> = {
  BodyLivery: "pearl",
  FrontEndplateLivery: "pearl",
  FrontWingLivery: "satin",
  RearWingLivery: "satin",
  AeroLivery: "satin",
  Carbon: "satin",
  "Carbon.001": "satin",
  "Carbon.002": "satin",
  "Carbon.003": "satin",
  material_0: "satin",
  Tyre: "tyre",
};

/** Flat showroom materials: no pattern, just a colour and a surface. */
const SHOWROOM_PLAIN: Record<string, THREE.MeshStandardMaterialParameters> = {
  RearEndplateLivery: { color: SHOWROOM_COLOURS.navy, metalness: 0.2, roughness: 0.32 },
  Cover: { color: SHOWROOM_COLOURS.rim, metalness: 0.8, roughness: 0.28 },
  Metal: { color: "#9aa0ab", metalness: 0.9, roughness: 0.3 },
  Screen: { color: "#0b0c0f", metalness: 0.1, roughness: 0.2 },
  Redlight: { color: "#3a0b0b", emissive: "#e5484d", emissiveIntensity: 1.4, roughness: 0.4 },
};

/**
 * Paints the exploded view's Formula F226 in the showroom livery: call on the loaded scene root
 * before the explode plan is made. Materials are matched by the source's names, which the build
 * keeps; an unknown name is left as loaded.
 */
export function applyShowroomLivery(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const shared = new Map<string, THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = old.map((m) => {
      const finish = SHOWROOM_FINISH[m.name];
      if (finish) return liveryMaterial(finish, mesh.matrixWorld, finish === "tyre" ? wheelFrame(mesh.geometry) : undefined);
      const plain = SHOWROOM_PLAIN[m.name];
      if (!plain) return m;
      if (!shared.has(m.name)) shared.set(m.name, new THREE.MeshStandardMaterial({ name: `showroom-${m.name}`, side: THREE.DoubleSide, ...plain }));
      return shared.get(m.name)!;
    });
    for (const m of old) if (!next.includes(m)) m.dispose();
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}
