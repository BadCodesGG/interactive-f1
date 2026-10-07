import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sidecar from "@/data/f1.sidecar.json";
import { createRun, poseOf, stepRun } from "@/models/f1/lap-car";
import { LIVERIES } from "@/models/f1/liveries";
import { applyLiveryDef, repaintLivery } from "@/models/f1/livery-apply";
import { buildProfile } from "@/models/f1/lap-profile";
import { buildTrack } from "@/models/f1/lap-track";
import type { LapCommand, LapTelemetry } from "./lap-bridge";
import { attachLap, FLAPS, ROAD_LAYER, roadMatrix, VIEWS, type LapControls } from "./lap-scene";

describe("roadMatrix", () => {
  // The road's vertices are (X, 0, -Y) of the track's plane (X east, Y north).
  const toCar = (m: THREE.Matrix4, X: number, Y: number) => new THREE.Vector3(X, 0, -Y).applyMatrix4(m);

  it("puts the car at the origin, whichever way it faces", () => {
    for (const heading of [0, 1, 2.5, -2]) {
      const p = toCar(roadMatrix(120, -40, heading, 0), 120, -40);
      expect(p.length()).toBeLessThan(1e-9);
    }
  });

  it("puts a point ahead of the car on -x (the nose is toward -x)", () => {
    const heading = 0.7;
    const ahead = toCar(roadMatrix(10, 20, heading, 0), 10 + 5 * Math.cos(heading), 20 + 5 * Math.sin(heading));
    expect(ahead.x).toBeCloseTo(-5, 9);
    expect(ahead.z).toBeCloseTo(0, 9);
  });

  it("puts a point to the car's left on +z (the GLB's front-left wheel is at +z)", () => {
    const heading = -1.2;
    const left = toCar(roadMatrix(0, 0, heading, 0), -3 * Math.sin(heading), 3 * Math.cos(heading));
    expect(left.z).toBeCloseTo(3, 9);
    expect(left.x).toBeCloseTo(0, 9);
  });

  it("lifts the road to the height it is given", () => {
    expect(toCar(roadMatrix(1, 2, 0.3, -0.02), 1, 2).y).toBeCloseTo(-0.02, 9);
  });

  it("turns a left-hand bend to the left in the car's frame as the car goes round it", () => {
    const track = buildTrack();
    // Ten metres into the tightest left-hand bend, the road ahead curves toward +z.
    let i = 0;
    for (let j = 0; j < track.count - 30; j++) if (track.curvature[j] > track.curvature[i]) i = j;
    const m = roadMatrix(track.x[i], track.y[i], track.heading[i], 0);
    const far = toCar(m, track.x[i + 20], track.y[i + 20]);
    expect(track.curvature[i]).toBeGreaterThan(0.01);
    expect(far.x).toBeLessThan(0);
    expect(far.z).toBeGreaterThan(0);
  });
});

describe("the flaps' nodes", () => {
  it("are in the GLB the stage loads, under the wings they move", () => {
    const url = (sidecar as { model: string }).model;
    const bin = readFileSync(path.join(process.cwd(), "public", url));
    const jsonLength = bin.readUInt32LE(12);
    const gltf = JSON.parse(bin.subarray(20, 20 + jsonLength).toString("utf8")) as { nodes: { name?: string; children?: number[] }[] };
    for (const flap of FLAPS) {
      const parent = gltf.nodes.find((n) => n.name === flap.part);
      const child = parent?.children?.map((i) => gltf.nodes[i]).find((n) => n.name === flap.node);
      expect(child, `${flap.node} under ${flap.part}`).toBeDefined();
    }
  });
});

/** A small car: a body part, two wing parts with a flap each, and four wheels of a tyre (a quarter turn about x, as the GLB has it) and a duct. */
function fakeScene() {
  const top = new THREE.Scene();
  const root = new THREE.Group();
  top.add(root);
  const parts = new Map<string, THREE.Object3D>();
  const part = (id: string) => {
    const g = new THREE.Group();
    g.name = id;
    root.add(g);
    parts.set(id, g);
    return g;
  };
  const mesh = (size: [number, number, number], at: [number, number, number], name?: string) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
    m.position.set(...at);
    if (name) m.name = name;
    return m;
  };
  part("bodywork").add(mesh([3, 0.4, 0.8], [-0.5, 0.55, 0]));
  part("front-suspension").add(mesh([0.2, 0.1, 1.2], [-1.5, 0.46, 0]));
  part("rear-wing").add(mesh([0.3, 0.1, 1.1], [2.07, 0.84, 0]), mesh([0.14, 0.11, 1.1], [2.26, 0.88, 0], FLAPS[0].node));
  part("front-wing").add(mesh([0.6, 0.15, 1.7], [-2.67, 0.22, 0]), mesh([0.44, 0.15, 1.0], [-2.57, 0.23, 0], FLAPS[1].node), mesh([0.24, 0.05, 1.7], [-2.45, 0.31, 0], FLAPS[2].node));
  for (const [id, x, z] of [["front-left-wheel", -1.7, 0.772], ["front-right-wheel", -1.7, -0.772], ["rear-left-wheel", 1.7, 0.772], ["rear-right-wheel", 1.7, -0.772]] as const) {
    const wheel = part(id);
    const tyre = mesh([0.74, 0.36, 0.74], [x, 0.369, z]);
    tyre.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    wheel.add(tyre, mesh([0.1, 0.1, 0.1], [x - 0.03, 0.42, z - 0.2]));
  }
  root.updateMatrixWorld(true);
  return { top, root, parts };
}

describe("attachLap", () => {
  beforeEach(() => {
    // attachLap reads the page's theme and accent and watches them: the smallest page that answers.
    vi.stubGlobal("document", { documentElement: { getAttribute: () => "dark" }, querySelector: () => null });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#b8bec8" }));
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  const telemetry = (): LapTelemetry => ({ speedKmh: 0, mode: "corner", lapSeconds: 0, phase: "running", finished: false, flaps: null });

  function setup(command: LapCommand, aspect = 1.65, prepare?: (root: THREE.Object3D) => void) {
    const { top, root, parts } = fakeScene();
    prepare?.(root);
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.05, 500);
    const looks: number[][] = [];
    const controls: LapControls = { enabled: true, camera, setLookAt: (...a: (number | boolean | undefined)[]) => void looks.push(a as number[]) };
    let frames: ((ms: number) => void)[] = [];
    const t = telemetry();
    let done = 0;
    const detach = attachLap(
      { root, parts, sphere: { radius: 4 }, getControls: () => controls, invalidate: () => {} },
      { read: () => command, subscribe: () => () => {}, telemetry: t, done: () => void done++, frame: (fn) => frames.push(fn), cancel: () => void (frames = []) },
    );
    /** Runs `count` animation frames, 60 a second. */
    const run = (count: number) => {
      for (let i = 0; i < count; i++) {
        const due = frames;
        frames = [];
        due.forEach((fn) => fn(i * (1000 / 60)));
      }
    };
    return { top, root, parts, camera, looks, controls, t, detach, run, done: () => done };
  }

  const STILL: LapCommand = { playing: false, restarts: 0, steps: 0, view: "chase", still: true };
  const DRIVING: LapCommand = { playing: true, restarts: 0, steps: 0, view: "chase", still: false };

  it("poses a still frame on a straight: wings open, the road on its own layer, the camera driven by hand", () => {
    const s = setup(STILL);
    s.run(1);
    const road = s.top.getObjectByName("__lap_road")!;
    expect(road).toBeDefined();
    expect(road.layers.isEnabled(ROAD_LAYER)).toBe(true);
    expect(road.layers.isEnabled(0)).toBe(false);
    expect(s.camera.layers.isEnabled(ROAD_LAYER)).toBe(true);
    expect(s.controls.enabled).toBe(false);
    expect(s.t.mode).toBe("straight");
    expect(s.t.speedKmh).toBeGreaterThan(250);
    // The rear flap turns about its trailing edge, so its leading edge (toward -x) comes up.
    const flap = s.parts.get("rear-wing")!.getObjectByName(FLAPS[0].node)!;
    const leadingEdge = new THREE.Vector3(-0.07, 0, 0).applyQuaternion(flap.quaternion).add(flap.position);
    expect(leadingEdge.y).toBeGreaterThan(0.88);
    expect(flap.quaternion.z).toBeLessThan(0);
    // The chase camera sits behind the car (+x) and above it.
    const eye = s.looks.at(-1)!;
    expect(eye[0]).toBeCloseTo(VIEWS.chase.eye[0], 6);
    expect(eye[1]).toBeCloseTo(VIEWS.chase.eye[1], 6);
    s.detach();
  });

  it("stands further back on a tall, narrow stage so the car still fits", () => {
    const wide = setup(STILL, 1.65);
    wide.run(1);
    const narrow = setup(STILL, 0.75);
    narrow.run(1);
    const dist = (looks: number[][]) => Math.hypot(looks.at(-1)![0] - VIEWS.chase.look[0], looks.at(-1)![1] - VIEWS.chase.look[1], looks.at(-1)![2] - VIEWS.chase.look[2]);
    expect(dist(narrow.looks)).toBeGreaterThan(dist(wide.looks) * 1.3);
    wide.detach();
    narrow.detach();
  });

  it("puts a steering node and a spinning node at each tyre's centre, and steers only the fronts", () => {
    const s = setup(DRIVING);
    s.run(600);
    for (const id of ["front-left-wheel", "rear-right-wheel"]) {
      const wheel = s.parts.get(id)!;
      expect(wheel.children).toHaveLength(1);
      const steer = wheel.children[0];
      expect(Math.abs(steer.position.x)).toBeCloseTo(1.7, 6);
      expect(steer.position.y).toBeCloseTo(0.369, 6);
      // The tyre spins; the duct (not turned about the axle) is steered but not spun.
      expect(steer.children).toHaveLength(2);
    }
    expect(s.parts.get("rear-left-wheel")!.children[0].rotation.y).toBe(0);
    expect(Math.abs(s.parts.get("front-left-wheel")!.children[0].rotation.y)).toBeGreaterThanOrEqual(0);
    const spin = s.parts.get("front-left-wheel")!.children[0].children.find((c) => c.children.length > 0)!;
    expect(spin.rotation.z).not.toBe(0);
    s.detach();
  });

  it("puts everything back on detach: positions, rotations, the wheels' own pieces, the camera, the road", () => {
    const fresh = fakeScene();
    const snapshot = (parts: Map<string, THREE.Object3D>) =>
      [...parts.values()].flatMap((p) => p.children.map((c) => `${p.name}/${c.name}/${c.position.toArray().map((v) => v.toFixed(6))}/${c.quaternion.toArray().map((v) => v.toFixed(6))}`)).sort();
    const before = snapshot(fresh.parts);
    const s = setup(DRIVING);
    s.run(400);
    expect(snapshot(s.parts)).not.toEqual(before);
    s.detach();
    expect(snapshot(s.parts)).toEqual(before);
    expect(s.top.getObjectByName("__lap_road")).toBeUndefined();
    expect(s.controls.enabled).toBe(true);
    expect(s.camera.layers.isEnabled(ROAD_LAYER)).toBe(false);
    expect(s.done()).toBe(1);
  });

  it("sinks and tilts the body by the model's own pose", () => {
    const s = setup(DRIVING);
    const model = createRun(buildProfile(buildTrack()));
    // The scene's first frame is one 1/60 step; every frame after it takes the gap between frames.
    s.run(200);
    for (let i = 0; i < 200; i++) stepRun(model, i === 0 ? 1 / 60 : 1 / 60);
    const body = s.parts.get("bodywork")!;
    const pose = poseOf(model);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.body.roll, 0, pose.body.pitch, "ZYX"));
    expect(body.quaternion.angleTo(q)).toBeLessThan(2e-3);
    // The sink, less the lift a tilt about the pivot gives a node whose own origin is the world origin.
    expect(body.position.y).toBeLessThan(0);
    expect(body.position.y).toBeCloseTo(-pose.body.heave + 0.3 - 0.3 * Math.cos(pose.body.pitch), 2);
    s.detach();
  });
  it("turns each flap about its hinge edge: the edge stays where it was as the flap opens", () => {
    const rest = fakeScene();
    const s = setup(STILL);
    s.run(1);
    // The hinge, in each part's frame: the leading or trailing edge of the flap's box at its middle height.
    FLAPS.forEach((f) => {
      const was = rest.parts.get(f.part)!.getObjectByName(f.node)!;
      const box = new THREE.Box3().setFromObject(was);
      const hinge = new THREE.Vector3(f.edge === "trailing" ? box.max.x : box.min.x, (box.min.y + box.max.y) / 2, 0);
      const now = s.parts.get(f.part)!.getObjectByName(f.node)!;
      // A point of the flap that sat on the hinge at rest, carried by the flap's own move, is still on it.
      const carried = hinge.clone().sub(was.position).applyQuaternion(now.quaternion).add(now.position);
      expect(now.quaternion.z, `${f.node} has turned`).not.toBe(0);
      expect(carried.distanceTo(hinge), f.node).toBeLessThan(1e-6);
    });
    s.detach();
  });

  it("tints the flaps while they move and for a second after, and gives the materials back", () => {
    const s = setup(DRIVING);
    const skin = (i: number) => (s.parts.get(FLAPS[i].part)!.getObjectByName(FLAPS[i].node) as THREE.Mesh).material;
    const own = FLAPS.map((_, i) => skin(i));
    // From the line the wings are shut: the first straight opens them, which is the flaps moving.
    let tinted = 0;
    let rest = 0;
    let said: string | null = null;
    // Ten frames at a time: a frame on its own has no time since the last one to move the car by.
    for (let i = 0; i < 160; i++) {
      s.run(10);
      const moving = skin(0) !== own[0];
      if (moving) tinted++;
      else if (tinted > 0) rest++;
      if (s.t.flaps) said = s.t.flaps;
    }
    expect(tinted).toBeGreaterThan(3);
    expect(rest).toBeGreaterThan(0);
    expect(said).toBe("opening");
    s.detach();
    FLAPS.forEach((_, i) => expect(skin(i)).toBe(own[i]));
  });

  it("draws the first frames of the lap with the tint, to build its shader then and not as the flaps first move, and a still frame settles untinted", () => {
    const s = setup(STILL);
    const mesh = s.parts.get(FLAPS[0].part)!.getObjectByName(FLAPS[0].node) as THREE.Mesh;
    const own = (mesh.material as THREE.Material).type;
    s.run(1);
    expect((mesh.material as THREE.Material).type).not.toBe(own);
    s.run(30);
    expect((mesh.material as THREE.Material).type).toBe(own);
    s.detach();
  });

  it("keeps a livery picked while the flaps are tinted: they come back wearing it, not the one before", () => {
    vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
    const s = setup(STILL, 1.65, (root) => {
      // The wings' meshes are the livery's paint, as the stage leaves them.
      for (const [part, name] of [["rear-wing", "RearWingLivery"], ["front-wing", "FrontWingLivery"]] as const) {
        root.getObjectByName(part)!.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ name });
        });
      }
      applyLiveryDef(root, LIVERIES.ghost);
    });
    const flap = s.parts.get(FLAPS[0].part)!.getObjectByName(FLAPS[0].node) as THREE.Mesh;
    const paint = flap.material as THREE.Material;
    s.run(1);
    // The first frames wear the tint: the paint is off the mesh now.
    expect(flap.material).not.toBe(paint);
    const tint = flap.material as THREE.Material;
    const tintKey = tint.customProgramCacheKey();
    repaintLivery(s.root, LIVERIES["powder-blue"]);
    expect(tint.customProgramCacheKey()).toBe(tintKey);
    s.run(30);
    expect(flap.material).toBe(paint);
    expect(paint.customProgramCacheKey()).toContain("powder-blue");
    s.detach();
    expect(flap.material).toBe(paint);
  });

  it("puts a key and two rim lights in the scene for the lap, turned to where the camera is, and takes them away", () => {
    const s = setup(DRIVING);
    s.run(10);
    const rig = s.top.getObjectByName("__lap_rig")!;
    expect(rig).toBeDefined();
    expect(rig.children.filter((c) => (c as THREE.DirectionalLight).isDirectionalLight)).toHaveLength(3);
    // The camera is behind the car, to its left a little: the rig is turned about the car to match.
    const eye = s.looks.at(-1)!;
    expect(rig.rotation.y).toBeCloseTo(Math.atan2(-eye[2], eye[0]), 6);
    s.detach();
    expect(s.top.getObjectByName("__lap_rig")).toBeUndefined();
  });

  it("lets the camera see as far as the circuit goes for the lap and gives back its range", () => {
    const s = setup(STILL);
    expect(s.camera.far).toBeGreaterThan(500);
    s.detach();
    expect(s.camera.far).toBe(500);
  });
});
