/**
 * How the camera frames the whole model, as pure sphere maths so it can be tested without a canvas.
 * The stage measures the assembled and exploded poses once (`rest`, `exploded`) and asks here for
 * the sphere to fit at any explode amount.
 */
import { Box3, MathUtils, Sphere, type Object3D } from "three";

/**
 * A framing factor: the fitted radius is multiplied by it, so smaller is closer. A pair sets the
 * assembled and the exploded pose apart, since a box's bounding sphere is looser than a scatter's.
 */
export type Frame = number | [number, number];

/**
 * Framing when neither the stage's `frame` prop nor the sidecar's `assembly.frame` says. Anything
 * tighter clips a compact model, whose sphere hugs it, at the frame edge nearest the camera.
 */
export const DEFAULT_FRAME = 1;

/** The explicit prop wins, then the sidecar's `assembly.frame`, then the default. */
export function resolveFrame(prop: Frame | undefined, sidecar: number | null | undefined): Frame {
  return prop ?? sidecar ?? DEFAULT_FRAME;
}

/** What the framing needs of a loaded model. */
export interface PoseBounds {
  root: Object3D;
  /** Bounding spheres of the assembled and the exploded pose, at root scale 1. */
  rest: Sphere;
  exploded: Sphere;
  /** Both poses together. */
  sphere: Sphere;
}

/**
 * The whole model's framing for an explode amount: the assembled and exploded poses' spheres blended
 * by k, then scaled with the model's root (a look scales the root about its own position).
 */
export function poseSphere(l: PoseBounds, k: number, frame: Frame, out = new Sphere()): Sphere {
  const [atRest, atExploded] = typeof frame === "number" ? [frame, frame] : frame;
  const pos = l.root.position;
  const s = l.root.scale.x;
  out.center.lerpVectors(l.rest.center, l.exploded.center, k).sub(pos).multiplyScalar(s).add(pos);
  out.radius = MathUtils.lerp(l.rest.radius * atRest, l.exploded.radius * atExploded, k) * s;
  return out;
}

/** The sphere that covers both poses at once, for a fit that never follows the slider (`fit="union"`). */
export function unionSphere(l: Pick<PoseBounds, "sphere">, frame: Frame, out = new Sphere()): Sphere {
  out.center.copy(l.sphere.center);
  out.radius = l.sphere.radius * (typeof frame === "number" ? frame : frame[0]);
  return out;
}

/** One part's bounds in both poses, and whether it is on screen (not hidden by the system filter). */
export interface PartBounds {
  rest: Box3;
  exploded: Box3;
  shown: boolean;
}

/** The three spheres the camera frames: each pose, and both together. */
export interface FrameSpheres {
  rest: Sphere;
  exploded: Sphere;
  union: Sphere;
}

/**
 * Rewrites `out` to fit only the shown parts, and returns true. With none shown there is nothing to
 * frame: `out` is left alone (the camera keeps its last framing) and it returns false.
 */
export function frameShown(parts: Iterable<PartBounds>, out: FrameSpheres): boolean {
  const rest = new Box3();
  const exploded = new Box3();
  for (const p of parts) {
    if (!p.shown) continue;
    rest.union(p.rest);
    exploded.union(p.exploded);
  }
  if (rest.isEmpty()) return false;
  rest.getBoundingSphere(out.rest);
  exploded.getBoundingSphere(out.exploded);
  rest.union(exploded).getBoundingSphere(out.union);
  return true;
}
