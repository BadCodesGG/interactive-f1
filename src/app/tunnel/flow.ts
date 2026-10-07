/**
 * The tunnel's airflow: a smoke rake, as in a real smoke tunnel. GPU particles are advected through a
 * fake but boundary-respecting velocity field (windtunnel report, section 3.1, the particle layer).
 * Two GPUComputationRenderer variables in float targets (half float where the GPU cannot render to
 * full): velocity is worked out from the previous position, then position integrates the previous
 * velocity. The baked SDF is smoothed first (sdf-smooth.ts) so the surface's normal is not a patchwork.
 *
 * The field, per particle, in world metres with the air moving along +x (the car's nose is at -x):
 * freestream at the speed slider's pace, plus curl noise (divergence-free, faded out near the body
 * as Bridson ramps it, and near laminar until the wake so the streaklines stay parallel and only
 * break up behind the car), minus the component pointing into the body near it (from the baked SDF's
 * gradient), a push out of anything inside, a tangential speed-up along the surface, and two authored
 * terms: downwash behind the rear wing and upwash out of the diffuser. None of it is CFD; the UI
 * says so.
 *
 * Every particle belongs to one nozzle of the rake (rake.ts) and is released there again when it
 * leaves the box sideways or its phase (0 at release, 1 at the end of a life of one crossing at the
 * freestream pace) runs out, so each nozzle feeds one time-ordered chain of particles. Each chain
 * draws as one continuous ribbon of smoke (ribbon.ts): a screen-space-width quad between every two
 * neighbours, cut at the release point and faded where they are pulled far apart, gaussian across its
 * width, diffusing wider and softer with age and much more in the wake, where it also thins into
 * separate wisps. The rake's own hardware (rake-hardware.ts) stands at the nozzles. The velocity field
 * itself is field.ts's; air.ts rides it too, with hairline streaks and tumbling flakes.
 *
 * The smoke wand (wand.ts) is a few more chains after the rake's, released from nozzles a pointer moves
 * about. They run like every other chain and are drawn by the same ribbons; only their opacity is
 * switched (`uWand`), so a wand that is off costs nothing on screen and one that is on streams as the
 * rake does. Because a chain is time-ordered, a wand that is put down somewhere new has to be run for a
 * crossing (settleWand) before its smoke is the streamline from that spot and not the one it left.
 */
import * as THREE from "three";
import { GPUComputationRenderer, type Variable } from "three/addons/misc/GPUComputationRenderer.js";
import type { Sdf } from "@/models/f1/sdf-format";
import { Air } from "./air";
import type { AirConfig } from "./air-config";
import type { TunnelLook } from "./look";
import { FLOW_BOX, MAX_NOZZLES, type Nozzle } from "./rake";
import { parkedWand, SETTLE_BUDGET_MS, settleSteps, spendSettle } from "./wand";
import { buildRakeHardware, disposeRakeHardware } from "./rake-hardware";
import { ribbonGeometry } from "./ribbon";
import { smoothSdf } from "./sdf-smooth";
import { CONSTS, velocityShader } from "./field";

export interface FlowParams {
  /** Freestream, metres per second of animation (a slowed-down, readable pace). */
  speed: number;
  /** Downwash behind the rear wing, fraction of freestream. */
  downwash: number;
  /** Upwash out of the diffuser, fraction of freestream. */
  diffuserUp: number;
}

const BOX = FLOW_BOX;
/**
 * Compute passes per frame. One Euler step at a frame's pace is about a tenth of a metre, coarser than
 * the body's features, so where a particle happens to land between steps decides how far the surface
 * deflects it; neighbours in a ribbon land differently and the line zigzags, or (where the underbody
 * squeezes it) bands with the step length. Three passes still banded the line under the car; eight do
 * not. The chains are small (thousands of particles), so the passes are cheap.
 */
const SUBSTEPS = 8;

/** The position shader for a rake of `n` nozzles. w is the particle's phase: 0 at release, 1 at the end of its life. */
const positionShader = (n: number) => /* glsl */ `
${CONSTS}
#define NOZZLES ${n}
uniform vec3 uNozzle[NOZZLES];
uniform float uDt;
uniform float uTime;
uniform float uSpeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec3 v = texture2D(textureVelocity, uv).xyz;
  vec3 p = pos.xyz + v * uDt;
  p.y = max(p.y, 0.012);
  // One life is one crossing at the freestream pace, the same for every particle so a chain keeps its order,
  // and a speed change never releases everything at once.
  float life = (BOX_X1 - BOX_X0) / max(uSpeed, 0.1);
  float phase = pos.w + uDt / life;
  bool spent = phase >= 1.0;
  if (spent || abs(p.z) > BOX_Z || p.y > BOX_Y1) {
    float r3 = hash(uv * 3.13 + fract(uTime * 0.071));
    // A particle's nozzle is fixed by its texel, so every nozzle gets an equal share.
    int k = int(mod(floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x), float(NOZZLES)));
    // Released part-way through the step, by the time it overshot its life, as a real nozzle would have. Lives
    // end on the clock, not at the outlet, so the release stays evenly spread in time: without the overshoot every
    // particle freed in a frame leaves in one clump, and a random offset or an exit at the outlet re-clumps it.
    // Only a particle that strays out of the sides or top (rare, in the wake) takes a random one.
    phase = spent ? phase - 1.0 : r3 * uDt / life;
    p = uNozzle[k] + vec3(min(phase * life, uDt) * uSpeed, 0.0, 0.0);
  }
  gl_FragColor = vec4(p, phase);
}
`;

const SMOKE_VERTEX = /* glsl */ `
${CONSTS}
uniform sampler2D tPos;
uniform float uWidth;
uniform float uChain;
uniform float uRakeChains;
uniform float uWand;
uniform vec2 uViewport;
attribute vec2 refA;
attribute vec2 refB;
attribute vec2 refS0;
attribute vec2 refS1;
attribute vec2 corner;
attribute vec2 seed;
varying float vAcross;
varying float vAlpha;
varying float vSharp;

const float TAU = 6.2831853;

// Neighbours in a chain are in order along one streakline while their phases run on; a pair either side of
// the release point (phase falls back to nearly 0) are not.
bool ordered(vec4 a, vec4 b) {
  float dphase = b.w - a.w;
  return dphase > -0.01 && dphase < 0.05;
}

// How much of a link to draw: all of it while its ends are close, fading out as they are pulled apart (a
// stretched link thins into a faint wisp instead of vanishing in a piece), none across the release point.
float linkWeight(vec4 a, vec4 b) {
  return ordered(a, b) ? 1.0 - smoothstep(0.05, 0.18, distance(a.xyz, b.xyz)) : 0.0;
}

void main() {
  vec4 A = texture2D(tPos, refA);
  vec4 B = texture2D(tPos, refB);
  vec4 S0 = texture2D(tPos, refS0);
  vec4 S1 = texture2D(tPos, refS1);
  float link = linkWeight(A, B);
  if (link <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAcross = 0.0; vAlpha = 0.0; vSharp = 1.0;
    return;
  }
  bool head = corner.x > 0.5;
  vec4 X = head ? B : A;
  // The line direction at this end runs from the particle a few places before it to the one the same
  // distance after (ribbon.ts), where they are in the line.
  vec3 before = ordered(S0, X) ? S0.xyz : X.xyz;
  vec3 after = ordered(X, S1) ? S1.xyz : X.xyz;

  mat4 vp = projectionMatrix * modelViewMatrix;
  vec4 cX = vp * vec4(X.xyz, 1.0);
  vec4 cB = vp * vec4(before, 1.0);
  vec4 cA = vp * vec4(after, 1.0);
  vec2 dir = (cA.xy / cA.w - cB.xy / cB.w) * 0.5 * uViewport;
  dir = dot(dir, dir) > 1e-8 ? normalize(dir) : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  float wake = smoothstep(WAKE_START, WAKE_FULL, X.x);
  float age = X.w;
  // Fades in at the nozzle, out at the end of its life and towards the outlet; thins as it spreads.
  float alpha = smoothstep(0.0, 0.025, age) * (1.0 - smoothstep(0.93, 1.0, age)) * (1.0 - smoothstep(BOX_X1 - 0.9, BOX_X1, X.x));
  alpha *= (1.0 - 0.3 * age) / (1.0 + 0.9 * wake) * link;
  // The smoke wand's chains come after the rake's, and show only while the wand is on.
  alpha *= seed.y < uRakeChains - 0.5 ? 1.0 : uWand;
  // In the wake the filament breaks into wisps: long soft stretches of it fade to a trace and back. The
  // pattern is a whole number of cycles round the chain, so it has no seam where the chain closes.
  float u = seed.x / uChain * TAU;
  float pat = sin(u * 26.0 + seed.y * 2.1) + 0.6 * sin(u * 61.0 + seed.y * 5.7);
  alpha *= mix(1.0, 0.08 + 0.92 * smoothstep(-1.1, 0.7, pat), wake * 0.85);

  // Width in metres: it diffuses with age from the first metre, and much more in the wake. Then to pixels.
  float px = uWidth * (1.0 + 1.1 * age + 1.8 * wake) * projectionMatrix[1][1] * uViewport.y * 0.5 / max(cX.w, 0.05);
  float width = max(px, 2.5);
  // A ribbon under 2.5 px would alias into dashes: pay the thinness back in opacity.
  alpha *= min(px / width, 1.0);

  gl_Position = cX;
  gl_Position.xy += normal * corner.y * width / uViewport * cX.w;
  vAcross = corner.y;
  vAlpha = alpha;
  // Gaussian across the ribbon, spreading out (a smaller sharpness) as it ages and enters the wake.
  vSharp = mix(5.0, 2.2, clamp(age * 0.9 + wake, 0.0, 1.0));
}
`;

const SMOKE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAcross;
varying float vAlpha;
varying float vSharp;
void main() {
  // Gaussian, taken down to exactly 0 at the ribbon's edge.
  float tail = exp(-vSharp);
  float edge = (exp(-vSharp * vAcross * vAcross) - tail) / (1.0 - tail);
  gl_FragColor = vec4(uColor, edge * vAlpha * uOpacity);
  #include <colorspace_fragment>
}
`;

/** Can this renderer draw into half-float targets? GPUComputationRenderer does not check. */
export function flowSupported(gl: THREE.WebGLRenderer): boolean {
  return gl.capabilities.maxVertexTextures > 0 && (gl.extensions.has("EXT_color_buffer_float") || gl.extensions.has("EXT_color_buffer_half_float"));
}

export class Flow {
  /** The smoke ribbons, the rake's hardware and (if it could be built) the streaks and flakes. */
  readonly object: THREE.Group;
  private air: Air | null = null;
  private ribbons: THREE.Mesh;
  private hardware: THREE.Group;
  private gpu: GPUComputationRenderer;
  private pos: Variable;
  private vel: Variable;
  private sdfTexture: THREE.Data3DTexture;
  private material: THREE.ShaderMaterial;
  private nozzleUniform: THREE.Vector3[];
  /** How many of the nozzles are the rake's; the rest are the wand's. */
  private rakeCount: number;
  /** Where the wand's nozzles were at the start of this frame and where they are going: the frame's substeps walk between. */
  private wandFrom: Nozzle[] = [];
  private wandGoal: Nozzle[] | null = null;
  private time = 0;
  private speed = 2;
  private settled = false;
  /** Steps (1/30 s each) still to run to re-establish the wand's smoke: spread over frames (pumpSettle), not run in one. */
  private owed = 0;
  /** The wand's smoke is hidden until its settle has run: it is a still streamline, and the old one would otherwise show beside it. */
  private holdWand = false;

  /**
   * `nozzles` is the rake (rake.ts): its length is fixed for the life of the Flow, its positions are not (see setNozzles).
   * `air` is how many streaks and flakes ride the same field (air.ts); without it, or if they cannot be built, only the smoke runs.
   * `wand` is how many more chains to keep for the smoke wand (wand.ts), after the rake's; `count` covers them too.
   */
  constructor(renderer: THREE.WebGLRenderer, sdf: Sdf, count: number, nozzles: readonly Nozzle[], air: AirConfig | null = null, wand = 0) {
    if (nozzles.length < 1 || nozzles.length + wand > MAX_NOZZLES) throw new Error(`Flow: ${nozzles.length} nozzles and ${wand} for the wand, expected at most ${MAX_NOZZLES}`);
    this.rakeCount = nozzles.length;
    const parked = parkedWand();
    const chains: Nozzle[] = [...nozzles, ...Array.from({ length: wand }, (_, i) => parked[i % parked.length])];
    const side = Math.ceil(Math.sqrt(count));
    const [nx, ny, nz] = sdf.header.dims;
    // The flow reads a smoothed copy of the field, at half-float precision rather than a byte's (sdf-smooth.ts).
    const smooth = smoothSdf(sdf.data, sdf.header.dims);
    const half = new Uint16Array(smooth.length);
    for (let i = 0; i < smooth.length; i++) half[i] = THREE.DataUtils.toHalfFloat(smooth[i] / 255);
    this.sdfTexture = new THREE.Data3DTexture(half, nx, ny, nz);
    Object.assign(this.sdfTexture, { format: THREE.RedFormat, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, unpackAlignment: 1 });
    this.sdfTexture.wrapS = this.sdfTexture.wrapT = this.sdfTexture.wrapR = THREE.ClampToEdgeWrapping;
    this.sdfTexture.needsUpdate = true;

    this.gpu = new GPUComputationRenderer(side, side, renderer);
    // Full floats where the GPU can render to them: a half float has a step of a millimetre or more at
    // these positions, so a substep's small vertical drift rounds away or jumps a whole step, and
    // neighbours in a ribbon end up a step apart in y (hairline ticks across it).
    this.gpu.setDataType(renderer.extensions.has("EXT_color_buffer_float") ? THREE.FloatType : THREE.HalfFloatType);
    const pos0 = this.gpu.createTexture();
    const vel0 = this.gpu.createTexture();
    const p = pos0.image.data as Float32Array;
    const v = vel0.image.data as Float32Array;
    const span = BOX.max[0] - BOX.min[0];
    const perNozzle = Math.ceil((side * side) / chains.length);
    for (let i = 0; i < side * side; i++) {
      // Start strung out along the streakline in order, oldest last: neighbours in a chain (ribbon.ts)
      // are neighbours in phase, and the position shader keeps them so.
      const nozzle = chains[i % chains.length];
      const t = (Math.floor(i / chains.length) + 0.5) / perNozzle;
      p[i * 4] = BOX.min[0] + t * span;
      p[i * 4 + 1] = nozzle.y;
      p[i * 4 + 2] = nozzle.z;
      p[i * 4 + 3] = t;
      v[i * 4] = 1;
    }
    this.vel = this.gpu.addVariable("textureVelocity", velocityShader(), vel0);
    this.pos = this.gpu.addVariable("texturePosition", positionShader(chains.length), pos0);
    this.gpu.setVariableDependencies(this.vel, [this.pos, this.vel]);
    this.gpu.setVariableDependencies(this.pos, [this.pos, this.vel]);
    Object.assign(this.vel.material.uniforms, {
      uSdf: { value: this.sdfTexture },
      uMin: { value: new THREE.Vector3(...sdf.header.min) },
      uMax: { value: new THREE.Vector3(...sdf.header.max) },
      uRange: { value: sdf.header.range },
      uSpeed: { value: 2 },
      uTime: { value: 0 },
      uDownwash: { value: 0.45 },
      uDiffuserUp: { value: 0.12 },
    });
    this.nozzleUniform = chains.map((n) => new THREE.Vector3(n.x, n.y, n.z));
    Object.assign(this.pos.material.uniforms, { uDt: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: 2 }, uNozzle: { value: this.nozzleUniform } });
    const error = this.gpu.init();
    if (error) throw new Error(`Flow: ${error}`);

    // One quad per link of each nozzle's chain of particles (ribbon.ts).
    const ribbon = ribbonGeometry(side, chains.length);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((ribbon.corner.length / 2) * 3), 3));
    for (const [name, data] of Object.entries({ refA: ribbon.refA, refB: ribbon.refB, refS0: ribbon.refS0, refS1: ribbon.refS1, corner: ribbon.corner, seed: ribbon.seed })) {
      geo.setAttribute(name, new THREE.BufferAttribute(data, 2));
    }
    geo.setIndex(new THREE.BufferAttribute(ribbon.index, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      uniforms: {
        tPos: { value: null },
        uWidth: { value: 0.06 },
        uChain: { value: perNozzle },
        uRakeChains: { value: nozzles.length },
        uWand: { value: 0 },
        uViewport: { value: new THREE.Vector2(1440, 900) },
        uColor: { value: new THREE.Color("#ffffff") },
        uOpacity: { value: 0.8 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    this.ribbons = new THREE.Mesh(geo, this.material);
    this.ribbons.frustumCulled = false;
    // Ribbon widths are metres; turn them into pixels against the drawing buffer this frame renders to.
    const size = new THREE.Vector2();
    this.ribbons.onBeforeRender = (r) => {
      r.getDrawingBufferSize(size);
      this.material.uniforms.uViewport.value.copy(size);
    };
    this.hardware = buildRakeHardware(nozzles);
    this.object = new THREE.Group();
    this.object.name = "__tunnel_flow";
    this.object.add(this.ribbons, this.hardware);
    if (air) {
      try {
        this.air = new Air(renderer, this.sdfTexture, sdf.header, air);
        this.object.add(this.air.object);
      } catch {
        this.air = null;
      }
    }
    this.object.traverse((o) => (o.raycast = () => {}));
    this.bind();
  }

  /** Recolours the smoke, streaks and flakes for a theme (see look.ts). */
  setLook({ flow: { smoke, opacity, width }, air }: TunnelLook): void {
    const u = this.material.uniforms;
    u.uColor.value.set(smoke);
    u.uOpacity.value = opacity;
    u.uWidth.value = width;
    this.air?.setLook(air);
  }

  /** Shows or hides the streaks and flakes (the smoke stays, frozen, when the airflow is paused). */
  setAirVisible(visible: boolean): void {
    this.air?.setVisible(visible);
  }

  /** Moves the rake: the same number of nozzles, new positions. The smoke follows as particles are released. */
  setNozzles(nozzles: readonly Nozzle[]): void {
    if (nozzles.length !== this.rakeCount) throw new Error("Flow: the nozzle count is fixed");
    nozzles.forEach((n, i) => this.nozzleUniform[i].set(n.x, n.y, n.z));
    this.object.remove(this.hardware);
    disposeRakeHardware(this.hardware);
    this.hardware = buildRakeHardware(nozzles);
    this.object.add(this.hardware);
  }

  set({ speed, downwash, diffuserUp }: FlowParams): void {
    const u = this.vel.material.uniforms;
    u.uSpeed.value = speed;
    u.uDownwash.value = downwash;
    u.uDiffuserUp.value = diffuserUp;
    this.pos.material.uniforms.uSpeed.value = speed;
    this.speed = speed;
    this.air?.set({ speed, downwash, diffuserUp });
  }

  /** How many chains the wand has (0 when the flow was built without one). */
  get wandSlots(): number {
    return this.nozzleUniform.length - this.rakeCount;
  }

  /**
   * Puts the smoke wand's nozzles at `nozzles` (one per wand chain), or turns its smoke off with null. A
   * move is walked through each frame's substeps, so a pointer that moves fast still leaves a continuous
   * line; `jump` puts them there at once, for a wand that was somewhere else (follow with settleWand).
   */
  setWand(nozzles: readonly Nozzle[] | null, jump = false): void {
    if (this.wandSlots === 0) return;
    if (!nozzles) {
      this.wandGoal = null;
      this.owed = 0;
      this.holdWand = false;
      this.material.uniforms.uWand.value = 0;
      return;
    }
    this.material.uniforms.uWand.value = this.holdWand ? 0 : 1;
    if (nozzles.length !== this.wandSlots) throw new Error(`Flow: the wand has ${this.wandSlots} nozzles, got ${nozzles.length}`);
    this.wandGoal = nozzles.map((n) => ({ ...n }));
    if (jump || this.wandFrom.length === 0) this.wandFrom = this.wandGoal.map((n) => ({ ...n }));
  }

  /**
   * Starts running the particles for one crossing again, so a wand that has just been put down comes to show its
   * whole streamline. The steps are taken a few at a time, a frame's budget each (pumpSettle), because all of
   * them together (hundreds of steps of eight passes over every chain's texture) stop the page for
   * seconds on a phone. `hide` keeps the wand's smoke out of sight until they are done, for a wand that is put
   * down and left (the still streamline); a live wand shows as it settles, since its smoke trails behind it anyway.
   */
  settleWand(hide = false): void {
    this.owed = settleSteps(BOX.max[0] - BOX.min[0], this.speed);
    this.holdWand = hide;
    if (hide) this.material.uniforms.uWand.value = 0;
  }

  /** Whether a wand's settle still has steps to run: the stage keeps asking for frames while it does. */
  get settling(): boolean {
    return this.owed > 0;
  }

  /** Takes this frame's share of a wand's settle (nothing when there is none). Call once a frame, paused or not. */
  pumpSettle(now: () => number = () => performance.now()): void {
    if (this.owed <= 0) return;
    this.owed = spendSettle(this.owed, SETTLE_BUDGET_MS, now, () => this.advance(1 / 30));
    this.bind();
    if (this.owed === 0 && this.holdWand) {
      this.holdWand = false;
      if (this.wandGoal) this.material.uniforms.uWand.value = 1;
    }
  }

  /**
   * Runs the particles for one crossing of the box, once, so the first frame already shows established
   * streaklines (also under reduced motion, where nothing else steps them) rather than the straight
   * starting lines pushed out of the car. Call after the first `set`.
   */
  settle(): void {
    if (this.settled) return;
    this.settled = true;
    const steps = settleSteps(BOX.max[0] - BOX.min[0], this.speed);
    for (let i = 0; i < steps; i++) this.advance(1 / 30);
    this.bind();
    this.air?.settle();
  }

  /** Advances the particles by `dt` seconds. */
  step(dt: number): void {
    this.advance(Math.min(Math.max(dt, 0), 1 / 30));
    this.bind();
    this.air?.step(dt);
  }

  /** One frame's step, taken in SUBSTEPS smaller ones. */
  private advance(h: number): void {
    const s = h / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      this.moveWand((i + 1) / SUBSTEPS);
      this.time += s;
      this.vel.material.uniforms.uTime.value = this.time;
      this.pos.material.uniforms.uDt.value = s;
      this.pos.material.uniforms.uTime.value = this.time;
      this.gpu.compute();
    }
  }

  /** Puts the wand's nozzles `f` of the way from where they were at the start of the frame to where they are going. */
  private moveWand(f: number): void {
    const goal = this.wandGoal;
    if (!goal) return;
    goal.forEach((to, s) => {
      const from = this.wandFrom[s] ?? to;
      this.nozzleUniform[this.rakeCount + s].set(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f, from.z + (to.z - from.z) * f);
    });
    if (f === 1) this.wandFrom = goal.map((n) => ({ ...n }));
  }

  private bind(): void {
    this.material.uniforms.tPos.value = this.gpu.getCurrentRenderTarget(this.pos).texture;
  }

  dispose(): void {
    this.air?.dispose();
    this.gpu.dispose();
    this.sdfTexture.dispose();
    this.material.dispose();
    this.ribbons.geometry.dispose();
    disposeRakeHardware(this.hardware);
  }
}
