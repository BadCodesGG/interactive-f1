"use client";

/**
 * The wind tunnel's canvas: the assembled car in the visitor's livery (src/models/f1/tunnel-livery.ts) on a polished, reflective floor
 * with a fading grid, seen from a low three-quarter, with the setup applied to it (wing elements,
 * diffuser, ride height, halo) and the airflow around it: the smoke rake (GPU ribbons) with hairline
 * streaks and tumbling flakes riding the same field. Reached only through tunnel-client.tsx's `next/dynamic`, so three stays
 * out of the route's initial JS.
 *
 * Frame loop: on demand while the particles are paused (a frame per camera move or setup change),
 * "always" while they run, and never while the gate says nobody can see it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Setup } from "@/data/aero";
import { createCameraControls, type CameraControls } from "@/engine/explode/camera";
import { useTheme, type Theme } from "@/engine/explode";
import { disposeModel, loadModel } from "@/engine/explode/loader";
import { applyLivery, createTunnelDeform, type TunnelDeform } from "@/models/f1/livery";
import { LIVERIES } from "@/models/f1/liveries";
import { repaintLivery } from "@/models/f1/livery-apply";
import { currentLivery, useLivery } from "@/models/f1/livery-store";
import { decodeSdf, type Sdf } from "@/models/f1/sdf-format";
import { applyTunnelLivery } from "@/models/f1/tunnel-livery";
import { tunnelPose, type TunnelPose } from "@/models/f1/tunnel-pose";
import { airConfig } from "./air-config";
import { fadeGrid, createFloor, type Floor } from "./floor";
import { Flow, flowSupported } from "./flow";
import { tunnelLook } from "./look";
import { EYE, TARGET, framing } from "./framing";
import { nozzleLayout, particleCount } from "./rake";
import { WAND_NOZZLES, wandMode } from "./wand";
import { bindWand, driveWand, newWandState, setMarkerColour, type WandState } from "./wand-control";

export interface TunnelStageProps {
  model: string;
  sdf: string;
  setup: Setup;
  speedKmh: number;
  paused: boolean;
  active: boolean;
  mobile: boolean;
  reduced: boolean;
  onReady: () => void;
  onFail: () => void;
  /** Called once: whether the airflow could run on this GPU. */
  onFlow?: (ok: boolean) => void;
  /** The smoke wand is on: the pointer (or the arrow keys) carries a streamline emitter, and the orbit controls are off. */
  wand: boolean;
}

/** Parts that ride on the springs: everything but the wheels. The suspension moves half as far. */
const UNSPRUNG = new Set(["front-left-wheel", "front-right-wheel", "rear-left-wheel", "rear-right-wheel"]);
const LINKS = new Set(["front-suspension", "rear-suspension"]);
const FOV = 34;

let sdfCache: Promise<Sdf> | null = null;
let sdfUrl = "";
function fetchSdf(url: string): Promise<Sdf> {
  if (!sdfCache || sdfUrl !== url) {
    sdfUrl = url;
    sdfCache = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`SDF ${url} answered ${r.status}`);
      return decodeSdf(await r.arrayBuffer());
    });
    sdfCache.catch(() => (sdfCache = null));
  }
  return sdfCache;
}

interface Loaded {
  root: THREE.Object3D;
  deform: TunnelDeform;
  sprung: { obj: THREE.Object3D; rest: number; gain: number }[];
  halo: THREE.Object3D | null;
  flow: Flow | null;
  dispose(): void;
}

function disposeGrid(grid: THREE.Group): void {
  grid.traverse((o) => {
    const l = o as THREE.LineSegments;
    if (l.isLineSegments) {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
  });
}

function makeGrid(theme: Theme): THREE.Group {
  const group = new THREE.Group();
  const { minor: minorColours, major: majorColour } = tunnelLook(theme).grid;
  const minor = new THREE.GridHelper(14, 56, minorColours[0], minorColours[1]);
  const major = new THREE.GridHelper(14, 7, majorColour, majorColour);
  for (const g of [minor, major]) {
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = g === minor ? 0.55 : 0.8;
    m.depthWrite = false;
    fadeGrid(m);
    g.position.y = 0.001;
    g.raycast = () => {};
  }
  group.add(minor, major);
  return group;
}

/** One frame: eases the visible pose towards the setup's and steps the airflow. Returns whether anything moved. */
function tick(l: Loaded, p: TunnelPose, target: TunnelPose, dt: number, speedKmh: number, paused: boolean): boolean {
  const k = 1 - Math.exp(-8 * dt);
  let moving = false;
  for (const key of ["rearAoA", "rearFlap", "frontFlap", "frontChord", "diffuser", "bodyLift", "downwash"] as const) {
    const d = target[key] - p[key];
    if (Math.abs(d) > 1e-4) {
      p[key] += d * k;
      moving = true;
    } else p[key] = target[key];
  }
  p.halo = target.halo;
  const u = l.deform;
  u.uRearAoA.value = p.rearAoA;
  u.uRearFlap.value = p.rearFlap;
  u.uFrontFlap.value = p.frontFlap;
  u.uFrontChord.value = p.frontChord;
  u.uDiffuser.value = p.diffuser;
  for (const s of l.sprung) s.obj.position.y = s.rest + p.bodyLift * s.gain;
  if (l.halo) l.halo.visible = p.halo;
  if (l.flow) {
    l.flow.set({ speed: 0.8 + speedKmh / 100, downwash: p.downwash, diffuserUp: 0.12 + p.diffuser * 1.3 });
    l.flow.setAirVisible(!paused);
    l.flow.settle();
    if (!paused) l.flow.step(dt);
    // A wand put down somewhere new is re-established a few steps a frame, paused or not; frames are asked for until it is.
    l.flow.pumpSettle();
    if (l.flow.settling) moving = true;
  }
  return moving;
}

function Scene({ model, sdf, setup, speedKmh, paused, mobile, reduced, wand, onReady, onFail, onFlow }: Omit<TunnelStageProps, "active">) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const controls = useRef<CameraControls | null>(null);
  const pose = useRef<TunnelPose | null>(null);
  const announced = useRef(false);
  const target = useMemo(() => tunnelPose(setup), [setup]);
  const theme = useTheme();
  // The floor and the grid hold GPU resources, so they are made in effects that dispose them again, never while
  // rendering (a second render, in development, would make a second set and drop the first without freeing it).
  // They hang from a plain group, which holds nothing, so the scene has a place for them before they exist.
  const ground = useMemo(() => new THREE.Group(), []);
  const floorRef = useRef<Floor | null>(null);
  const gridRef = useRef<THREE.Group | null>(null);
  // The polished floor mirrors the car, smoke and all.
  useEffect(() => {
    const made = createFloor(gl, mobile);
    floorRef.current = made;
    ground.add(made.object);
    invalidate();
    return () => {
      ground.remove(made.object);
      made.dispose();
      floorRef.current = null;
    };
  }, [gl, mobile, ground, invalidate]);
  // The grid is rebuilt with the theme's colours; the smoke is recoloured in place.
  useEffect(() => {
    const made = makeGrid(theme);
    gridRef.current = made;
    ground.add(made);
    invalidate();
    return () => {
      ground.remove(made);
      disposeGrid(made);
      gridRef.current = null;
    };
  }, [theme, ground, invalidate]);
  // Whichever of the two was made again, the floor leaves the grid out of its reflection and wears the theme's look.
  useEffect(() => {
    const floor = floorRef.current;
    floor?.hideInReflection.splice(0, floor.hideInReflection.length, ...(gridRef.current ? [gridRef.current] : []));
    floor?.setLook(tunnelLook(theme).floor);
    invalidate();
  }, [gl, mobile, theme, invalidate]);
  // The reflection is a share of the canvas: follow it as the canvas, or the pixel ratio, changes.
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  useEffect(() => {
    floorRef.current?.fit();
    invalidate();
  }, [gl, mobile, size, dpr, invalidate]);
  const flow = loaded?.flow ?? null;
  useEffect(() => {
    flow?.setLook(tunnelLook(theme));
    invalidate();
  }, [flow, theme, invalidate]);

  // Another livery picked elsewhere (a soft navigation keeps the last pick): repaint in place, no reload.
  const livery = useLivery();
  useEffect(() => {
    if (!loaded) return;
    repaintLivery(loaded.root, LIVERIES[livery]);
    invalidate();
  }, [loaded, livery, invalidate]);

  useEffect(() => {
    let live = true;
    let mine: Loaded | null = null;
    Promise.all([loadModel(model), fetchSdf(sdf)])
      .then(([root, field]) => {
        if (!live) return disposeModel(root);
        const deform = createTunnelDeform();
        applyLivery(root, deform);
        // The tunnel's own carbon, rubber and metal stay; the body and wings take the visitor's livery.
        applyTunnelLivery(root, LIVERIES[currentLivery()], deform);
        const sprung: Loaded["sprung"] = [];
        let halo: THREE.Object3D | null = null;
        for (const child of root.children) {
          if (child.name === "halo") halo = child;
          if (!UNSPRUNG.has(child.name)) sprung.push({ obj: child, rest: child.position.y, gain: LINKS.has(child.name) ? 0.5 : 1 });
        }
        let flow: Flow | null = null;
        if (flowSupported(gl)) {
          try {
            flow = new Flow(gl, field, particleCount(mobile, WAND_NOZZLES), nozzleLayout(mobile), airConfig(mobile), WAND_NOZZLES);
          } catch {
            flow = null;
          }
        }
        onFlow?.(flow !== null);
        mine = {
          root,
          deform,
          sprung,
          halo,
          flow,
          dispose() {
            disposeModel(root);
            flow?.dispose();
          },
        };
        setLoaded(mine);
      })
      .catch(() => {
        if (live) onFail();
      });
    return () => {
      live = false;
      mine?.dispose();
    };
  }, [model, sdf, gl, mobile, onFail, onFlow]);

  useEffect(() => {
    const c = createCameraControls(camera as THREE.PerspectiveCamera, gl.domElement);
    c.minDistance = 2.2;
    // Keep the camera above the floor.
    c.maxPolarAngle = Math.PI / 2 - 0.04;
    // Step back so the rake ahead of the nose is in frame, and on a portrait canvas (a phone) so the whole
    // span from the rake to the wake fits across (framing.ts).
    const cam = camera as THREE.PerspectiveCamera;
    const { target: at, pull } = framing(cam.aspect, FOV);
    const look = new THREE.Vector3(...at);
    const eye = new THREE.Vector3(...EYE).sub(new THREE.Vector3(...TARGET)).multiplyScalar(pull).add(look);
    c.maxDistance = Math.max(12, eye.distanceTo(look) * 1.15);
    void c.setLookAt(eye.x, eye.y, eye.z, look.x, look.y, look.z, false);
    controls.current = c;
    const wake = () => invalidate();
    const events = ["control", "controlstart", "transitionstart", "wake"] as const;
    for (const ev of events) c.addEventListener(ev, wake);
    return () => {
      for (const ev of events) c.removeEventListener(ev, wake);
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl, invalidate]);

  // A setup change needs frames to ease into place even while the particles are paused.
  useEffect(() => invalidate(), [target, speedKmh, paused, invalidate]);

  // The smoke wand. On, it takes the pointer from the orbit controls (which are switched off, and come back
  // when it is turned off) and carries a comb of nozzles to wherever the pointer, or the arrow keys, put
  // it. Live, the smoke streams from it as it moves; with the flow paused, or under reduced motion, it
  // draws one still streamline where the pointer is put down instead (wand.ts, wandMode).
  const wandState = useRef<WandState>(newWandState());
  const marker = useMemo(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshStandardMaterial({ color: "#e8ecf2", roughness: 0.4, metalness: 0.2 }));
    m.name = "__tunnel_wand";
    m.visible = false;
    m.raycast = () => {};
    return m;
  }, []);
  useEffect(
    () => () => {
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    },
    [marker],
  );
  useEffect(() => {
    setMarkerColour(marker, tunnelLook(theme).flow.smoke);
    invalidate();
  }, [marker, theme, invalidate]);
  const still = wandMode(paused, reduced) === "static";
  useEffect(() => {
    const flow = loaded?.flow;
    const c = controls.current;
    if (!wand || !flow || flow.wandSlots === 0 || !c) return;
    return bindWand({ dom: gl.domElement, camera: camera as THREE.PerspectiveCamera, controls: c, flow, marker, state: wandState.current, still, invalidate });
  }, [wand, still, loaded, gl, camera, marker, invalidate]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const cam = controls.current?.update(dt) ?? false;
    if (wand && !still && loaded?.flow) driveWand(wandState.current, loaded.flow, marker, dt);
    if (!loaded) {
      if (cam) invalidate();
      return;
    }
    pose.current ??= { ...target };
    if (tick(loaded, pose.current, target, dt, speedKmh, paused) || cam) invalidate();
    if (!announced.current) {
      announced.current = true;
      requestAnimationFrame(() => onReady());
    }
  });

  if (!loaded) return null;
  return (
    <>
      <primitive object={loaded.root} />
      <primitive object={ground} />
      <primitive object={marker} />
      {loaded.flow && <primitive object={loaded.flow.object} />}
    </>
  );
}

export default function TunnelStage({ active, paused, mobile: mobileAtMount, ...rest }: TunnelStageProps) {
  // Decided once per mount: rotating a phone must not rebuild the particles or reload the car.
  const [mobile] = useState(mobileAtMount);
  const [lost, setLost] = useState(false);
  const onLost = useCallback(() => setLost(true), []);
  const onRestored = useCallback(() => setLost(false), []);
  const running = active && !lost && !paused;
  const look = tunnelLook(useTheme());
  return (
    <Canvas
      flat
      frameloop={!active || lost ? "never" : running ? "always" : "demand"}
      dpr={[1, mobile ? 1.5 : 2]}
      gl={{ powerPreference: "high-performance", antialias: !mobile }}
      camera={{ fov: FOV, near: 0.05, far: 100, position: [...EYE] }}
      data-stage-canvas
    >
      <ContextGuard onLost={onLost} onRestored={onRestored} />
      <color attach="background" args={[look.background]} />
      <hemisphereLight args={[look.hemisphere.sky, look.hemisphere.ground, look.hemisphere.intensity]} />
      <directionalLight position={[-3, 5, 4]} intensity={2.2} />
      <directionalLight position={[4, 2, -3]} intensity={0.6} />
      <Scene {...rest} mobile={mobile} paused={paused} />
    </Canvas>
  );
}

function ContextGuard({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    el.addEventListener("webglcontextlost", lost);
    el.addEventListener("webglcontextrestored", onRestored);
    return () => {
      el.removeEventListener("webglcontextlost", lost);
      el.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, onLost, onRestored]);
  return null;
}
