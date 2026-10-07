/**
 * The cinematic opening: on first load the camera starts far out and a little around to one side,
 * then eases in to the fitted pose. Pure timing maths; the stage drives the camera with it.
 */

export interface OpeningOptions {
  /** Length of the fly-in, seconds. */
  seconds: number;
  /** Starting distance as a multiple of the fitted distance. */
  far: number;
  /** Starting azimuth offset from the fitted angle, radians. */
  swing: number;
}

export const OPENING: OpeningOptions = { seconds: 2.2, far: 3, swing: 0.8 };

/** Ease in and out, 0..1 to 0..1. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export interface OpeningPose {
  /** Multiply the fitted distance by this. */
  distance: number;
  /** Add this to the fitted azimuth. */
  azimuth: number;
  done: boolean;
}

/** Where the camera is `elapsed` seconds into the opening: `far` and `swing` at 0, exactly the fitted pose at the end. */
export function openingPose(elapsed: number, o: OpeningOptions = OPENING): OpeningPose {
  const p = Math.min(Math.max(elapsed / o.seconds, 0), 1);
  const left = 1 - easeInOutCubic(p);
  return { distance: 1 + (o.far - 1) * left, azimuth: o.swing * left, done: p >= 1 };
}
