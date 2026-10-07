/**
 * The smoke wand's hands: turns a pointer (or the arrow keys) into the wand's place in the tunnel, and
 * moves the flow's wand nozzles there. Kept out of the stage component, which would otherwise be mutating
 * the canvas element and the marker it got from its hooks; these are plain functions over plain objects.
 * The maths is wand.ts's; this is the wiring.
 *
 * On, the wand takes the pointer from the orbit controls (switched off, and switched back on when it is
 * turned off). Live, the smoke streams from it as it moves (`driveWand`, every frame). With the flow
 * paused, or under reduced motion, it draws one still streamline where the pointer is put down instead.
 */
import * as THREE from "three";
import type { CameraControls } from "@/engine/explode/camera";
import type { Flow } from "./flow";
import { clampToWand, follow, needsSettle, nudgeWand, rayPlanePoint, wandNozzles, type V3 } from "./wand";

export interface WandState {
  /** Where the pointer says the wand should be. */
  goal: V3 | null;
  /** Where the wand is now (it follows `goal` a little behind). */
  point: V3 | null;
  /** The last goal a frame acted on. */
  lastGoal: V3 | null;
  /** Seconds (performance clock) of the last live frame. */
  at: number;
}

export const newWandState = (): WandState => ({ goal: null, point: null, lastGoal: null, at: 0 });

/** Where the wand starts when it is moved by keyboard before any pointer has placed it: upstream of the nose, at the cockpit's height. */
export const WAND_START: V3 = [-2.4, 0.6, 0];
/** How quickly the wand's emitter closes on the pointer, per second: smooth enough to hide a jittery pointer, quick enough to feel attached. */
export const WAND_FOLLOW = 18;

export interface WandBinding {
  dom: HTMLElement;
  camera: THREE.PerspectiveCamera;
  controls: CameraControls;
  flow: Flow;
  /** The small sphere that shows where the wand is. */
  marker: THREE.Object3D;
  state: WandState;
  /** Still mode (flow paused or reduced motion): plant a streamline on release instead of following live. */
  still: boolean;
  invalidate(): void;
}

/** Starts listening for the pointer and the arrow keys on the canvas; returns the function that stops, and hands everything back. */
export function bindWand({ dom, camera, controls, flow, marker, state: w, still, invalidate }: WandBinding): () => void {
  const before = { tabIndex: dom.tabIndex, cursor: dom.style.cursor, touchAction: dom.style.touchAction, label: dom.getAttribute("aria-label") };
  controls.enabled = false;
  dom.tabIndex = 0;
  dom.style.cursor = "crosshair";
  dom.style.touchAction = "none";
  dom.setAttribute("aria-label", "Wind tunnel. The smoke wand is on: move the pointer, or use the arrow keys, to place it.");

  const origin = new THREE.Vector3();
  const ray = new THREE.Vector3();
  const through = new THREE.Vector3();
  const facing = new THREE.Vector3();
  /** Where the pointer is in the tunnel: its ray against the plane that faces the camera through the point the camera orbits. */
  const toPoint = (e: PointerEvent): V3 | null => {
    const r = dom.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    ray.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), 0.5).unproject(camera);
    origin.copy(camera.position);
    ray.sub(origin).normalize();
    controls.getTarget(through);
    camera.getWorldDirection(facing);
    const hit = rayPlanePoint([origin.x, origin.y, origin.z], [ray.x, ray.y, ray.z], [through.x, through.y, through.z], [facing.x, facing.y, facing.z]);
    return hit && clampToWand(hit);
  };
  const show = (p: V3) => {
    marker.position.set(...p);
    marker.visible = true;
    invalidate();
  };
  /** The still wand: one streamline from here, drawn now and left alone. */
  const plant = (p: V3) => {
    w.goal = w.point = p;
    flow.setWand(wandNozzles(p), true);
    flow.settleWand(true);
    show(p);
  };
  let pressed = false;
  const aim = (p: V3) => {
    w.goal = p;
    if (still) show(p);
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressed = true;
    dom.setPointerCapture?.(e.pointerId);
    const p = toPoint(e);
    if (p) aim(p);
  };
  const move = (e: PointerEvent) => {
    // A finger only counts while it is down; a mouse hovering over the canvas carries a live wand.
    if (still ? !pressed : e.pointerType !== "mouse" && !pressed) return;
    const p = toPoint(e);
    if (p) aim(p);
  };
  const up = (e: PointerEvent) => {
    if (!pressed) return;
    pressed = false;
    if (dom.hasPointerCapture?.(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    if (still && w.goal) plant(w.goal);
  };
  const key = (e: KeyboardEvent) => {
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as const)[e.key as "ArrowLeft"];
    if (!dir) return;
    e.preventDefault();
    const m = camera.matrixWorld.elements;
    const p = nudgeWand(w.goal ?? w.point ?? WAND_START, [m[0], m[1], m[2]], [m[4], m[5], m[6]], dir, e.shiftKey ? 0.3 : 0.1);
    if (still) plant(p);
    else w.goal = p;
    show(p);
  };
  dom.addEventListener("pointerdown", down);
  dom.addEventListener("pointermove", move);
  dom.addEventListener("pointerup", up);
  dom.addEventListener("pointercancel", up);
  dom.addEventListener("keydown", key);
  return () => {
    dom.removeEventListener("pointerdown", down);
    dom.removeEventListener("pointermove", move);
    dom.removeEventListener("pointerup", up);
    dom.removeEventListener("pointercancel", up);
    dom.removeEventListener("keydown", key);
    controls.enabled = true;
    dom.tabIndex = before.tabIndex;
    dom.style.cursor = before.cursor;
    dom.style.touchAction = before.touchAction;
    if (before.label === null) dom.removeAttribute("aria-label");
    else dom.setAttribute("aria-label", before.label);
    flow.setWand(null);
    marker.visible = false;
    Object.assign(w, newWandState());
    invalidate();
  };
}

/**
 * One frame of a live wand: it follows the pointer a little behind it. A new place that is a jump away, or
 * one after the wand has been idle, is put down at once and the smoke from it re-established.
 */
export function driveWand(w: WandState, flow: Flow, marker: THREE.Object3D, dt: number): void {
  const goal = w.goal;
  if (!goal) return;
  const now = performance.now() / 1000;
  if (goal !== w.lastGoal) {
    if (needsSettle(w.point && w.lastGoal ? { point: w.lastGoal, at: w.at } : null, goal, now)) {
      w.point = goal;
      flow.setWand(wandNozzles(goal), true);
      flow.settleWand();
    }
    w.lastGoal = goal;
  }
  const from = w.point ?? goal;
  w.point = [0, 1, 2].map((i) => follow(from[i], goal[i], WAND_FOLLOW, dt)) as unknown as V3;
  flow.setWand(wandNozzles(w.point));
  w.at = now;
  marker.position.set(...w.point);
  marker.visible = true;
}

/** Colours the wand's marker like the smoke (white in the dark theme, dark in the light one), so it reads on either floor. */
export function setMarkerColour(marker: THREE.Mesh, colour: string): void {
  (marker.material as THREE.MeshStandardMaterial).color.set(colour);
}
