/**
 * Where the tunnel camera starts, as plain numbers (no three). The view is a low three-quarter from
 * the near side, looking at the car. On a landscape canvas that is a fixed look-at and a small
 * pull-back; on a portrait one (a phone) the width is what runs out, so the camera steps back until the
 * whole span from the rake to the end of the wake fits across, and looks at the middle of that span.
 */
import { FLOW_BOX, RAKE_X } from "./rake";

export type V3 = readonly [number, number, number];

/** The opening eye position, and what it looks at on a landscape canvas. */
export const EYE: V3 = [-3.6, 1.55, 8.4];
export const TARGET: V3 = [-0.5, 0.5, 0];

/** Landscape: pulled back a little from the eye above so the rake ahead of the nose is in frame. */
const LANDSCAPE_PULL = 1.2;
/** The along-the-car span that must fit across a portrait canvas: the rake's bar to where the wake fades out. */
const SPAN: readonly [number, number] = [RAKE_X - 0.25, FLOW_BOX.max[0] - 0.4];
/** Half the car's width, metres: the near side sticks out towards the camera and looks bigger. */
const HALF_BEAM = 0.95;
/** Perspective and a little air at the edges. */
const MARGIN = 1.12;

export interface Framing {
  target: V3;
  /** How many times the eye-to-target vector the opening eye is from the target. */
  pull: number;
}

const length = (v: V3) => Math.hypot(v[0], v[1], v[2]);

export function framing(aspect: number, fovDeg: number): Framing {
  if (aspect >= 1) return { target: TARGET, pull: LANDSCAPE_PULL };
  const toEye: V3 = [EYE[0] - TARGET[0], EYE[1] - TARGET[1], EYE[2] - TARGET[2]];
  // The screen's right-hand axis, flat: where the car's length and width land across the canvas.
  const flat = Math.hypot(toEye[0], toEye[2]);
  const alongCar = Math.abs(toEye[2]) / flat;
  const acrossCar = Math.abs(toEye[0]) / flat;
  const centre = (SPAN[0] + SPAN[1]) / 2;
  const half = ((SPAN[1] - SPAN[0]) / 2) * alongCar + HALF_BEAM * acrossCar;
  const distance = (half * MARGIN) / (Math.tan((fovDeg * Math.PI) / 360) * aspect);
  return { target: [centre, TARGET[1], TARGET[2]], pull: Math.max(distance / length(toEye), LANDSCAPE_PULL) };
}
