"use client";

/**
 * <ExplodeStage>: the canvas. Everything three-related lives behind this module, so it must only be
 * reached through `next/dynamic` (see src/app/stage-client.tsx); the barrel does not re-export it.
 *
 * Rendering is on demand: a frame is drawn only while the explode tween, a hover or isolate fade,
 * a look (scale or tint) tween, or the camera is moving, and never while the gate says nobody can
 * see it.
 *
 * Looks: a part scales about its own node origin, so a model meant to be scaled per part should put
 * each part's origin at its centre (scripts/build-models.mjs does).
 *
 * Framing: the camera fits the pose the slider is heading for (`fit="pose"`, refitting on explode and
 * assemble while nothing is selected), or both poses together (`fit="union"`, never refitting). How
 * tightly is `frame`, else the sidecar's `assembly.frame`; the first angle is the sidecar's
 * `assembly.camera`, else `initialAngles`.
 *
 * Themes: `palette`, `background`, `accent` and `render` each take one value or `{ light, dark }`. The
 * stage follows `data-theme` on <html> (see useTheme) and eases its lights and colours to the new
 * theme's values over ~300 ms, instantly under reduced motion, without reloading the model.
 *
 * Realism (`render`, all opt-in, see ./render): image-based lighting (three's room, or the photo
 * studio of ./studio), tone mapping, N8AO ambient occlusion (a lazy chunk of its own, drawn through an
 * EffectComposer when on), shadow quality and a contact shadow. With none of it set the canvas draws
 * exactly as it always did. The ground (shadow catcher and contact shadow) sits on the model's lowest
 * point as it is posed right now, so an assembled model rests on its shadow and an exploded one never
 * sinks through the floor.
 */
import { createContext, lazy, Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { addAfterEffect, advance, Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ArOptions } from "./ar";
import { createCameraControls, focusPart, type CameraControls } from "./camera";
import { ContactShadow } from "./contact-shadow";
import { hasDeepLink } from "./deep-link";
import { SceneBoundary } from "./gate";
import { frameShown, poseSphere, resolveFrame, unionSphere, type Frame } from "./framing";
import { layoutLeaders, leaderShown, type Anchor } from "./leaders";
import { disposeModel, loadModel } from "./loader";
import { easeOut, lerpLook, resolveLook, THEME_EASE_SECONDS, type Look } from "./look";
import type { MaterialHook } from "./materials";
import { openingPose } from "./opening";
import { applyExplode, buildPlan, type ExplodePlan } from "./plan";
import { DEFAULT_STUDIO, dprCeiling, readQualityEnv, type ContactOptions, type EnvKind, type RenderProp, type ResolvedRender, type StudioOptions } from "./render";
import { groundHeight, lowestPoint } from "./ground";
import type { Sidecar } from "./sidecar";
import type { ExplodeStore } from "./store";
import { buildStudioScene, disposeStudioScene, studioLayout, STUDIO_RADIUS } from "./studio";
import { resolvePalette, type StagePalette, type Themed } from "./theme";
import { useTheme } from "./use-theme";
import { XRAY_GHOST_ABOVE, xrayBlend, xrayOpacity, xrayParts, type Blend } from "./xray";

// The AO chunk (n8ao, three's EffectComposer) is fetched only when a stage turns AO on.
const AoEffect = lazy(() => import("./ao"));

export interface ExplodeStageProps {
  sidecar: Sidecar;
  /** GLB URL; defaults to sidecar.model. */
  model?: string;
  store: ExplodeStore;
  onSelect?: (id: string | null) => void;
  /** Decided once per mount: rotating a phone must not tear the canvas down. */
  mobile?: boolean;
  reduced?: boolean;
  /** False pauses drawing entirely (off screen, hidden tab). */
  active?: boolean;
  onReady?: () => void;
  onFail?: () => void;
  /** Page background, the colour isolated-out parts fade toward. One colour, or one per theme. */
  background?: Themed<string>;
  /** One colour, or one per theme. */
  accent?: Themed<string>;
  /** Lighting and shadow colours; each app sets its own look. One partial palette, or `{ light, dark }` of them. */
  palette?: Themed<Partial<StagePalette>>;
  /**
   * Opt-in realism: environment lighting, tone mapping, ambient occlusion, shadow quality, a contact
   * shadow, and the quality tier that gates the costly ones. One set of options, or `{ light, dark }`
   * of partial overrides. Colours, exposure and the environment's strength ease on a theme change;
   * the rest switch at once. Unset, the stage draws as it always did.
   */
  render?: RenderProp;
  /**
   * Runs once per mesh of each part after load (before the stage clones and tints its materials):
   * swap in a preset from ./materials or edit the material in place. Must be stable across renders
   * (a module function or a memoised callback), or the model reloads.
   */
  materials?: MaterialHook;
  /**
   * Turns on "View in AR" for this model: how big it is in the real world (see ./ar). Without it
   * `store.exportModel` answers null. The export (assembled, plain materials, in metres) is built by
   * ./ar-export, fetched only when a visitor asks for it. Must be a plain value: it is compared by content.
   */
  ar?: ArOptions;
  /** Label every pickable part with a leader line, in two columns either side of the model. */
  leaders?: boolean;
  /**
   * Framing as a fraction of the fitted sphere (smaller is closer); a pair sets the assembled and
   * exploded poses apart. Falls back to the sidecar's `assembly.frame`, then 1.
   */
  frame?: Frame;
  /**
   * What the camera fits: "pose" (default) the assembled or exploded pose the slider heads for, and
   * refits on explode and assemble; "union" both poses together, once, and never again.
   */
  fit?: "pose" | "union";
  /**
   * How far above the canvas centre the whole model sits, as a fraction of its framed radius: room
   * for something laid over the bottom of the stage. Part focus views are not lifted.
   */
  lift?: number;
  /** First camera angle, [azimuth, polar] in radians, when the sidecar has no `assembly.camera`. Default [0.6, 1.1]. */
  initialAngles?: [number, number];
  /** Fly the camera to a part when it is selected. A game that selects parts to pick them up turns this off. */
  focusOnSelect?: boolean;
  /**
   * First-load fly-in: the camera starts far out and eases to the fitted pose over about two seconds.
   * Skipped under reduced motion and when the address carries a deep link (`?part=`, `?explode=`).
   * `store.opening` is true while it runs; readiness is not held for it.
   */
  opening?: boolean;
  /**
   * Runs once per loaded scene, before the explode plan is measured: add procedural parts (sidecar
   * `procedural: true`) under `root`, or swap materials. Must be stable across renders (a module
   * function or a memoised callback), or the model reloads.
   */
  onModel?: (root: THREE.Object3D) => void;
  /**
   * Extra scene content, rendered inside the canvas once the model has loaded. It reads the loaded
   * parts and the camera controls with useStageScene(). The build game mounts its layer here.
   */
  children?: ReactNode;
}

/** What scene children (see ExplodeStageProps.children) can reach. */
export interface StageScene {
  root: THREE.Object3D;
  /** Each sidecar part id to its node. */
  parts: Map<string, THREE.Object3D>;
  /** Bounds of the assembled and exploded poses together. */
  sphere: THREE.Sphere;
  /** The camera controls, once created: disable them while dragging. */
  getControls(): CameraControls | null;
  invalidate(): void;
}

const SceneContext = createContext<StageScene | null>(null);

/** The loaded model and camera, for components passed as ExplodeStage children. */
export function useStageScene(): StageScene {
  const scene = use(SceneContext);
  if (!scene) throw new Error("useStageScene must be used inside <ExplodeStage> children");
  return scene;
}

interface PartLook {
  mat: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  /** How the material was authored, which X-ray fades from and returns to. */
  blend: Blend;
}

interface PartState {
  id: string;
  obj: THREE.Object3D;
  meshes: THREE.Mesh[];
  looks: PartLook[];
  pickable: boolean;
  hover: number;
  sel: number;
  dim: number;
  /** In one of the sidecar's `xray` groups. */
  xray: boolean;
  /** Opacity factor the X-ray slider has faded this part to (1 = as authored), tweened. */
  fade: number;
  /** The system filter has hidden this part's group. */
  filtered: boolean;
  /** Pointer rays pass through it: filtered out, or faded past the point of being clicked. */
  blocked: boolean;
  /** The node's scale as loaded; looks multiply it. */
  baseScale: THREE.Vector3;
  scale: number;
  /** Blend toward `tint`, and the tint colour itself, both tweened. */
  amount: number;
  tint: THREE.Color;
}

interface Loaded {
  root: THREE.Object3D;
  plan: ExplodePlan;
  parts: Map<string, PartState>;
  rig: THREE.Group;
  /** Covers the model assembled and exploded together. */
  sphere: THREE.Sphere;
  /**
   * Bounding spheres of the assembled and the exploded pose, at root scale 1: what the camera frames.
   * Recomputed in place from the visible parts when the system filter changes (see `setHidden`).
   */
  rest: THREE.Sphere;
  exploded: THREE.Sphere;
  /** The sphere `fit="union"` frames: both poses together, from the visible parts. */
  frameSphere: THREE.Sphere;
  /** The sidecar's framing factor, if it sets one. */
  frame: number | null;
  /** The lights and the shadow catcher, kept so a theme change can retune them without a reload. */
  key: THREE.DirectionalLight;
  rims: THREE.DirectionalLight[];
  groundMat: THREE.ShadowMaterial;
  /** Where the model's ground contact is centred; `y` is the ground's current height (see `setGround`). */
  ground: THREE.Vector3;
  /** Puts the ground on the model's lowest point as posed now. */
  setGround(): void;
  /**
   * Hides the parts of the given groups (and shows the rest) and reframes on what is left. Returns
   * whether it changed anything: the same set twice is free, so callers may repeat it.
   */
  setHidden(hidden: ReadonlySet<string>): boolean;
  dispose(): void;
}

const TONE_MAPPING = { none: THREE.NoToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping } as const;
const OUTLINE_SCALE = 1.03;
/** The contact shadow's plane rides this far above the ground plane (of the model's radius), so the two do not z-fight. */
const CONTACT_LIFT = 0.002;
const FADE = 12;
/** Look (age) tween rate, per second: slower than a hover so a stage change reads as growth. */
const LOOK = 4;

/** Meshes that belong to this part and not to a part nested inside it. */
function ownMeshes(obj: THREE.Object3D, isPart: (o: THREE.Object3D) => boolean): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    for (const c of o.children) if (!isPart(c)) walk(c);
  };
  walk(obj);
  return out;
}

/** Retunes the key light, the rims and the shadow catcher to a palette (the hemisphere light is the stage's). */
function applyPalette(loaded: Loaded, palette: StagePalette) {
  const { key, rims, groundMat, sphere } = loaded;
  key.color.set(palette.key);
  key.intensity = palette.keyIntensity;
  key.position.copy(sphere.center).add(offset.set(...palette.keyFrom).multiplyScalar(sphere.radius));
  groundMat.color.set(palette.shadow);
  groundMat.opacity = palette.shadowOpacity;
  rims.forEach((rim, i) => {
    rim.color.set(palette.rim);
    rim.intensity = palette.rimIntensity;
    rim.position.copy(sphere.center).add(offset.set(sphere.radius * 1.2, sphere.radius * 0.5, (i === 0 ? 1 : -1) * sphere.radius * 1.1));
  });
}

// These write to objects the component got from hooks (the renderer, the scene, a light); the React
// compiler's lint forbids that in the component body, so each is a module function that takes them.

function applyHemisphere(light: THREE.HemisphereLight, palette: StagePalette) {
  light.color.set(palette.sky);
  light.groundColor.set(palette.ground);
  light.intensity = palette.hemisphere;
}

/** The renderer's and scene's numbers for a look: exposure, and the environment's strength and turn. */
function applyGrade(gl: THREE.WebGLRenderer, scene: THREE.Scene, render: ResolvedRender) {
  gl.toneMappingExposure = render.exposure;
  scene.environmentIntensity = render.envIntensity;
  scene.environmentRotation.y = render.envRotation;
}

function setToneMapping(gl: THREE.WebGLRenderer, mode: keyof typeof TONE_MAPPING) {
  gl.toneMapping = TONE_MAPPING[mode];
}

function setEnvironment(scene: THREE.Scene, texture: THREE.Texture | null) {
  scene.environment = texture;
}

/** The key light's shadow map, at the size and softness the render options ask for. */
function applyShadow(light: THREE.DirectionalLight, render: ResolvedRender) {
  const { shadow } = light;
  if (shadow.mapSize.x !== render.shadowMapSize) {
    shadow.mapSize.set(render.shadowMapSize, render.shadowMapSize);
    // A map already drawn keeps its old size until it is dropped.
    shadow.map?.dispose();
    shadow.map = null;
  }
  shadow.radius = render.shadowRadius;
}

function prepare(root: THREE.Object3D, sidecar: Sidecar, look: Look, withRims: boolean, materials?: MaterialHook): Loaded {
  const { palette } = look;
  const plan = buildPlan(root, sidecar);
  const isPart = (o: THREE.Object3D) => plan.byId.has(o.name) && plan.byId.get(o.name)!.obj === o;
  const retired: THREE.Material[] = [];
  const parts = new Map<string, PartState>();
  const xrayIds = xrayParts(sidecar);
  for (const e of plan.parts) {
    const meshes = ownMeshes(e.obj, isPart);
    const looks: PartLook[] = [];
    for (const m of meshes) {
      m.castShadow = true;
      m.receiveShadow = true;
      // A part the filter has hidden, or the X-ray has faded out, must not catch a ray meant for what is behind it.
      const raycast = m.raycast;
      m.raycast = function (rc, hits) {
        if (!parts.get(e.id)?.blocked) raycast.call(this, rc, hits);
      };
      materials?.(m, e.id);
      // Clone once per mesh so tinting one part never tints another that shared its material.
      const src = Array.isArray(m.material) ? m.material : [m.material];
      const clones = src.map((mat) => {
        retired.push(mat);
        const c = mat.clone();
        // clone() drops shader hooks; a feature's onModel may have set them (a livery, say).
        c.onBeforeCompile = mat.onBeforeCompile;
        c.customProgramCacheKey = mat.customProgramCacheKey;
        if ((c as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const s = c as THREE.MeshStandardMaterial;
          looks.push({ mat: s, color: s.color.clone(), emissive: s.emissive.clone(), blend: { opacity: s.opacity, transparent: s.transparent, depthWrite: s.depthWrite } });
        }
        return c;
      });
      m.material = Array.isArray(m.material) ? clones : clones[0];
    }
    parts.set(e.id, { id: e.id, obj: e.obj, meshes, looks, pickable: sidecar.parts[e.id].pickable !== false, hover: 0, sel: 0, dim: 0,
      xray: xrayIds.has(e.id),
      fade: 1,
      filtered: false,
      blocked: false,
      baseScale: e.obj.scale.clone(),
      scale: 1,
      amount: 0,
      tint: new THREE.Color(),
    });
  }
  for (const m of new Set(retired)) m.dispose();

  // Measure the assembled and exploded poses once: they set the shadow frustum and the framing (the
  // ground follows the current pose, see setGround).
  // Kept per part (index-aligned with plan.parts) so the system filter can reframe on what is visible.
  const restBoxes = plan.parts.map((e) => new THREE.Box3().setFromObject(e.obj));
  const rest = new THREE.Box3();
  for (const b of restBoxes) rest.union(b);
  applyExplode(plan, 1);
  root.updateMatrixWorld(true);
  const explodedBoxes = plan.parts.map((e) => new THREE.Box3().setFromObject(e.obj));
  const exploded = new THREE.Box3();
  for (const b of explodedBoxes) exploded.union(b);
  applyExplode(plan, 0);
  root.updateMatrixWorld(true);
  const all = rest.clone().union(exploded);
  const sphere = all.getBoundingSphere(new THREE.Sphere());
  const restSphere = rest.getBoundingSphere(new THREE.Sphere());
  const explodedSphere = exploded.getBoundingSphere(new THREE.Sphere());

  const rig = new THREE.Group();
  const r = sphere.radius;
  const light = new THREE.DirectionalLight(palette.key, palette.keyIntensity);
  light.position.copy(sphere.center).add(new THREE.Vector3(...palette.keyFrom).multiplyScalar(r));
  light.target.position.copy(sphere.center);
  light.castShadow = true;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.02;
  Object.assign(light.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.1, far: r * 5 });
  light.shadow.camera.updateProjectionMatrix();
  applyShadow(light, look.render);
  const groundGeo = new THREE.PlaneGeometry(r * 6, r * 6);
  const groundMat = new THREE.ShadowMaterial({ color: palette.shadow, opacity: palette.shadowOpacity, depthWrite: false });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(sphere.center.x, groundHeight(rest.min.y, r), sphere.center.z);
  ground.receiveShadow = true;
  ground.raycast = () => {};
  rig.add(light, light.target, ground);
  // Rim lights sit behind the model's rear quarters (+x is the back of a car built nose to -x), so
  // from the usual front three-quarter view they catch its edges and lift it off a dark studio.
  const rims: THREE.DirectionalLight[] = [];
  if (withRims) {
    for (const side of [1, -1]) {
      const rim = new THREE.DirectionalLight(palette.rim, palette.rimIntensity);
      rim.position.copy(sphere.center).add(new THREE.Vector3(r * 1.2, r * 0.5, side * r * 1.1));
      rim.target.position.copy(sphere.center);
      rig.add(rim, rim.target);
      rims.push(rim);
    }
  }

  const groundAt = ground.position.clone();
  const frameSphere = sphere.clone();
  let appliedHidden: ReadonlySet<string> | null = null;
  return {
    root,
    plan,
    parts,
    rig,
    sphere,
    rest: restSphere,
    exploded: explodedSphere,
    frameSphere,
    setHidden(hidden) {
      if (hidden === appliedHidden) return false;
      appliedHidden = hidden;
      for (const p of parts.values()) {
        const group = sidecar.parts[p.id].group;
        const off = !!group && hidden.has(group);
        if (off === p.filtered) continue;
        p.filtered = off;
        p.obj.visible = !off;
      }
      // Frame what is left; with everything hidden the bounds stay as they were.
      frameShown(
        plan.parts.map((e, i) => ({ rest: restBoxes[i], exploded: explodedBoxes[i], shown: isShown(e.obj) })),
        { rest: restSphere, exploded: explodedSphere, union: frameSphere },
      );
      return true;
    },
    frame: sidecar.assembly.frame ?? null,
    key: light,
    rims,
    groundMat,
    ground: groundAt,
    setGround() {
      // The parts moved or scaled this frame and nothing has drawn them yet: bring their matrices up to date.
      root.updateMatrixWorld(true);
      const lowest = lowestPoint(plan.parts.map((e) => e.obj));
      if (lowest === null) return;
      groundAt.y = groundHeight(lowest, r);
      ground.position.y = groundAt.y;
    },
    dispose() {
      disposeModel(root);
      groundGeo.dispose();
      groundMat.dispose();
      light.dispose();
      for (const rim of rims) rim.dispose();
    },
  };
}

/** Keeps the canvas alive across a lost WebGL context: pause while lost, redraw on restore. */
function ContextGuard({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      // preventDefault asks the browser to restore the context later.
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

function Rig({ loaded, store, sidecar, active, reduced, onControls, angles, frame, fit, lift, focusOnSelect, opening }: {
  loaded: Loaded | null;
  store: ExplodeStore;
  sidecar: Sidecar;
  active: boolean;
  reduced: boolean;
  /** Receives the controls once created (and null on teardown), for the stage's children. */
  onControls: (c: CameraControls | null) => void;
  angles: [number, number];
  frame: Frame | undefined;
  fit: "pose" | "union";
  lift: number;
  focusOnSelect: boolean;
  opening: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<CameraControls | null>(null);
  /** The fly-in in progress: seconds elapsed, and the fitted pose it eases to. */
  const fly = useRef<{ t: number; azimuth: number; distance: number } | null>(null);
  /** The model the fly-in has already been offered to, so a re-run of the effect below never restarts it. */
  const flown = useRef<Loaded | null>(null);

  useEffect(() => {
    const c = createCameraControls(camera as THREE.PerspectiveCamera, gl.domElement);
    controls.current = c;
    onControls(c);
    const wake = () => invalidate();
    const events = ["control", "controlstart", "transitionstart", "wake"] as const;
    for (const ev of events) c.addEventListener(ev, wake);
    return () => {
      for (const ev of events) c.removeEventListener(ev, wake);
      c.dispose();
      controls.current = null;
      onControls(null);
    };
  }, [camera, gl, invalidate, onControls]);

  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);

  useEffect(() => {
    const c = controls.current;
    if (!loaded || !c) return;
    const sphere = new THREE.Sphere();
    const box = new THREE.Box3();
    const framing = resolveFrame(frame, loaded.frame);
    const fitTo = (s: THREE.Sphere, animate: boolean) => {
      void c.fitToSphere(s, animate);
      if (lift !== 0) void c.setFocalOffset(0, lift * s.radius, 0, animate);
    };
    // Home: the sidecar's camera angle (else the stage's), sized to the pose the slider is heading
    // for, or to both poses with fit="union". Used on load and by Reset view.
    const home = (animate: boolean) => {
      const angle = sidecar.assembly.camera;
      void c.rotateTo(angle?.azimuth ?? angles[0], angle?.polar ?? angles[1], animate);
      fitTo(fit === "union" ? unionSphere({ sphere: loaded.frameSphere }, framing, sphere) : poseSphere(loaded, store.getState().target, framing, sphere), animate);
    };
    loaded.setHidden(store.getState().hidden);
    home(false);
    const first = store.getState();
    const chosen = first.selected ? loaded.parts.get(first.selected) : undefined;
    if (chosen && focusOnSelect && store.frameK() === first.target) {
      // A deep link arrived with a part: it opens on that part, as if it had just been picked.
      focusPart(c, chosen.obj, sidecar.parts[chosen.id].view, false);
    }
    // The opening: from far out, once per model, unless the visitor asked for a part or for less motion.
    const stopFly = () => {
      if (!fly.current) return;
      fly.current = null;
      store.set({ opening: false });
    };
    if (flown.current !== loaded) {
      flown.current = loaded;
      if (opening && !reduced && !first.selected && !hasDeepLink(window.location.search, Object.keys(sidecar.parts))) {
        fly.current = { t: 0, azimuth: c.azimuthAngle, distance: c.distance };
        void c.rotateAzimuthTo(c.azimuthAngle + openingPose(0).azimuth, false);
        void c.dollyTo(c.distance * openingPose(0).distance, false);
        store.set({ opening: true });
      }
    }
    // Grabbing the camera ends it at once: the visitor is in charge.
    c.addEventListener("controlstart", stopFly);
    invalidate();

    let prev = store.getState();
    const unsub = store.subscribe(() => {
      const st = store.getState();
      const part = st.selected ? loaded.parts.get(st.selected) : undefined;
      if (st.hidden !== prev.hidden) {
        // A system hidden or shown: reframe on what is left, from the visitor's angle.
        loaded.setHidden(st.hidden);
        if (!part) fitTo(fit === "union" ? unionSphere({ sphere: loaded.frameSphere }, framing, sphere) : poseSphere(loaded, st.target, framing, sphere), !reduced);
      }
      if (part) {
        // Focus only on an explicit pick, once the explode tween has arrived. An age change is not
        // a pick: the camera stays where the visitor left it.
        if (focusOnSelect && (st.selected !== prev.selected || st.k !== prev.k) && store.frameK() === st.target) {
          if (lift !== 0) void c.setFocalOffset(0, 0, 0, !reduced);
          focusPart(c, part.obj, sidecar.parts[part.id].view, !reduced);
        }
      } else if (fit === "pose" && st.target !== prev.target) {
        // Explode and assemble refit the whole model from the visitor's current angle, so the
        // exploded pose never spills out of the canvas and the assembled one fills it.
        fitTo(poseSphere(loaded, st.target, framing, sphere), !reduced);
      }
      if (st.applied !== prev.applied && prev.applied !== null) {
        // A look (age) tween settled and moved the model under the camera. Recentre on the selected
        // part, or the whole model, at the same distance: it stays in view and the size change
        // still reads, where a refit would cancel it out.
        const centre = part ? box.setFromObject(part.obj).getCenter(sphere.center) : poseSphere(loaded, store.frameK(), framing, sphere).center;
        void c.moveTo(centre.x, centre.y, centre.z, !reduced);
      }
      // A pick or an explode ends the fly-in, after its own camera move is issued. Last, because
      // stopFly publishes to the store, which calls this handler again.
      const picked = st.selected !== prev.selected || st.target !== prev.target;
      prev = st;
      if (picked) stopFly();
    });
    const unreset = store.onResetView(() => home(!reduced));
    return () => {
      unsub();
      unreset();
      c.removeEventListener("controlstart", stopFly);
    };
  }, [loaded, store, sidecar, reduced, invalidate, angles, frame, fit, lift, focusOnSelect, opening]);

  useFrame((_, delta) => {
    const c = controls.current;
    const f = fly.current;
    if (c && f) {
      f.t += Math.min(delta, 0.1);
      const pose = openingPose(f.t);
      void c.rotateAzimuthTo(f.azimuth + pose.azimuth, false);
      void c.dollyTo(f.distance * pose.distance, false);
      invalidate();
      if (pose.done) {
        fly.current = null;
        store.set({ opening: false });
      }
    }
    if (c?.update(Math.min(delta, 0.1))) invalidate();
  });
  return null;
}

/**
 * Lights the model with a procedural environment, as `scene.environment`: never the background. The
 * room is three's RoomEnvironment; the studio is built in ./studio. A change of kind or of the
 * studio's settings rebuilds the PMREM at once (the old one is disposed), and never touches the model.
 */
function Studio({ kind, studio: { key, strips, surround } }: { kind: EnvKind | null; studio: Required<StudioOptions> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!kind) return;
    const pmrem = new THREE.PMREMGenerator(gl);
    let target: THREE.WebGLRenderTarget;
    if (kind === "room") {
      const room = new RoomEnvironment();
      target = pmrem.fromScene(room, 0.04);
      room.dispose();
    } else {
      const built = buildStudioScene(studioLayout({ key, strips, surround }));
      // No pre-blur (sigma 0): the PMREM's own roughness levels soften a reflection, and a clearcoat keeps crisp stripes.
      target = pmrem.fromScene(built, 0, 0.1, STUDIO_RADIUS * 2);
      disposeStudioScene(built);
    }
    setEnvironment(scene, target.texture);
    invalidate();
    return () => {
      if (scene.environment === target.texture) setEnvironment(scene, null);
      target.dispose();
      pmrem.dispose();
      invalidate();
    };
  }, [kind, key, strips, surround, gl, scene, invalidate]);
  return null;
}

/** The contact shadow under the model, redrawn each drawn frame after the model has moved. */
function Contact({ loaded, options }: { loaded: Loaded; options: ContactOptions }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const shadow = useRef<ContactShadow | null>(null);

  useEffect(() => {
    const at = loaded.ground.clone();
    at.y += loaded.sphere.radius * CONTACT_LIFT;
    const made = new ContactShadow(loaded.sphere.radius, at, options);
    shadow.current = made;
    loaded.rig.add(made.mesh);
    invalidate();
    return () => {
      loaded.rig.remove(made.mesh);
      made.dispose();
      shadow.current = null;
      invalidate();
    };
    // `options` is applied by the effect below; recreating on every change would flash the shadow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, invalidate]);

  useEffect(() => {
    shadow.current?.set(options);
    invalidate();
  }, [options, invalidate]);

  useFrame(() => {
    const outline = scene.getObjectByName("__explode_outline");
    shadow.current?.setHeight(loaded.ground.y + loaded.sphere.radius * CONTACT_LIFT);
    shadow.current?.update(gl, scene, outline ? [loaded.rig, outline] : [loaded.rig]);
  });
  return null;
}

/** What Model keeps of the theme easing: where it started, where it is heading, how far along. */
interface LookEase {
  cur: Look;
  from: Look;
  to: Look;
  /** 0 to 1. */
  p: number;
  /** A look was set outright this frame and has not been applied yet. */
  dirty: boolean;
}

function Model({ url, sidecar, store, reduced, onSelect, onReady, onFail, look, withRims, hemi, onLoaded, onModel, materials, ar }: {
  url: string;
  /** Where the stage is heading; Model eases toward it whenever it changes. */
  look: Look;
  /** Whether either theme's palette has rim lights, so they exist to be tuned. */
  withRims: boolean;
  hemi: RefObject<THREE.HemisphereLight | null>;
  sidecar: Sidecar;
  store: ExplodeStore;
  reduced: boolean;
  onSelect?: (id: string | null) => void;
  onReady?: () => void;
  onFail?: () => void;
  onLoaded: (l: Loaded | null) => void;
  onModel?: (root: THREE.Object3D) => void;
  materials?: MaterialHook;
  ar?: ArOptions;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const ease = useRef<LookEase>({ cur: look, from: look, to: look, p: 1, dirty: true });
  const colours = useRef({ bg: new THREE.Color(look.background), accent: new THREE.Color(look.accent) });
  const tintTarget = useRef(new THREE.Color());
  /** The root's live scale from looks; a fresh model starts at 1. */
  const rootScale = useRef(1);
  const outline = useRef<{ group: THREE.Group; mat: THREE.MeshBasicMaterial; id: string | null; items: { o: THREE.Mesh; m: THREE.Mesh; c: THREE.Vector3 }[] } | null>(null);
  const announced = useRef<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    let mine: Loaded | null = null;
    loadModel(url)
      .then((root) => {
        if (!live) return disposeModel(root);
        onModel?.(root);
        mine = prepare(root, sidecar, ease.current.cur, withRims, materials);
        rootScale.current = 1;
        setLoaded(mine);
        onLoaded(mine);
      })
      .catch((e: unknown) => {
        if (!live) return;
        store.set({ error: e instanceof Error ? e.message : String(e) });
        onFail?.();
      });
    return () => {
      live = false;
      mine?.dispose();
      onLoaded(null);
      store.set({ ready: false });
    };
  }, [url, sidecar, store, onFail, onLoaded, onModel, materials, withRims]);

  // Everything about a look that is not a colour or a number switches at once, on the target.
  const { toneMapping, shadowMapSize, shadowRadius } = look.render;
  useEffect(() => {
    setToneMapping(gl, toneMapping);
    invalidate();
    return () => setToneMapping(gl, "none");
  }, [gl, invalidate, toneMapping]);
  useEffect(() => {
    if (loaded) applyShadow(loaded.key, look.render);
    invalidate();
    // shadowMapSize and shadowRadius are what applyShadow reads of the render options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, invalidate, shadowMapSize, shadowRadius]);

  // A new target look starts an ease from wherever the last one had got to.
  useEffect(() => {
    const e = ease.current;
    if (e.to === look) return;
    e.from = e.cur;
    e.to = look;
    if (reduced) {
      e.cur = look;
      e.p = 1;
    } else {
      e.p = 0;
    }
    e.dirty = true;
    invalidate();
  }, [look, reduced, invalidate]);

  /** Puts a look on the lights, the environment, exposure and the colours parts fade toward. */
  const applyLook = (l: Look, into: Loaded | null) => {
    if (hemi.current) applyHemisphere(hemi.current, l.palette);
    colours.current.bg.set(l.background);
    colours.current.accent.set(l.accent);
    outline.current?.mat.color.set(l.accent);
    applyGrade(gl, scene, l.render);
    if (into) applyPalette(into, l.palette);
  };

  // One shared outline for the selected part: a BackSide hull per mesh, drawn in accent.
  useEffect(() => {
    const group = new THREE.Group();
    group.name = "__explode_outline";
    const mat = new THREE.MeshBasicMaterial({ color: colours.current.accent, side: THREE.BackSide, toneMapped: false });
    scene.add(group);
    outline.current = { group, mat, id: null, items: [] };
    return () => {
      scene.remove(group);
      mat.dispose();
      outline.current = null;
    };
  }, [scene]);

  // Any low-frequency change (target, hover, selection, isolate) needs at least one frame, and the
  // cursor says whether a click would pick something.
  useEffect(() => {
    const el = gl.domElement;
    const unsub = store.subscribe(() => {
      setCursor(el, store.getState().hovered ? "pointer" : "");
      invalidate();
    });
    return () => {
      unsub();
      setCursor(el, "");
    };
  }, [store, invalidate, gl]);

  // The Screenshot button's request: draw one frame and read the canvas in the same task, right after
  // it is drawn, while the drawing buffer still holds it (so `preserveDrawingBuffer` stays off). The
  // canvas is transparent, so the PNG is laid over the page background.
  useEffect(() => {
    return store.onCapture(
      () =>
        new Promise<Blob | null>((resolve) => {
          let off = () => {};
          // A lost context draws nothing, so the after effect below may never run.
          const timer = setTimeout(() => finish(null), 3000);
          const finish = (blob: Blob | null) => {
            off();
            clearTimeout(timer);
            resolve(blob);
          };
          off = addAfterEffect(() => {
            off();
            // The frame is drawn; PNG encoding can take seconds on a slow device, so the timeout
            // (which only guards a frame that never comes) stops here.
            clearTimeout(timer);
            const src = gl.domElement;
            const out = document.createElement("canvas");
            out.width = src.width;
            out.height = src.height;
            const c2d = out.getContext("2d");
            if (!c2d) return finish(null);
            c2d.fillStyle = colours.current.bg.getStyle();
            c2d.fillRect(0, 0, out.width, out.height);
            c2d.drawImage(src, 0, 0);
            out.toBlob(finish, "image/png");
          });
          // Drawn with `advance`, synchronously: `invalidate` only asks the loop, and a paused or idle
          // demand loop never ran the after effect.
          advance(performance.now());
        }),
    );
  }, [store, gl]);

  // The AR button's request: the assembled model as a GLB or USDZ, built off to the side from the
  // parts' own colours (see ./ar-export). Fetched only now, so nothing AR is in the stage's own chunk.
  useEffect(() => {
    if (!ar || !loaded) return;
    return store.onExportModel((kind) =>
      import("./ar-export")
        .then(({ exportForAr }) =>
          exportForAr(kind, { root: loaded.root, plan: loaded.plan, parts: loaded.parts.values(), k: store.frameK() }, ar),
        )
        .catch((e: unknown) => {
          console.warn("AR export failed:", e);
          return null;
        }),
    );
  }, [store, loaded, ar]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    // A theme change eases the lights and colours; a look set outright (first frame, a new model,
    // reduced motion) is applied once. Either way the parts' colours are recomputed below.
    const e = ease.current;
    let restyled = e.dirty;
    let easing = false;
    e.dirty = false;
    if (e.p < 1) {
      e.p = Math.min(1, e.p + dt / THEME_EASE_SECONDS);
      e.cur = lerpLook(e.from, e.to, easeOut(e.p));
      restyled = true;
      easing = e.p < 1;
    }
    if (restyled) applyLook(e.cur, loaded);
    if (!loaded) {
      if (easing) invalidate();
      return;
    }
    let moving = store.step(dt, reduced);
    const posed = moving || announced.current !== loaded;
    if (moving) applyExplode(loaded.plan, store.frameK());
    if (easing) moving = true;

    const s = store.getState();
    // The system filter: hidden groups are not drawn, and the ground and the camera's bounds skip them.
    const filterChanged = loaded.setHidden(s.hidden);
    const ghost = s.xray > XRAY_GHOST_ABOVE;
    const { bg, accent: acc } = colours.current;
    // The first frame of a model takes its looks at once rather than growing into them.
    const first = announced.current !== loaded;
    const blend = reduced || first ? 1 : 1 - Math.exp(-FADE * dt);
    const lookBlend = reduced || first ? 1 : 1 - Math.exp(-LOOK * dt);
    const step = (v: number, t: number, b = blend) => (Math.abs(t - v) < 1e-3 ? t : v + (t - v) * b);
    let lookMoved = false;
    const rootTarget = s.looks?.root ?? 1;
    if (rootScale.current !== rootTarget) {
      rootScale.current = step(rootScale.current, rootTarget, lookBlend);
      loaded.root.scale.setScalar(rootScale.current);
      lookMoved = true;
    }
    const tint = tintTarget.current;
    for (const p of loaded.parts.values()) {
      const th = s.hovered === p.id ? 1 : 0;
      const ts = s.selected === p.id ? 1 : 0;
      const td = s.isolated && s.selected && s.selected !== p.id ? 1 : 0;
      const look = s.looks?.parts[p.id];
      const tScale = look?.scale ?? 1;
      const tAmount = look?.tint ? (look.amount ?? 0) : 0;
      const tFade = p.xray ? xrayOpacity(s.xray) : 1;
      p.blocked = p.filtered || (p.xray && ghost);
      // With no tint the colour stays put while the amount fades out.
      if (look?.tint) tint.set(look.tint);
      else tint.copy(p.tint);
      const tintDone = p.tint.equals(tint);
      if (!restyled && p.hover === th && p.sel === ts && p.dim === td && p.scale === tScale && p.amount === tAmount && tintDone && p.fade === tFade) continue;
      p.hover = step(p.hover, th);
      p.sel = step(p.sel, ts);
      p.dim = step(p.dim, td);
      p.fade = step(p.fade, tFade);
      if (p.scale !== tScale || p.amount !== tAmount || !tintDone) lookMoved = true;
      if (p.scale !== tScale) {
        p.scale = step(p.scale, tScale, lookBlend);
        p.obj.scale.copy(p.baseScale).multiplyScalar(p.scale);
      }
      p.amount = step(p.amount, tAmount, lookBlend);
      if (!tintDone) {
        p.tint.lerp(tint, lookBlend);
        if (Math.abs(p.tint.r - tint.r) + Math.abs(p.tint.g - tint.g) + Math.abs(p.tint.b - tint.b) < 3e-3) p.tint.copy(tint);
      }
      const glow = Math.max(p.hover * 0.35, p.sel * 0.22);
      for (const l of p.looks) {
        l.mat.color.copy(l.color).lerp(p.tint, p.amount).lerp(bg, p.dim * 0.85);
        l.mat.emissive.copy(l.emissive).lerp(acc, glow * (1 - p.dim));
        if (p.xray) {
          // A faded layer is transparent and stops writing depth; back at 1 it is exactly as authored.
          // Flipping `transparent` changes the shader's variant, so it needs a rebuild, once per crossing.
          const b = xrayBlend(l.blend, p.fade);
          l.mat.opacity = b.opacity;
          if (l.mat.transparent !== b.transparent || l.mat.depthWrite !== b.depthWrite) {
            l.mat.transparent = b.transparent;
            l.mat.depthWrite = b.depthWrite;
            l.mat.needsUpdate = true;
          }
        }
      }
      // A ghost casts no shadow of its own.
      if (p.xray) for (const m of p.meshes) m.castShadow = p.fade > 0.5;
      moving = true;
    }
    // The ground follows the pose: whatever moved a part this frame (the explode tween, a look's scale
    // or root scale, a group shown or hidden), and the first frame of a model.
    if (posed || lookMoved || filterChanged) loaded.setGround();
    if (lookMoved) moving = true;
    else if (s.applied?.looks !== s.looks) {
      // Settled: say what was drawn, read off the scene, so the page can report it.
      const parts: Record<string, number> = {};
      for (const p of loaded.parts.values()) parts[p.id] = (p.obj.scale.x / p.baseScale.x) * loaded.root.scale.x;
      store.set({ applied: { looks: s.looks, root: loaded.root.scale.x, parts } });
    }

    const o = outline.current;
    if (o) {
      if (o.id !== s.selected) {
        for (const it of o.items) o.group.remove(it.o);
        o.items = [];
        o.id = s.selected;
        const part = s.selected ? loaded.parts.get(s.selected) : undefined;
        for (const m of part?.meshes ?? []) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          const hull = new THREE.Mesh(m.geometry, o.mat);
          hull.matrixAutoUpdate = false;
          hull.raycast = () => {};
          o.group.add(hull);
          o.items.push({ o: hull, m, c: m.geometry.boundingBox!.getCenter(new THREE.Vector3()) });
        }
        moving = true;
      }
      // Follow the part: its world matrix, scaled about its own bounds centre.
      for (const it of o.items) {
        it.m.updateWorldMatrix(true, false);
        it.o.matrix
          .copy(it.m.matrixWorld)
          .multiply(tmp.makeTranslation(it.c.x, it.c.y, it.c.z))
          .multiply(tmpS.makeScale(OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE))
          .multiply(tmp.makeTranslation(-it.c.x, -it.c.y, -it.c.z));
      }
    }

    if (moving) invalidate();
    if (announced.current !== loaded) {
      announced.current = loaded;
      // The model is in this frame; say so once it has been drawn.
      requestAnimationFrame(() => {
        store.set({ ready: true });
        onReady?.();
      });
    }
  });

  const partOf = useCallback(
    (o: THREE.Object3D): PartState | null => {
      if (!loaded) return null;
      for (let x: THREE.Object3D | null = o; x; x = x.parent) {
        const p = loaded.parts.get(x.name);
        if (p && p.obj === x) return p;
        if (x === loaded.root) break;
      }
      return null;
    },
    [loaded],
  );
  // three's raycaster and R3F both ignore `visible`, so a hidden part must be skipped here.
  const shown = (o: THREE.Object3D) => {
    for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  const hit = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = partOf(e.object);
    return p && p.pickable && shown(e.object) ? p : null;
  };

  if (!loaded) return null;
  return (
    <>
      <primitive
        object={loaded.root}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          const p = hit(e);
          if (!p) return;
          e.stopPropagation();
          store.hover(p.id);
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          const p = partOf(e.object);
          if (!p) return;
          e.stopPropagation();
          if (store.getState().hovered === p.id) store.hover(null);
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          // A drag that orbited the camera still ends in a click; only a still click selects.
          if (e.delta > 4) return;
          const p = hit(e);
          if (!p) return;
          e.stopPropagation();
          const next = store.getState().selected === p.id ? null : p.id;
          store.select(next);
          onSelect?.(next);
        }}
      />
      <primitive object={loaded.rig} />
    </>
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";
/**
 * Leader layout, px: label pitch; frame margin; top and bottom padding clear of a plate's number and
 * caption; the widest label; leader end to text; and the gap a column keeps from the model.
 */
const LEADER = { gap: 20, margin: 28, pad: 56, column: 250, inset: 6, reach: 20 };
/** Below this stage width only the hovered or selected part keeps its label. */
const LEADER_NARROW = 560;

interface LeaderEls {
  label: HTMLButtonElement;
  line: SVGGElement;
  /** The part's bounds centre in its own space, so explode moves and looks carry the anchor along. */
  centre: THREE.Vector3;
  /** The label's text, measured on its own: a button's scrollWidth stops at its max-width. */
  text: HTMLSpanElement;
  /** The label's text width, px. */
  w: number;
  /** The part's sidecar `leader` policy: a "hover" part's label shows only while hovered or selected. */
  policy: "always" | "hover" | undefined;
}

/** Records on the overlay whether the stage is in few-labels mode, for the page's styles and checks. */
function markFew(host: HTMLElement | null, few: boolean) {
  if (host) host.dataset.few = String(few);
}

/** Hides a part's label and its leader line. */
function hideLeader(e: LeaderEls) {
  e.label.style.display = "none";
  e.line.style.display = "none";
}

/**
 * Unhides a label and measures its text. Read every drawn frame, before the layout writes, so it is
 * one layout and follows the webfont swap and the selected label's heavier weight. Rounded up:
 * offsetWidth rounds, and a label cut by a fraction of a pixel shows an ellipsis. Kept out of the
 * component so the per-frame DOM writes stay plain code, not something a hook closure mutates.
 */
function measureLabel(e: LeaderEls): number {
  if (e.label.style.display === "none") e.label.style.display = "";
  e.w = Math.ceil(e.text.getBoundingClientRect().width) + 1;
  return e.w;
}

/** Every mesh with its geometry's own bounds, for the model's screen outline. */
interface OutlineMesh {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

function isShown(o: THREE.Object3D) {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/**
 * Atlas-style labels: each pickable part's name at the end of a leader line, in two columns either
 * side of the model. Written straight to the DOM every drawn frame, so they track the explode, the
 * camera and the looks without a React render. The labels repeat the part list, which is the
 * accessible way in, so they stay out of the tab order.
 */
function Leaders({ loaded, sidecar, store, overlay, onSelect }: {
  loaded: Loaded;
  sidecar: Sidecar;
  store: ExplodeStore;
  overlay: RefObject<HTMLDivElement | null>;
  onSelect?: (id: string | null) => void;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const els = useRef(new Map<string, LeaderEls>());
  const meshes = useRef<OutlineMesh[]>([]);

  useEffect(() => {
    const host = overlay.current;
    if (!host) return;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "absolute inset-0 h-full w-full");
    host.append(svg);
    const map = new Map<string, LeaderEls>();
    const box = new THREE.Box3();
    loaded.root.updateWorldMatrix(true, true);
    for (const p of loaded.parts.values()) {
      if (!p.pickable) continue;
      box.setFromObject(p.obj);
      if (box.isEmpty()) continue;
      const centre = p.obj.worldToLocal(box.getCenter(new THREE.Vector3()));
      const line = document.createElementNS(SVG_NS, "g");
      line.setAttribute("data-leader-line", p.id);
      line.append(document.createElementNS(SVG_NS, "line"), document.createElementNS(SVG_NS, "circle"));
      line.lastElementChild!.setAttribute("r", "2.5");
      svg.append(line);
      const label = document.createElement("button");
      label.type = "button";
      label.tabIndex = -1;
      label.dataset.leader = p.id;
      // A parenthetical is detail for the info panel; on the plate it only crowds the column.
      const text = document.createElement("span");
      text.textContent = sidecar.parts[p.id].label.replace(/\s*\(.*\)\s*$/, "");
      label.append(text);
      label.title = sidecar.parts[p.id].label;
      label.addEventListener("pointerenter", () => store.hover(p.id));
      label.addEventListener("pointerleave", () => {
        if (store.getState().hovered === p.id) store.hover(null);
      });
      label.addEventListener("click", () => {
        const next = store.getState().selected === p.id ? null : p.id;
        store.select(next);
        onSelect?.(next);
      });
      host.append(label);
      map.set(p.id, { label, text, line, centre, w: 0, policy: sidecar.parts[p.id].leader });
    }
    els.current = map;
    const outline: OutlineMesh[] = [];
    for (const p of loaded.parts.values()) {
      for (const mesh of p.meshes) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        outline.push({ mesh, box: mesh.geometry.boundingBox! });
      }
    }
    meshes.current = outline;
    invalidate();
    return () => {
      els.current = new Map();
      meshes.current = [];
      svg.remove();
      for (const e of map.values()) e.label.remove();
    };
  }, [loaded, sidecar, store, overlay, onSelect, invalidate]);

  useFrame(() => {
    const map = els.current;
    if (map.size === 0) return;
    const { width, height } = size;
    const st = store.getState();
    // On a narrow stage, and once a pick has brought the camera in close, the full set would sit on
    // top of the model: only the hovered and selected parts keep their labels. A part's own `leader`
    // policy is applied per part below, and is not counted here: the full layout is today's.
    const few = width < LEADER_NARROW || st.selected !== null;
    camera.updateMatrixWorld();
    markFew(overlay.current, few);
    const anchors: Anchor[] = [];
    for (const [id, e] of map) {
      const p = loaded.parts.get(id)!;
      let show = isShown(p.obj) && leaderShown(e.policy, few, st.hovered === id, st.selected === id);
      if (show) {
        p.obj.updateWorldMatrix(true, false);
        const v = anchor.copy(e.centre).applyMatrix4(p.obj.matrixWorld).project(camera);
        // A part out of frame (or behind the camera) has nothing to point at.
        show = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
        if (show) {
          anchors.push({ id, x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, w: measureLabel(e), extra: e.policy === "hover" });
        }
      }
      if (!show) {
        hideLeader(e);
      }
    }
    // The model's horizontal extent on screen, from each shown mesh's bounds, clamped to the frame.
    let minX = Infinity;
    let maxX = -Infinity;
    if (!few) {
      for (const { mesh, box } of meshes.current) {
        if (!isShown(mesh)) continue;
        mesh.updateWorldMatrix(true, false);
        for (let i = 0; i < 8; i++) {
          corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
          const v = corner.applyMatrix4(mesh.matrixWorld).project(camera);
          if (v.z >= 1) continue;
          const x = ((v.x + 1) / 2) * width;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    const outline = minX < maxX ? { minX: Math.max(0, minX), maxX: Math.min(width, maxX) } : undefined;
    for (const pl of layoutLeaders(anchors, { width, height, outline, ...LEADER })) {
      const e = map.get(pl.id)!;
      const state =
        st.selected === pl.id ? "selected" : st.isolated && st.selected ? "dimmed" : st.hovered === pl.id ? "hover" : "rest";
      const [line, dot] = [e.line.firstElementChild!, e.line.lastElementChild!];
      line.setAttribute("x1", String(pl.ax));
      line.setAttribute("y1", String(pl.ay));
      line.setAttribute("x2", String(pl.lx));
      line.setAttribute("y2", String(pl.ly));
      dot.setAttribute("cx", String(pl.ax));
      dot.setAttribute("cy", String(pl.ay));
      e.line.dataset.state = state;
      e.line.style.display = "";
      const s = e.label.style;
      e.label.dataset.state = state;
      e.label.dataset.side = pl.side;
      s.display = "";
      s.top = `${pl.ly}px`;
      s.maxWidth = `${pl.room}px`;
      if (pl.side === "left") {
        s.left = "";
        s.right = `${width - pl.lx + 6}px`;
      } else {
        s.right = "";
        s.left = `${pl.lx + 6}px`;
      }
    }
  });
  return null;
}

/** Hands the loaded model and the camera controls to the stage's children. */
function SceneChildren({ loaded, controls, children }: { loaded: Loaded; controls: RefObject<CameraControls | null>; children: ReactNode }) {
  const invalidate = useThree((s) => s.invalidate);
  const value = useMemo<StageScene>(
    () => ({
      root: loaded.root,
      parts: new Map([...loaded.parts].map(([id, p]) => [id, p.obj])),
      sphere: loaded.sphere,
      getControls: () => controls.current,
      invalidate: () => invalidate(),
    }),
    [loaded, controls, invalidate],
  );
  return <SceneContext value={value}>{children}</SceneContext>;
}

/** A value memoised on its JSON, so a caller passing a fresh array each render does not re-frame the camera. */
function useByValue<T>(value: T | undefined): T | undefined {
  const key = JSON.stringify(value);
  return useMemo(() => (key === undefined ? undefined : (JSON.parse(key) as T)), [key]);
}

const DEFAULT_ANGLES: [number, number] = [0.6, 1.1];
const anchor = new THREE.Vector3();
const corner = new THREE.Vector3();
const offset = new THREE.Vector3();

function setCursor(el: HTMLElement, cursor: string) {
  el.style.cursor = cursor;
}

const tmp = new THREE.Matrix4();
const tmpS = new THREE.Matrix4();

export default function ExplodeStage({
  sidecar,
  model,
  store,
  onSelect,
  mobile: mobileAtMount = false,
  reduced = false,
  active = true,
  onReady,
  onFail,
  background,
  accent,
  palette,
  render,
  materials,
  leaders = false,
  frame: frameProp,
  fit = "pose",
  lift = 0,
  initialAngles,
  focusOnSelect = true,
  opening = false,
  onModel,
  ar: arProp,
  children,
}: ExplodeStageProps) {
  const [mobile] = useState(mobileAtMount);
  const [lost, setLost] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const onLost = useCallback(() => setLost(true), []);
  const onRestored = useCallback(() => setLost(false), []);
  const overlay = useRef<HTMLDivElement>(null);
  const controls = useRef<CameraControls | null>(null);
  const onControls = useCallback((c: CameraControls | null) => {
    controls.current = c;
  }, []);
  const frame = useByValue(frameProp);
  const angles = useByValue(initialAngles) ?? DEFAULT_ANGLES;
  const ar = useByValue(arProp);
  const theme = useTheme();
  // Decided once per mount, like `mobile`: the device does not change under the stage.
  const [device] = useState(readQualityEnv);
  // The look for this theme, memoised on its values: a caller passing fresh objects each render, or
  // a theme change that leaves a value alone, must not restart the ease. The model never reloads for it.
  const lookKey = JSON.stringify(resolveLook({ palette, background, accent, render }, theme, device));
  const look = useMemo(() => JSON.parse(lookKey) as Look, [lookKey]);
  // Rim lights exist if either theme wants them, so switching theme can raise them from zero.
  const paletteKey = JSON.stringify(palette ?? {});
  const withRims = useMemo(() => (["light", "dark"] as const).some((t) => resolvePalette(JSON.parse(paletteKey), t).rimIntensity > 0), [paletteKey]);
  // The hemisphere light is built once, from the first look; Model retunes it on a theme change.
  const hemi = useRef<THREE.HemisphereLight>(null);
  const [hemiArgs] = useState<[string, string, number]>(() => [look.palette.sky, look.palette.ground, look.palette.hemisphere]);
  const [aoFailed, setAoFailed] = useState(false);
  const failAo = useCallback(() => setAoFailed(true), []);

  return (
    <div className="relative h-full w-full">
    <Canvas
      flat
      frameloop={active && !lost ? "demand" : "never"}
      dpr={[1, dprCeiling(mobile, look.render.quality)]}
      gl={{ powerPreference: "low-power", antialias: !mobile }}
      camera={{ fov: 35, near: 0.05, far: 500, position: [6, 4, 8] }}
      onCreated={({ gl }) => {
        // Never the `shadows` prop: it selects PCFSoftShadowMap, which three 0.186 replaces with a
        // console warning.
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
      onPointerMissed={() => {
        if (store.getState().selected === null) return;
        store.select(null);
        onSelect?.(null);
      }}
      data-stage-canvas
    >
      <ContextGuard onLost={onLost} onRestored={onRestored} />
      <hemisphereLight ref={hemi} args={hemiArgs} />
      {/* The room ignores the studio's settings, so a change to them must not rebuild it. */}
      <Studio
        kind={look.render.env ? look.render.envKind : null}
        studio={look.render.envKind === "studio" ? look.render.studio : DEFAULT_STUDIO}
      />
      <Model
        url={model ?? sidecar.model}
        sidecar={sidecar}
        store={store}
        reduced={reduced}
        onSelect={onSelect}
        onReady={onReady}
        onFail={onFail}
        look={look}
        withRims={withRims}
        hemi={hemi}
        onLoaded={setLoaded}
        onModel={onModel}
        materials={materials}
        ar={ar}
      />
      {loaded && look.render.contact && <Contact loaded={loaded} options={look.render.contact} />}
      {loaded && look.render.ao && !aoFailed && (
        // An AO chunk that will not load must not take the stage with it: the plain render carries on.
        <SceneBoundary onFail={failAo}>
          <Suspense fallback={null}>
            <AoEffect ao={look.render.ao} unit={loaded.sphere.radius} msaa={!mobile} onFail={failAo} />
          </Suspense>
        </SceneBoundary>
      )}
      <Rig
        loaded={loaded}
        store={store}
        sidecar={sidecar}
        active={active && !lost}
        reduced={reduced}
        onControls={onControls}
        angles={angles}
        frame={frame}
        fit={fit}
        lift={lift}
        focusOnSelect={focusOnSelect}
        opening={opening}
      />
      {loaded && children && (
        <SceneChildren loaded={loaded} controls={controls}>
          {children}
        </SceneChildren>
      )}
      {leaders && loaded && <Leaders loaded={loaded} sidecar={sidecar} store={store} overlay={overlay} onSelect={onSelect} />}
    </Canvas>
    {leaders && <div ref={overlay} data-leaders className="pointer-events-none absolute inset-0 overflow-hidden" />}
    </div>
  );
}
