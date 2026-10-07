/**
 * camera-controls, installed once with only the three classes it needs, and `focusPart`, which
 * frames one part. Framing the whole model (on load, on explode and assemble, on Reset view) lives
 * with the stage, which knows the model's poses.
 *
 * Framing uses fitToSphere, not fitToBox: camera-controls' fitToBox rounds the camera to the nearest
 * axis-aligned angle (camera-controls.module.js, "round to closest axis"), which turns a flat part
 * such as a base plate edge-on and fills the view with it. fitToSphere keeps the visitor's angle.
 */
import CameraControls from "camera-controls";
import { Box3, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4, type Object3D, type PerspectiveCamera } from "three";
import type { SidecarView } from "./sidecar";

let installed = false;

export function createCameraControls(camera: PerspectiveCamera, dom: HTMLElement): CameraControls {
  if (!installed) {
    CameraControls.install({ THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster } });
    installed = true;
  }
  const controls = new CameraControls(camera, dom);
  controls.smoothTime = 0.3;
  controls.draggingSmoothTime = 0.1;
  // Wheel over the canvas zooms rather than scrolling the page; keep zoom bounded so the model
  // cannot be lost.
  controls.minDistance = 0.5;
  controls.maxDistance = 40;
  return controls;
}

/** Room around a focused part, as a multiple of its bounding sphere. */
const PAD = 1.35;
const box = new Box3();
const sphere = new Sphere();

/** Frames a part's current (exploded) bounds, or goes to its authored view. */
export function focusPart(controls: CameraControls, part: Object3D, view: SidecarView | undefined, animate: boolean): void {
  if (view) {
    const [px, py, pz] = view.position;
    const [tx, ty, tz] = view.target;
    void controls.setLookAt(px, py, pz, tx, ty, tz, animate);
    return;
  }
  box.setFromObject(part).getBoundingSphere(sphere);
  sphere.radius *= PAD;
  void controls.fitToSphere(sphere, animate);
}

export type { CameraControls };
