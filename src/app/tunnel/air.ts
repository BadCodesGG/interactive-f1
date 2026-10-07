/**
 * The tunnel's hairline streaks and tumbling flakes (air-config.ts says what they are). One small
 * GPUComputationRenderer carries both: streak particles first, flake particles after, advected by the
 * same velocity field as the smoke (field.ts, so they curve round the same car) at their own multiple
 * of the freestream. Streaks draw as thin screen-space ribbons, one quad per link of each burst
 * (ribbon.ts's chains), bright in the middle and fading at both ends; flakes draw as instanced quads
 * spun about a random axis, with a sheen that glints as they turn.
 */
import * as THREE from "three";
import { GPUComputationRenderer, type Variable } from "three/addons/misc/GPUComputationRenderer.js";
import { AIR, GOLDEN, PLASTIC, airCount, airSide, debrisLife, debrisSeeds, initialPhase, streakBurst, streakLife, streakParticles, streakSpacing, type AirConfig } from "./air-config";
import { CONSTS, f, velocityShader } from "./field";
import type { FlowParams } from "./flow";
import type { TunnelLook } from "./look";
import { STENCIL, ribbonGeometry } from "./ribbon";
import type { SdfHeader } from "@/models/f1/sdf-format";

/** Streaks move three times as far a step as the smoke does, so they take twice the steps: neighbours in a burst then land alike and the hairline stays smooth. */
const SUBSTEPS = 16;
/** Across a streak the falloff is gaussian with this sharpness, so its full width at half height is `FWHM` of the quad's. */
const SHARP = 6;
const FWHM = 2 * Math.sqrt(Math.LN2 / SHARP) / 2;
/** The light the flakes catch, the key light's direction (tunnel-stage.tsx). */
const LIGHT = new THREE.Vector3(-3, 5, 4).normalize();

const DEFS = /* glsl */ `
#define MUL_S ${f(AIR.streak.speedMul)}
#define MUL_D ${f(AIR.debris.speedMul)}
#define WANDER_S ${f(AIR.streak.wander)}
#define WANDER_D ${f(AIR.debris.wander)}
`;

const VELOCITY_PRE = /* glsl */ `
${DEFS}
uniform float uStreakCount;
// Streaks are the first uStreakCount texels and ride faster than the flakes after them.
float mulOf(vec2 uv) {
  vec2 t = floor(uv * resolution);
  return t.y * resolution.x + t.x < uStreakCount ? MUL_S : MUL_D;
}
`;

const POSITION = /* glsl */ `
${CONSTS}
${DEFS}
#define GOLDEN ${GOLDEN.toFixed(10)}
#define PLASTIC ${PLASTIC.toFixed(10)}
#define BURST ${streakBurst().toFixed(10)}
#define NEAR ${f(AIR.streak.near)}
#define BELOW ${f(AIR.streak.near + AIR.streak.below)}
#define STREAK_X ${f(AIR.streak.spawnX)}
#define DEBRIS_X0 ${f(AIR.debris.spawnX[0])}
#define DEBRIS_X1 ${f(AIR.debris.spawnX[1])}
uniform float uDt;
uniform float uSpeed;
uniform float uClockS;
uniform float uClockD;
uniform float uLifeS;
uniform float uLifeD;
uniform float uStreakN;
uniform float uStreakCount;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Where burst number 'key' of streak s is released: mostly in a thin shell that hugs the body, so it passes
// over the nose and cockpit and beside the sidepods; some from below, the rest wide, beside and above.
vec3 streakSpawn(float s, float key) {
  float k = mod(key, 4096.0);
  float a = hash(vec2(s * 1.7 + 0.3, k * 0.37 + 1.1));
  float b = hash(vec2(s * 3.1 + 7.7, k * 0.91 + 2.3));
  float zone = hash(vec2(s * 5.3 + 1.9, k * 1.7 + 4.1));
  // Three in four from the camera's side, where they can be seen.
  float side = hash(vec2(s * 2.3 + 3.3, k * 0.53 + 9.9)) < 0.75 ? 1.0 : -1.0;
  float y;
  float z;
  if (zone < NEAR) { y = mix(0.05, 1.25, a); z = side * mix(0.3, 0.8, b); }
  else if (zone < BELOW) { y = mix(0.04, 0.3, a); z = mix(-1.0, 1.0, b); }
  else { y = mix(0.06, 2.1, a); z = side * mix(0.8, 1.7, b); }
  return vec3(STREAK_X, y, z);
}

// Flakes: within about 0.6 m of the car, upstream of it, and carried by the field into its wake.
vec3 debrisSpawn(float d, float key) {
  float k = mod(key, 4096.0);
  float a = hash(vec2(d * 0.731 + 1.3, k * 0.173 + 0.7));
  float b = hash(vec2(d * 1.913 + 4.1, k * 0.291 + 2.9));
  float c = hash(vec2(d * 3.217 + 9.7, k * 0.517 + 5.3));
  return vec3(mix(DEBRIS_X0, DEBRIS_X1, a), mix(0.03, ${f(AIR.debris.spawnY)}, b), mix(-1.0, 1.0, c) * ${f(AIR.debris.spawnZ)});
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec3 v = texture2D(textureVelocity, uv).xyz;
  vec3 p = pos.xyz + v * uDt;
  p.y = max(p.y, 0.012);
  float i = floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);
  bool streak = i < uStreakCount;
  float life = streak ? uLifeS : uLifeD;
  float phase = pos.w + uDt / life;
  if (phase >= 1.0) {
    // Released part-way through the step, by the time it overshot its life (as the smoke's nozzles do).
    float over = (phase - 1.0) * life;
    phase -= 1.0;
    // The cycle number is the whole part of the phase clock plus this particle's (or its streak's) offset:
    // every link of a burst wraps under the same number, so they share a spawn point.
    vec3 at;
    if (streak) {
      float s = mod(i, uStreakN);
      at = streakSpawn(s, floor(uClockS + BURST + (1.0 - BURST) * fract(s * GOLDEN)));
    } else {
      float d = i - uStreakCount;
      at = debrisSpawn(d, floor(uClockD + fract((d + 0.5) * PLASTIC)));
    }
    p = at + vec3(min(over, uDt) * uSpeed * (streak ? MUL_S : MUL_D), 0.0, 0.0);
  }
  gl_FragColor = vec4(p, phase);
}
`;

const STREAK_VERTEX = /* glsl */ `
${CONSTS}
uniform sampler2D tPos;
uniform float uWidth;
uniform float uChain;
uniform vec2 uViewport;
attribute vec2 refA;
attribute vec2 refB;
attribute vec2 refS0;
attribute vec2 refS1;
attribute vec2 corner;
attribute vec2 seed;
varying float vAcross;
varying float vAlpha;

const float PI = 3.14159265;
// Links of a burst are a fixed sliver of phase apart, the younger the later in the chain; anything else
// (across a release, or the ring's seam) is not part of the line.
#define SPACING ${streakSpacing().toFixed(8)}
bool ordered(vec4 a, vec4 b) {
  float d = b.w - a.w;
  return d > -SPACING * ${f(STENCIL + 2)} && d < SPACING * 0.5;
}

void main() {
  vec4 A = texture2D(tPos, refA);
  vec4 B = texture2D(tPos, refB);
  vec4 S0 = texture2D(tPos, refS0);
  vec4 S1 = texture2D(tPos, refS1);
  // Whole links only, and thinning out as a burst is pulled apart.
  float link = ordered(A, B) ? 1.0 - smoothstep(0.12, 0.35, distance(A.xyz, B.xyz)) : 0.0;
  bool head = corner.x > 0.5;
  vec4 X = head ? B : A;
  // Drawn for the first ${f(AIR.streak.duty)} of the cycle only: the rest is spent beyond the outlet, unseen.
  float age = X.w / ${f(AIR.streak.duty)};
  if (link <= 0.0 || age >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAcross = 0.0; vAlpha = 0.0;
    return;
  }
  vec3 before = ordered(S0, X) ? S0.xyz : X.xyz;
  vec3 after = ordered(X, S1) ? S1.xyz : X.xyz;
  mat4 vp = projectionMatrix * modelViewMatrix;
  vec4 cX = vp * vec4(X.xyz, 1.0);
  vec4 cB = vp * vec4(before, 1.0);
  vec4 cA = vp * vec4(after, 1.0);
  vec2 dir = (cA.xy / cA.w - cB.xy / cB.w) * 0.5 * uViewport;
  dir = dot(dir, dir) > 1e-8 ? normalize(dir) : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  // Peaks mid-life (mid-box), and along the burst peaks in its middle: bright in the middle, fading at both ends.
  float along = sin(PI * (seed.x + (head ? 1.0 : 0.0)) / uChain);
  float alpha = sin(PI * age) * along * link * (1.0 - smoothstep(BOX_X1 - 1.0, BOX_X1, X.x));

  gl_Position = cX;
  gl_Position.xy += normal * corner.y * uWidth / uViewport * cX.w;
  vAcross = corner.y;
  vAlpha = alpha;
}
`;

const STREAK_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAcross;
varying float vAlpha;
void main() {
  float tail = exp(-${f(SHARP)});
  float edge = (exp(-${f(SHARP)} * vAcross * vAcross) - tail) / (1.0 - tail);
  gl_FragColor = vec4(uColor, edge * vAlpha * uOpacity);
  #include <colorspace_fragment>
}
`;

const FLAKE_VERTEX = /* glsl */ `
${CONSTS}
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uTime;
attribute vec2 ref;
attribute vec4 seed;
attribute vec3 axis;
varying float vAlpha;
varying vec3 vNormal;
varying vec3 vView;

vec3 rotate(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

void main() {
  vec4 P = texture2D(tPos, ref);
  // seed: edge (m), spin (rad/s), start angle, resting tilt about x.
  vec3 local = rotate(vec3(position.xy * seed.x, 0.0), vec3(1.0, 0.0, 0.0), seed.w);
  vec3 normal = rotate(vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), seed.w);
  float turn = seed.z + seed.y * uTime;
  vec3 offset = rotate(local, axis, turn);
  // Motion blur: stretched along its velocity, more the faster it goes.
  vec3 vel = texture2D(tVel, ref).xyz;
  float speed = length(vel);
  vec3 along = speed > 1e-3 ? vel / speed : vec3(1.0, 0.0, 0.0);
  offset += along * dot(offset, along) * clamp(speed * ${f(AIR.debris.stretch)}, 0.0, ${f(AIR.debris.maxStretch)});
  vec3 world = P.xyz + offset;
  vNormal = rotate(normal, axis, turn);
  vView = cameraPosition - world;
  // In from the release, out over the last of the life and at the outlet.
  vAlpha = smoothstep(0.0, 0.05, P.w) * (1.0 - smoothstep(0.85, 1.0, P.w)) * (1.0 - smoothstep(BOX_X1 - 1.4, BOX_X1 - 0.3, P.x));
  // None in the sky.
  vAlpha *= 1.0 - smoothstep(${f(AIR.debris.ceiling - 0.1)}, ${f(AIR.debris.ceiling + 0.1)}, P.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FLAKE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uLight;
varying float vAlpha;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  if (vAlpha <= 0.003) discard;
  vec3 V = normalize(vView);
  vec3 n = normalize(vNormal);
  if (dot(n, V) < 0.0) n = -n;
  // The face turned to the key light is light, the one turned away is dark: a flake flips between the two as it tumbles.
  float lit = smoothstep(-0.1, 0.55, dot(n, uLight));
  float glint = pow(max(dot(n, normalize(uLight + V)), 0.0), 24.0);
  gl_FragColor = vec4(uColor * mix(0.45, 1.15, lit) + vec3(glint) * 0.9, vAlpha * uOpacity);
  #include <colorspace_fragment>
}
`;

export class Air {
  readonly object: THREE.Group;
  private gpu: GPUComputationRenderer;
  private pos: Variable;
  private vel: Variable;
  private streaks: THREE.Mesh;
  private flakes: THREE.Mesh;
  private streakMaterial: THREE.ShaderMaterial;
  private flakeMaterial: THREE.ShaderMaterial;
  private cfg: AirConfig;
  private time = 0;
  private clockS = 0;
  private clockD = 0;
  private speed = 2;
  private settled = false;

  constructor(renderer: THREE.WebGLRenderer, sdfTexture: THREE.Data3DTexture, sdf: SdfHeader, cfg: AirConfig) {
    this.cfg = cfg;
    const side = airSide(cfg);
    const total = airCount(cfg);
    const nStreak = streakParticles(cfg);
    this.gpu = new GPUComputationRenderer(side, side, renderer);
    this.gpu.setDataType(renderer.extensions.has("EXT_color_buffer_float") ? THREE.FloatType : THREE.HalfFloatType);
    const pos0 = this.gpu.createTexture();
    const vel0 = this.gpu.createTexture();
    const p = pos0.image.data as Float32Array;
    for (let i = 0; i < side * side; i++) {
      // Every texel starts spent (phase + 1), so the first step releases it at its spawn point; settle() then runs the field on.
      p.set([AIR.streak.spawnX, 1, 0, i < total ? initialPhase(cfg, i) + 1 : 0.5], i * 4);
    }
    this.vel = this.gpu.addVariable("textureVelocity", velocityShader(VELOCITY_PRE, "uSpeed * mulOf(uv)", "TURB_LAMINAR * (mulOf(uv) > 1.5 ? WANDER_S : WANDER_D)"), vel0);
    this.pos = this.gpu.addVariable("texturePosition", POSITION, pos0);
    this.gpu.setVariableDependencies(this.vel, [this.pos, this.vel]);
    this.gpu.setVariableDependencies(this.pos, [this.pos, this.vel]);
    Object.assign(this.vel.material.uniforms, {
      uSdf: { value: sdfTexture },
      uMin: { value: new THREE.Vector3(...sdf.min) },
      uMax: { value: new THREE.Vector3(...sdf.max) },
      uRange: { value: sdf.range },
      uSpeed: { value: 2 },
      uTime: { value: 0 },
      uDownwash: { value: 0.45 },
      uDiffuserUp: { value: 0.12 },
      uStreakCount: { value: nStreak },
    });
    Object.assign(this.pos.material.uniforms, {
      uDt: { value: 0 },
      uSpeed: { value: 2 },
      uClockS: { value: 0 },
      uClockD: { value: 0 },
      uLifeS: { value: streakLife(2) },
      uLifeD: { value: debrisLife(2) },
      uStreakN: { value: cfg.streaks },
      uStreakCount: { value: nStreak },
    });
    const error = this.gpu.init();
    if (error) throw new Error(`Air: ${error}`);

    // Streaks: one quad per link of each burst's ring of particles.
    const ribbon = ribbonGeometry(side, cfg.streaks, nStreak);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((ribbon.corner.length / 2) * 3), 3));
    for (const [name, data] of Object.entries({ refA: ribbon.refA, refB: ribbon.refB, refS0: ribbon.refS0, refS1: ribbon.refS1, corner: ribbon.corner, seed: ribbon.seed })) {
      geo.setAttribute(name, new THREE.BufferAttribute(data, 2));
    }
    geo.setIndex(new THREE.BufferAttribute(ribbon.index, 1));
    this.streakMaterial = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERTEX,
      fragmentShader: STREAK_FRAGMENT,
      uniforms: {
        tPos: { value: null },
        uWidth: { value: 4 },
        uChain: { value: AIR.streak.links },
        uViewport: { value: new THREE.Vector2(1440, 900) },
        uColor: { value: new THREE.Color("#ffffff") },
        uOpacity: { value: 0.9 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.streaks = new THREE.Mesh(geo, this.streakMaterial);
    this.streaks.frustumCulled = false;
    const size = new THREE.Vector2();
    this.streaks.onBeforeRender = (r) => {
      r.getDrawingBufferSize(size);
      this.streakMaterial.uniforms.uViewport.value.copy(size);
      // The quad is wider than the line drawn inside it: a line a pixel and a bit wide, in CSS pixels.
      this.streakMaterial.uniforms.uWidth.value = (AIR.streak.hair / FWHM) * r.getPixelRatio();
    };

    // Flakes: one instance of a unit quad each.
    const seeds = debrisSeeds(cfg.debris);
    const quad = new THREE.PlaneGeometry(1, 1);
    const flakeGeo = new THREE.InstancedBufferGeometry();
    flakeGeo.index = quad.index;
    flakeGeo.setAttribute("position", quad.getAttribute("position"));
    flakeGeo.instanceCount = cfg.debris;
    const ref = new Float32Array(cfg.debris * 2);
    const seed = new Float32Array(cfg.debris * 4);
    const tilt = new Float32Array(cfg.debris);
    for (let d = 0; d < cfg.debris; d++) {
      const i = nStreak + d;
      ref.set([((i % side) + 0.5) / side, (Math.floor(i / side) + 0.5) / side], d * 2);
      tilt[d] = (((d * 0.7548776662466927) % 1) * 2 - 1) * Math.PI;
      seed.set([seeds.size[d], seeds.spin[d], seeds.angle[d], tilt[d]], d * 4);
    }
    flakeGeo.setAttribute("ref", new THREE.InstancedBufferAttribute(ref, 2));
    flakeGeo.setAttribute("seed", new THREE.InstancedBufferAttribute(seed, 4));
    flakeGeo.setAttribute("axis", new THREE.InstancedBufferAttribute(seeds.axis, 3));
    this.flakeMaterial = new THREE.ShaderMaterial({
      vertexShader: FLAKE_VERTEX,
      fragmentShader: FLAKE_FRAGMENT,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#a6adb9") },
        uOpacity: { value: 0.9 },
        uLight: { value: LIGHT },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flakes = new THREE.Mesh(flakeGeo, this.flakeMaterial);
    this.flakes.frustumCulled = false;

    this.object = new THREE.Group();
    this.object.name = "__tunnel_air";
    this.object.add(this.streaks, this.flakes);
    this.object.traverse((o) => (o.raycast = () => {}));
    this.bind();
  }

  setLook({ streak, streakOpacity, flake, flakeOpacity }: TunnelLook["air"]): void {
    this.streakMaterial.uniforms.uColor.value.set(streak);
    this.streakMaterial.uniforms.uOpacity.value = streakOpacity;
    this.flakeMaterial.uniforms.uColor.value.set(flake);
    this.flakeMaterial.uniforms.uOpacity.value = flakeOpacity;
  }

  /** Streaks and flakes are drawn only while the air runs: frozen, they would read as debris on the glass. */
  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  set({ speed, downwash, diffuserUp }: FlowParams): void {
    const u = this.vel.material.uniforms;
    u.uSpeed.value = speed;
    u.uDownwash.value = downwash;
    u.uDiffuserUp.value = diffuserUp;
    const q = this.pos.material.uniforms;
    q.uSpeed.value = speed;
    q.uLifeS.value = streakLife(speed);
    q.uLifeD.value = debrisLife(speed);
    this.speed = speed;
  }

  /** Runs the particles for one whole cycle, once, so the first frame already has bursts in flight and flakes spread through the box. */
  settle(): void {
    if (this.settled) return;
    this.settled = true;
    const steps = Math.ceil(Math.max(streakLife(this.speed), debrisLife(this.speed)) * 30 * 1.1);
    for (let i = 0; i < steps; i++) this.advance(1 / 30);
    this.bind();
  }

  step(dt: number): void {
    this.advance(Math.min(Math.max(dt, 0), 1 / 30));
    this.bind();
  }

  private advance(h: number): void {
    const s = h / SUBSTEPS;
    const q = this.pos.material.uniforms;
    for (let i = 0; i < SUBSTEPS; i++) {
      this.time += s;
      this.clockS += s / q.uLifeS.value;
      this.clockD += s / q.uLifeD.value;
      this.vel.material.uniforms.uTime.value = this.time;
      q.uDt.value = s;
      q.uClockS.value = this.clockS;
      q.uClockD.value = this.clockD;
      this.gpu.compute();
    }
  }

  private bind(): void {
    const tex = this.gpu.getCurrentRenderTarget(this.pos).texture;
    this.streakMaterial.uniforms.tPos.value = tex;
    this.flakeMaterial.uniforms.tPos.value = tex;
    this.flakeMaterial.uniforms.tVel.value = this.gpu.getCurrentRenderTarget(this.vel).texture;
    this.flakeMaterial.uniforms.uTime.value = this.time;
  }

  dispose(): void {
    this.gpu.dispose();
    this.streakMaterial.dispose();
    this.flakeMaterial.dispose();
    this.streaks.geometry.dispose();
    this.flakes.geometry.dispose();
  }
}
