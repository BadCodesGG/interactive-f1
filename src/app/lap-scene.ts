/**
 * Poses the F226 for the lap: the wheels spin and steer, the body pitches, rolls and sinks on its corners,
 * the wing flaps open and close (and are tinted with the livery's accent while they do), and a circuit runs
 * under the tyres, with a reflection and a rig of lights for the car that follow the camera. The numbers come from
 * src/models/f1/lap-car.ts (a Pose per frame); this only applies them. It runs outside React, on its own
 * animation-frame loop, and asks the stage for a frame whenever something moved, as pit-stop-scene.ts does,
 * and for the same reason it is loaded with the panel rather than with the stage.
 *
 * The car stays where it is and the road moves under it. Every light, the shadow the key light casts, the
 * contact shadow and the camera's framing are built around the car at the origin, so moving the car round a
 * 2.9 km circuit would carry it out of all of them; moving the road instead costs one matrix a frame and
 * keeps the studio exactly as it is. The road is on its own layer (ROAD_LAYER), which the camera draws and
 * the contact shadow's depth pass does not, so it never reads as something standing on the ground.
 *
 * Every part is put back on detach: positions and rotations as they were, the wheels' pieces returned to
 * their own node, the flaps' materials, the car's environment, the lights, the camera's range and its controls.
 */
import * as THREE from "three";
import { createRun, poseOf, STEP_SECONDS, stepRun, type Pose, type Run } from "@/models/f1/lap-car";
import { buildProfile, showcaseDistance, type Profile } from "@/models/f1/lap-profile";
import { holdPaint, releasePaint } from "@/models/f1/paint-hold";
import { LIVERY_META } from "@/models/f1/livery-meta";
import { buildTrack, sampleAt, type Track } from "@/models/f1/lap-track";
import type { LapCommand, LapTelemetry, LapView } from "./lap-bridge";
import { circuitGeometry, circuitMaterial, FOG_DISTANCE, paintCircuit } from "./lap-circuit";
import { buildLapEnvironment, carReflections, createRig, type LapTheme } from "./lap-light";

/** The slice of camera-controls this uses: drive the camera by hand, and stop the visitor's hand on it. */
export interface LapControls {
  enabled: boolean;
  camera: THREE.Camera;
  setLookAt(px: number, py: number, pz: number, tx: number, ty: number, tz: number, enableTransition?: boolean): unknown;
}

/** The slice of the stage's scene this needs. */
export interface LapScene {
  root: THREE.Object3D;
  parts: ReadonlyMap<string, THREE.Object3D>;
  sphere: { radius: number };
  getControls(): LapControls | null;
  invalidate(): void;
  /** The stage's renderer: the car's reflection is built on it. Without one the car keeps the showroom's. */
  gl?: THREE.WebGLRenderer;
}

export interface LapHooks {
  /** What the panel asks for now. */
  read(): LapCommand;
  /** Calls `fn` when `read()` may have changed; returns the unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** Written every frame the car moves. */
  telemetry: LapTelemetry;
  /** Called once everything is put back. */
  done?: () => void;
  /** Animation frames: the browser's by default. */
  frame?: (fn: (ms: number) => void) => number;
  cancel?: (id: number) => void;
}

/** The layer the road is on. The camera draws it; the contact shadow's camera (layer 0 only) does not. */
export const ROAD_LAYER = 1;

const WHEELS = [
  { id: "front-left-wheel", steers: "left" },
  { id: "front-right-wheel", steers: "right" },
  { id: "rear-left-wheel", steers: null },
  { id: "rear-right-wheel", steers: null },
] as const;
/** Parts that follow the body only part of the way: the arms run from the chassis down to a wheel that stays on the ground. */
const HALF_SPRUNG = new Set(["front-suspension", "rear-suspension"]);
/**
 * The GLB's nodes for the active flaps, and which edge each turns about (src/models/f1/lap-car.ts gives the
 * angle). The rear flap is one element turned about its trailing edge; the front wing's flaps are the two
 * elements above its mainplane, each turned about its own leading edge. `Object_N` is the scan's own name and is
 * stable for a given GLB; lap-scene.test.ts reads the model file and fails if a rebuild renames them.
 */
export const FLAPS = [
  { part: "rear-wing", node: "Object_7", edge: "trailing", angle: "rear" },
  { part: "front-wing", node: "Object_5", edge: "leading", angle: "front" },
  { part: "front-wing", node: "Object_9", edge: "leading", angle: "front" },
] as const;
/** The body pitches and rolls about the middle of the car at about centre-of-gravity height. */
const PIVOT = new THREE.Vector3(0, 0.3, 0);
/** The ground plane sits this far under the car's lowest point, as a fraction of the stage's radius (GROUND_CLEARANCE in the engine's ground.ts). */
const GROUND_CLEARANCE = 0.0015;
/** The road is this far under the ground plane, metres: under the shadow catcher, not visibly apart from the tyres. */
const ROAD_DROP = 0.004;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Where the camera sits and looks, in the car's frame (the nose is toward -x). The chase view swings out to the outside of a bend. */
export const VIEWS: Record<LapView, { eye: [number, number, number]; look: [number, number, number] }> = {
  chase: { eye: [6.8, 2.7, 1.0], look: [-1.5, 0.45, 0] },
  front: { eye: [-8.6, 1.5, 4.6], look: [0.2, 0.45, 0] },
  side: { eye: [0.4, 1.0, 9.2], look: [-0.2, 0.5, 0] },
};
/** The aspect below which the camera backs off (width over height), and the most it backs off by. */
const NARROW = 1.05;
const MAX_BACK = 1.6;
/** How far the chase camera swings per rad/s of yaw, radians, and the most. */
const LAG_GAIN = 0.5;
const LAG_MAX = 0.4;
/** Seconds the swing takes to follow. */
const LAG_TIME = 0.4;
/** The circuit, its speed profile and where a still frame starts: the same for every lap, so built once and shared by every attach. */
let course: { track: Track; profile: Profile; still: number } | null = null;
const courseOf = () => {
  if (!course) {
    const track = buildTrack();
    const profile = buildProfile(track);
    course = { track, profile, still: showcaseDistance(profile) };
  }
  return course;
};

/** A Step is this many slices of the same small steps a frame takes. */
const STEP_SLICES = 30;
/** How far the camera sees on the lap, metres: a little past where the circuit has faded out of sight. */
const CAMERA_FAR = FOG_DISTANCE * 3.5;
/** Seconds the flaps stay tinted once they have stopped moving, and how hard the tint glows. */
const TINT_HOLD = 1;
const FLAP_GLOW = 0.6;
/** Frames at the start of the lap that draw the flaps tinted. */
const WARM_FRAMES = 12;

// ---------------------------------------------------------------------------------------------
// The road
// ---------------------------------------------------------------------------------------------

/**
 * The matrix that brings the road into the car's frame for a car at (x, y) heading `heading` on the track's
 * plane: the car at the origin with its nose toward -x and its left toward +z. A point ahead of the car lands
 * on -x, a point to its left on +z.
 */
export function roadMatrix(x: number, y: number, heading: number, height: number, into = new THREE.Matrix4()): THREE.Matrix4 {
  // The strip's vertices are (X, 0, -Y), so the car is at (x, 0, -y) in them, and the road turns by pi - heading.
  into.makeRotationY(Math.PI - heading);
  into.multiply(new THREE.Matrix4().makeTranslation(-x, 0, y));
  into.premultiply(new THREE.Matrix4().makeTranslation(0, height, 0));
  return into;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------------------------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------------------------

interface WheelRig {
  part: THREE.Object3D;
  steer: THREE.Group;
  spin: THREE.Group;
  centre: THREE.Vector3;
  kids: THREE.Object3D[];
  steers: "left" | "right" | null;
}

/**
 * Puts a wheel's pieces under two new nodes at the tyre's centre: one that steers, one inside it that spins.
 * The pieces that turn with the wheel are the ones modelled about the axle (the tyre, the rim, the covers:
 * their cylinders are turned a quarter turn about x); a piece that is not, such as the brake duct, is
 * steered but not spun.
 */
function rigWheel(part: THREE.Object3D, steers: WheelRig["steers"]): WheelRig | null {
  const kids = [...part.children];
  const spinning = kids.filter((k) => Math.abs(k.quaternion.x) > 0.5);
  if (spinning.length === 0) return null;
  const box = new THREE.Box3();
  for (const k of spinning) box.expandByObject(k);
  const centre = part.worldToLocal(box.getCenter(new THREE.Vector3()));
  const steer = new THREE.Group();
  const spin = new THREE.Group();
  steer.position.copy(centre);
  steer.add(spin);
  part.add(steer);
  for (const k of kids) {
    k.position.sub(centre);
    (spinning.includes(k) ? spin : steer).add(k);
  }
  return { part, steer, spin, centre, kids, steers };
}

function unrigWheel(r: WheelRig): void {
  for (const k of r.kids) {
    r.part.add(k);
    k.position.add(r.centre);
  }
  r.part.remove(r.steer);
}

interface FlapRig {
  mesh: THREE.Object3D;
  pivot: THREE.Vector3;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  angle: "front" | "rear";
  /** The meshes under the node, with the material each wears in the livery. */
  skins: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[];
}

/** Share of a flap's chord, from its edge, that counts as the edge when the hinge's height is measured. */
const EDGE_SHARE = 0.05;

/**
 * The middle of a flap's hinge in the world: at its leading or trailing edge (the extreme x) and at the height
 * that edge really is. A flap is an inclined plate, so the middle of its bounding box, which is what a box would
 * give, is not on the edge: the hinge would sit a few centimetres off it and the flap would swing about empty air.
 */
function hingeOf(node: THREE.Object3D, edge: "leading" | "trailing"): THREE.Vector3 {
  const v = new THREE.Vector3();
  const each = (fn: (p: THREE.Vector3) => void) =>
    node.traverse((o) => {
      const m = o as THREE.Mesh;
      const at = m.isMesh ? m.geometry.getAttribute("position") : null;
      if (!at) return;
      for (let i = 0; i < at.count; i++) fn(v.fromBufferAttribute(at, i).applyMatrix4(m.matrixWorld));
    });
  let min = Infinity;
  let max = -Infinity;
  each((p) => {
    min = Math.min(min, p.x);
    max = Math.max(max, p.x);
  });
  const x = edge === "trailing" ? max : min;
  const reach = (max - min) * EDGE_SHARE;
  let sum = 0;
  let count = 0;
  each((p) => {
    if (Math.abs(p.x - x) > reach) return;
    sum += p.y;
    count++;
  });
  return new THREE.Vector3(x, count > 0 ? sum / count : new THREE.Box3().setFromObject(node).getCenter(v).y, 0);
}

function rigFlap(scene: LapScene, flap: (typeof FLAPS)[number]): FlapRig | null {
  const mesh = scene.parts.get(flap.part)?.getObjectByName(flap.node);
  if (!mesh?.parent) return null;
  const skins: FlapRig["skins"] = [];
  mesh.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) skins.push({ mesh: m, material: m.material });
  });
  return { mesh, pivot: mesh.parent.worldToLocal(hingeOf(mesh, flap.edge)), position: mesh.position.clone(), quaternion: mesh.quaternion.clone(), angle: flap.angle, skins };
}

interface SprungRig {
  node: THREE.Object3D;
  weight: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const tmpQ = new THREE.Quaternion();
const tmpQx = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

/** Starts posing the scene's car for the lap the hooks describe; the returned function stops, and puts everything back. */
export function attachLap(scene: LapScene, hooks: LapHooks): () => void {
  const frame = hooks.frame ?? ((fn) => requestAnimationFrame(fn));
  const cancel = hooks.cancel ?? ((id) => cancelAnimationFrame(id));
  const controls = scene.getControls();
  const top = (() => {
    let o: THREE.Object3D = scene.root;
    while (o.parent) o = o.parent;
    return o;
  })();
  scene.root.updateMatrixWorld(true);

  const { track, profile, still } = courseOf();

  // The car's parts.
  const wheels = WHEELS.flatMap((w) => {
    const part = scene.parts.get(w.id);
    const rig = part && rigWheel(part, w.steers);
    return rig ? [rig] : [];
  });
  const flaps = FLAPS.flatMap((f) => rigFlap(scene, f) ?? []);
  const wheelIds = new Set<string>(WHEELS.map((w) => w.id));
  const sprung: SprungRig[] = [...scene.parts]
    .filter(([id]) => !wheelIds.has(id))
    .map(([id, node]) => ({ node, weight: HALF_SPRUNG.has(id) ? 0.5 : 1, position: node.position.clone(), quaternion: node.quaternion.clone() }));
  const lowest = new THREE.Box3().setFromObject(scene.root).min.y;
  const groundY = lowest - scene.sphere.radius * GROUND_CLEARANCE;

  // The circuit.
  const { material, uniforms } = circuitMaterial();
  const geometry = circuitGeometry(track);
  const road = new THREE.Mesh(geometry, material);
  road.name = "__lap_road";
  road.matrixAutoUpdate = false;
  road.matrixWorldNeedsUpdate = true;
  road.frustumCulled = false;
  road.renderOrder = -1;
  road.layers.set(ROAD_LAYER);
  road.raycast = () => {};
  top.add(road);
  const camera = controls?.camera as THREE.PerspectiveCamera | undefined;
  const farWas = camera?.isPerspectiveCamera ? camera.far : null;
  camera?.layers.enable(ROAD_LAYER);
  if (camera && farWas !== null) {
    // The ground runs on to the horizon: the camera sees as far as the fade does.
    camera.far = CAMERA_FAR;
    camera.updateProjectionMatrix();
  }
  if (controls) controls.enabled = false;

  // The car's light: a reflection of its own, and a rig of lights that stays with the camera.
  const themeNow = (): LapTheme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  const rig = createRig(themeNow());
  top.add(rig.group);
  const reflections = scene.gl ? carReflections(scene.root) : null;
  let env: THREE.WebGLRenderTarget | null = null;
  let envTheme: LapTheme | null = null;

  // The flaps' teaching tint: the livery's bright accent, which reads on the dark body in either theme.
  const tintMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0, emissiveIntensity: FLAP_GLOW });
  let worn = false;
  const wear = (tinted: boolean) => {
    if (tinted === worn) return;
    worn = tinted;
    for (const f of flaps) {
      for (const k of f.skins) {
        // A livery picked while the tint is on repaints the paint behind it, not the tint (livery-apply.ts holdPaint).
        if (tinted) holdPaint(k.mesh, k.material);
        else releasePaint(k.mesh);
        k.mesh.material = tinted ? tintMaterial : k.material;
      }
    }
  };

  const paint = () => {
    const theme = themeNow();
    paintCircuit(uniforms, theme, css("--accent") || "#b8bec8");
    rig.paint(theme);
    const tint = LIVERY_META[(document.documentElement.getAttribute("data-livery") ?? "") as keyof typeof LIVERY_META]?.accents.dark.accent ?? "#b8bec8";
    tintMaterial.color.set(tint);
    tintMaterial.emissive.set(tint);
    if (scene.gl && reflections && theme !== envTheme) {
      const next = buildLapEnvironment(scene.gl, theme);
      reflections.set(next.texture);
      env?.dispose();
      env = next;
      envTheme = theme;
    }
    scene.invalidate();
  };
  paint();
  const watch = new MutationObserver(paint);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-livery"] });

  // The run.
  let cmd = hooks.read();
  let run: Run = createRun(profile, cmd.still ? still : 0);
  let lag = 0;
  let seenRestarts = cmd.restarts;
  let seenSteps = cmd.steps;
  let last: number | null = null;
  let pending: number | null = null;
  let live = true;
  // Seconds the flaps stay tinted after they stop, and which way they last went.
  let hold = 0;
  // The first frames wear the tint whatever the flaps are doing, so the tint's shader is built as the lap starts, in the stage's own
  // render path (compiling it ahead of time would miss it, the stage draws into a target), and not as the flaps first move.
  let warming = WARM_FRAMES;
  let going: "opening" | "closing" = "opening";

  const advance = (dt: number) => {
    const was = run.flap;
    stepRun(run, dt);
    if (run.flap !== was) {
      hold = TINT_HOLD;
      going = run.flap > was ? "opening" : "closing";
    } else hold = Math.max(0, hold - dt);
    const target = Math.max(-LAG_MAX, Math.min(LAG_MAX, run.speed * LAG_GAIN * sampleAt(track, run.s).curvature));
    lag += (target - lag) * (1 - Math.exp(-dt / LAG_TIME));
  };

  const render = () => {
    const pose: Pose = poseOf(run);
    road.matrix.copy(roadMatrix(pose.x, pose.y, pose.heading, groundY - ROAD_DROP));
    road.matrixWorld.copy(road.matrix);

    // Wheels.
    for (const w of wheels) {
      w.spin.rotation.z = pose.spin;
      w.steer.rotation.y = w.steers ? pose.steer[w.steers] : 0;
    }
    // The body, on its four corners.
    for (const s of sprung) {
      const k = s.weight;
      tmpQ.setFromAxisAngle(Z_AXIS, pose.body.pitch * k);
      tmpQx.setFromAxisAngle(X_AXIS, pose.body.roll * k);
      tmpQ.multiply(tmpQx);
      s.node.quaternion.copy(tmpQ).multiply(s.quaternion);
      // A point w of the part goes to Q (w - pivot) + pivot, less the body's sink. The node's own position is part of w.
      tmpV.copy(PIVOT).applyQuaternion(tmpQ).negate().add(PIVOT);
      s.node.position.copy(s.position).applyQuaternion(tmpQ).add(tmpV);
      s.node.position.y -= pose.body.heave * k;
    }
    // The flaps, turned about their edge, on top of the body's own move.
    wear(hold > 0 || warming > 0);
    for (const f of flaps) {
      tmpQ.setFromAxisAngle(Z_AXIS, pose.flapAngles[f.angle]);
      f.mesh.quaternion.copy(tmpQ).multiply(f.quaternion);
      f.mesh.position.copy(f.position).sub(f.pivot).applyQuaternion(tmpQ).add(f.pivot);
    }
    // The camera rides with the car.
    if (controls) {
      const v = VIEWS[cmd.view];
      const swing = cmd.view === "chase" ? lag : 0;
      // A tall, narrow stage (a phone) sees less sideways: stand further back so the car is whole.
      const aspect = (controls.camera as THREE.PerspectiveCamera).aspect || 1.6;
      const back = Math.max(1, Math.min(MAX_BACK, NARROW / aspect));
      const cos = Math.cos(swing);
      const sin = Math.sin(swing);
      const dx = (v.eye[0] - v.look[0]) * back + v.look[0];
      const dy = (v.eye[1] - v.look[1]) * back + v.look[1];
      const dz = (v.eye[2] - v.look[2]) * back + v.look[2];
      const ex = dx * cos + dz * sin;
      const ez = -dx * sin + dz * cos;
      controls.setLookAt(ex, dy, ez, v.look[0], v.look[1], v.look[2], false);
      rig.face(Math.atan2(-ez, ex));
    }
    const t = hooks.telemetry;
    t.speedKmh = pose.speedKmh;
    t.mode = pose.mode;
    t.lapSeconds = pose.lapSeconds;
    t.phase = pose.phase;
    t.finished = pose.finished;
    t.flaps = hold > 0 ? going : null;
    scene.invalidate();
  };

  const tick = (ms: number) => {
    pending = null;
    if (!live) return;
    cmd = hooks.read();
    if (cmd.restarts !== seenRestarts) {
      seenRestarts = cmd.restarts;
      run = createRun(profile, cmd.still ? still : 0);
      lag = 0;
      hold = 0;
    }
    if (cmd.steps !== seenSteps) {
      const count = Math.max(0, cmd.steps - seenSteps);
      seenSteps = cmd.steps;
      for (let i = 0; i < count * STEP_SLICES; i++) advance(STEP_SECONDS / STEP_SLICES);
    }
    const dt = last === null ? 1 / 60 : Math.max(0, Math.min((ms - last) / 1000, 1 / 20));
    last = ms;
    const moving = cmd.playing && run.phase !== "stopped";
    if (moving) advance(dt);
    const warm = warming > 0;
    render();
    if (warm) warming--;
    // One more frame after the last tinted one, to draw the flaps as they are.
    if (moving || warm) pending = frame(tick);
    if (!moving) last = null;
  };
  const wake = () => {
    if (live && pending === null) pending = frame(tick);
  };

  const unsubscribe = hooks.subscribe(wake);
  wake();

  return () => {
    live = false;
    unsubscribe();
    watch.disconnect();
    if (pending !== null) cancel(pending);
    for (const s of sprung) {
      s.node.position.copy(s.position);
      s.node.quaternion.copy(s.quaternion);
    }
    wear(false);
    tintMaterial.dispose();
    for (const f of flaps) {
      f.mesh.position.copy(f.position);
      f.mesh.quaternion.copy(f.quaternion);
    }
    for (const w of wheels) unrigWheel(w);
    top.remove(road);
    geometry.dispose();
    material.dispose();
    top.remove(rig.group);
    rig.dispose();
    reflections?.restore();
    env?.dispose();
    if (camera) {
      camera.layers.disable(ROAD_LAYER);
      if (farWas !== null) {
        camera.far = farWas;
        camera.updateProjectionMatrix();
      }
    }
    if (controls) controls.enabled = true;
    scene.invalidate();
    hooks.done?.();
  };
}
