/**
 * How a wind tunnel setup looks: the angles and offsets the tunnel scene applies to the car, and
 * the strength of the authored downwash behind the rear wing. Pure and three-free, so the page can
 * import it and the tests can check the visual response against the setup.
 *
 * Angles are radians about the car's z axis in the livery's deformation shader (positive lifts the
 * trailing edge: a steeper element). The score never reads this; it comes from aero.ts alone.
 */
import type { FloorId, FrontWingId, Setup } from "@/data/aero";

export interface TunnelPose {
  /** The rear wing's upper elements, turned about the mainplane's leading edge. */
  rearAoA: number;
  /** Extra turn of the top flap about its trailing edge: negative opens the slot gap. */
  rearFlap: number;
  /** The front flaps, turned about their leading edge. */
  frontFlap: number;
  /** Chord scale of the front flaps. */
  frontChord: number;
  /** Diffuser ramp angle relative to the modelled one. */
  diffuser: number;
  /** Body height offset, metres (ride height, exaggerated so it shows). */
  bodyLift: number;
  halo: boolean;
  /** Downwash behind the rear wing, as a fraction of freestream speed. */
  downwash: number;
}

const DEG = Math.PI / 180;
/** Ride height moves are a few millimetres; five times that is what a viewer can see. */
export const RIDE_HEIGHT_VISUAL_GAIN = 5;

const FRONT: Record<FrontWingId, { chord: number; tilt: number }> = {
  "low-drag": { chord: 0.84, tilt: -5 * DEG },
  balanced: { chord: 1, tilt: 0 },
  "high-downforce": { chord: 1.18, tilt: 6 * DEG },
};

const DIFFUSER: Record<FloorId, number> = { flat: -4 * DEG, standard: 0, aggressive: 5 * DEG };

export function tunnelPose(setup: Setup): TunnelPose {
  const straight = setup.mode === "straight";
  const front = FRONT[setup.frontWing];
  // Downwash grows with the rear wing's angle (-10..10 deg maps to 0.25..0.65 of freestream) and
  // Straight Mode's open flap sheds most of it.
  const downwash = (0.45 + setup.rearWingDeg * 0.02) * (straight ? 0.35 : 1);
  return {
    rearAoA: setup.rearWingDeg * DEG,
    rearFlap: straight ? -24 * DEG : 0,
    frontFlap: front.tilt + (straight ? -14 * DEG : 0),
    frontChord: front.chord,
    diffuser: DIFFUSER[setup.floor],
    bodyLift: setup.rideHeightMm * 0.001 * RIDE_HEIGHT_VISUAL_GAIN,
    halo: setup.halo,
    downwash,
  };
}
