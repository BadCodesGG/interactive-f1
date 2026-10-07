/**
 * What the lap drives on, drawn by one shader in one draw call: the tarmac with its edge lines and the start
 * line, red and white kerbs on the inside of the bends and on the exits (lap-track.ts says where), a run-off
 * beside them, and a ground that runs on to the horizon. The road is a ribbon of strips along the track, each
 * strip tagged with the zone it belongs to; the ground is one large quad under them. Everything is procedural
 * (no textures), and the distance is taken out by fading alpha, not colour, so what lies far off is the page
 * itself whichever theme it is in. lap-scene.ts moves it under the car; this only knows how it looks.
 */
import * as THREE from "three";
import { kerbAmounts, ROAD_WIDTH, type Track } from "@/models/f1/lap-track";

/** Zones of the circuit: what a strip of the ribbon is. */
export const ZONE = { road: 0, kerb: 1, runoff: 2, ground: 3 } as const;
/** A kerb's width at its fullest, metres, and the run-off's beside the road. */
export const KERB_WIDTH = 1.7;
export const RUNOFF_WIDTH = 14;
/** The ground runs this far past the circuit's own extent, metres: beyond where the fade has taken it. */
export const GROUND_MARGIN = 1400;
/** Distance at which the circuit is 37 percent visible, metres; it is gone at about twice that (and at the horizon, sooner). */
export const FOG_DISTANCE = 320;
/** The angle below the camera's level (its sine) over which the ground fades into the haze at the horizon. */
const HAZE = 0.05;
/** Length of one red or white block of kerb, metres. */
const KERB_BLOCK = 1.3;
/** Distance between the floodlights a night lap drives under, metres. */
const LAMP_SPACING = 38;

/**
 * The circuit's colours as they should look on screen, per theme: the light theme is a daytime race, the dark a
 * night one. The stage tone maps with Khronos Neutral, which takes a dark colour down and blue (forNeutralTone
 * undoes that), so these are written as the sRGB the eye should get.
 */
export const CIRCUIT_COLOURS = {
  light: { road: "#4d5159", line: "#e6e8eb", kerbA: "#c8282f", kerbB: "#e9ecef", runoff: "#bfb9a5", ground: "#88a272", night: 0 },
  dark: { road: "#3b424d", line: "#b9c0cb", kerbA: "#bd242c", kerbB: "#cfd4dc", runoff: "#0e1013", ground: "#050706", night: 1 },
} as const;

/** The stage's exposure per theme (RENDER in stage.tsx), which the tone mapping multiplies the light by. */
export const EXPOSURE = { light: 0.8, dark: 1 } as const;

/**
 * The colour to put in the shader so that, after the stage's exposure and Khronos Neutral tone mapping, it is
 * `hex` on screen. Neutral takes an offset off every channel (the dark ones hardest: 0.4 sqrt(m) - m of the
 * darkest, m, below 0.04) and leaves the colours below 0.76 otherwise alone; this adds it back. A colour that
 * would be compressed at the top (a white, in the light theme's exposure) comes out a little under.
 */
export function forNeutralTone(hex: string, exposure: number): THREE.Color {
  const c = new THREE.Color(hex);
  const darkest = Math.min(c.r, c.g, c.b);
  const offset = darkest < 0.04 ? 0.4 * Math.sqrt(darkest) - darkest : 0.04;
  return new THREE.Color((c.r + offset) / exposure, (c.g + offset) / exposure, (c.b + offset) / exposure);
}

/** The strips of the ribbon, and the ground, as one indexed geometry: position, how far across the road, how far along the lap, and the zone. */
export function circuitGeometry(track: Track): THREE.BufferGeometry {
  const n = track.count;
  const half = ROAD_WIDTH / 2;
  const kerbs = kerbAmounts(track);
  const position: number[] = [];
  const across: number[] = [];
  const along: number[] = [];
  const zone: number[] = [];
  const index: number[] = [];

  /** A strip of two vertices a sample, from `inner` to `outer` metres across (signed: the left is positive), closed on the start. */
  const strip = (z: number, inner: (i: number) => number, outer: (i: number) => number) => {
    const first = across.length;
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      const nx = -Math.sin(track.heading[j]);
      const ny = Math.cos(track.heading[j]);
      const s = i === n ? track.length : i * track.step;
      for (const a of [inner(j), outer(j)]) {
        position.push(track.x[j] + nx * a, 0, -(track.y[j] + ny * a));
        across.push(a);
        along.push(s);
        zone.push(z);
      }
    }
    for (let i = 0; i < n; i++) {
      const v = first + i * 2;
      index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  };

  // The ground first: what is drawn later is drawn over it.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minY = Math.min(minY, track.y[i]);
    maxY = Math.max(maxY, track.y[i]);
  }
  const base = across.length;
  for (const [x, y] of [[minX - GROUND_MARGIN, minY - GROUND_MARGIN], [maxX + GROUND_MARGIN, minY - GROUND_MARGIN], [minX - GROUND_MARGIN, maxY + GROUND_MARGIN], [maxX + GROUND_MARGIN, maxY + GROUND_MARGIN]]) {
    position.push(x, 0, -y);
    across.push(0);
    along.push(0);
    zone.push(ZONE.ground);
  }
  index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);

  strip(ZONE.runoff, () => half, () => half + RUNOFF_WIDTH);
  strip(ZONE.runoff, () => -half, () => -(half + RUNOFF_WIDTH));
  strip(ZONE.kerb, () => half, (i) => half + KERB_WIDTH * kerbs.left[i]);
  strip(ZONE.kerb, () => -half, (i) => -(half + KERB_WIDTH * kerbs.right[i]));
  strip(ZONE.road, () => -half, () => half);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aAcross", new THREE.Float32BufferAttribute(across, 1));
  geometry.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute("aZone", new THREE.Float32BufferAttribute(zone, 1));
  geometry.setIndex(index);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return geometry;
}

const VERTEX = /* glsl */ `
attribute float aAcross;
attribute float aAlong;
attribute float aZone;
varying float vAcross;
varying float vAlong;
varying float vZone;
varying vec2 vTrack;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vAcross = aAcross;
  vAlong = aAlong;
  vZone = aZone;
  vTrack = position.xz;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 v = viewMatrix * w;
  // The position, not its length: the ground is two triangles thousands of metres across, and a distance
  // interpolated between their corners would be nowhere near the distance at a pixel.
  vView = v.xyz;
  gl_Position = projectionMatrix * v;
}`;

// Every pattern is filtered by how much road a pixel covers (fwidth), so a line or a kerb block a pixel
// wide fades into its surroundings instead of shimmering as it goes by.
const FRAGMENT = /* glsl */ `
#define HAZE ${HAZE.toFixed(3)}
uniform vec3 uRoad;
uniform vec3 uLine;
uniform vec3 uKerbA;
uniform vec3 uKerbB;
uniform vec3 uRunoff;
uniform vec3 uGround;
uniform vec3 uAccent;
uniform float uNight;
uniform float uHalf;
uniform float uFog;
varying float vAcross;
varying float vAlong;
varying float vZone;
varying vec2 vTrack;
varying vec3 vView;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Coverage of the band [a, b] of x by a pixel w wide.
float band(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x);
}

void main() {
  float a = abs(vAcross);
  float aw = max(fwidth(vAcross), 1e-4);
  float sw = max(fwidth(vAlong), 1e-4);
  float px = max(max(fwidth(vTrack.x), fwidth(vTrack.y)), 1e-4);
  // Fine grain is lost, not aliased, once a pixel covers more than a metre or two.
  float fine = 1.0 - smoothstep(0.6, 3.0, px);
  float grain = vnoise(vTrack * 0.35) * 0.6 + vnoise(vTrack * 1.9) * 0.4 * fine;
  // A floodlight every LAMP metres on a night lap: a pool of light that runs back past the car.
  float lamp = 0.5 + 0.5 * cos(6.2831853 * vAlong / ${LAMP_SPACING.toFixed(1)});
  float lit = 1.0 + uNight * 0.45 * lamp * lamp;
  vec3 col;
  if (vZone < 0.5) {
    col = uRoad * (0.9 + 0.2 * grain);
    // The rubbered line the cars wear into the tarmac, a little darker than the rest.
    col *= 1.0 - 0.1 * band(a, 1.0, 3.2, max(aw, 0.7));
    float edge = band(a, uHalf - 0.55, uHalf - 0.17, aw);
    // The start line: a chequer of the livery's accent and white, two blocks deep.
    float chequer = mod(floor(vAcross / 1.3) + floor(vAlong / 1.3), 2.0);
    float start = band(vAlong, 0.0, 2.6, sw) * (1.0 - smoothstep(uHalf - 0.6, uHalf - 0.2, a));
    col = mix(col, mix(uLine, uAccent, chequer), start);
    col = mix(col, uLine, edge * (1.0 - start));
    col *= lit;
  } else if (vZone < 1.5) {
    float block = fract(vAlong / ${(KERB_BLOCK * 2).toFixed(2)});
    float w = sw / ${(KERB_BLOCK * 2).toFixed(2)};
    // Red for the first half of a double block, white for the second; a block too narrow to tell apart is their mean.
    float white = smoothstep(0.5 - w, 0.5 + w, block) * (1.0 - smoothstep(1.0 - w, 1.0, block));
    col = mix(mix(uKerbA, uKerbB, white), 0.5 * (uKerbA + uKerbB), smoothstep(0.25, 0.7, w));
    col *= 0.94 + 0.12 * grain;
    col *= lit;
  } else if (vZone < 2.5) {
    col = uRunoff * (0.88 + 0.24 * grain) * lit;
  } else {
    // Mown in broad stripes, which also show how fast the ground is going by.
    float mow = smoothstep(-0.2, 0.2, sin(dot(vTrack, vec2(0.6, 0.8)) * 0.11)) * (1.0 - smoothstep(4.0, 30.0, px));
    col = uGround * (0.86 + 0.28 * grain + 0.1 * mow);
  }
  // Out of sight with distance, and into a haze at the horizon: how far the point is below the camera's own
  // level, as the sine of the angle it is seen at, so the far edge is a gradient and not a line.
  float dist = length(vView);
  float depression = (cameraPosition.y - vWorld.y) / max(dist, 1e-3);
  float alpha = exp(-pow(dist / uFog, 2.0)) * smoothstep(0.0, HAZE, depression);
  // Noise of about one output step, so a slow fade does not band into rings.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(col, alpha + dither * 0.02);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface CircuitUniforms {
  uRoad: THREE.IUniform<THREE.Color>;
  uLine: THREE.IUniform<THREE.Color>;
  uKerbA: THREE.IUniform<THREE.Color>;
  uKerbB: THREE.IUniform<THREE.Color>;
  uRunoff: THREE.IUniform<THREE.Color>;
  uGround: THREE.IUniform<THREE.Color>;
  uAccent: THREE.IUniform<THREE.Color>;
  uNight: THREE.IUniform<number>;
  uHalf: THREE.IUniform<number>;
  uFog: THREE.IUniform<number>;
}

export function circuitMaterial(): { material: THREE.ShaderMaterial; uniforms: CircuitUniforms } {
  const uniforms: CircuitUniforms = {
    uRoad: { value: new THREE.Color() },
    uLine: { value: new THREE.Color() },
    uKerbA: { value: new THREE.Color() },
    uKerbB: { value: new THREE.Color() },
    uRunoff: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
    uNight: { value: 0 },
    uHalf: { value: ROAD_WIDTH / 2 },
    uFog: { value: FOG_DISTANCE },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: uniforms as unknown as Record<string, THREE.IUniform>, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return { material, uniforms };
}

/** Puts a theme's colours, and the livery's accent, on the circuit's uniforms. */
export function paintCircuit(uniforms: CircuitUniforms, theme: keyof typeof CIRCUIT_COLOURS, accent: string): void {
  const c = CIRCUIT_COLOURS[theme];
  const tone = (hex: string) => forNeutralTone(hex, EXPOSURE[theme]);
  uniforms.uRoad.value.copy(tone(c.road));
  uniforms.uLine.value.copy(tone(c.line));
  uniforms.uKerbA.value.copy(tone(c.kerbA));
  uniforms.uKerbB.value.copy(tone(c.kerbB));
  uniforms.uRunoff.value.copy(tone(c.runoff));
  uniforms.uGround.value.copy(tone(c.ground));
  uniforms.uAccent.value.copy(tone(accent));
  uniforms.uNight.value = c.night;
}
