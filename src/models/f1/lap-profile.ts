/**
 * How fast the car goes round the lap (lap-track.ts), and which wing mode it runs in. The aero.ts lap
 * sim on this curve: the tyres and downforce cap the speed in a corner (Evaluation.cornerSpeedKmh), the
 * power curve, drag and traction cap how hard it accelerates out of it, and braking caps how late it can
 * arrive. Unlike the sim it starts from the pit-lane limit rather than flying, so the lap opens with a
 * launch. Pure and three-free.
 *
 * Wing mode follows the 2026 rules as aero.ts models them: Straight Mode on a straight of at least
 * activeAero.minStraightM, Corner Mode everywhere else and for every braking zone, where the wings close.
 */
import { activeAero, aeroModes, baseline, baselineSetup, evaluate, G, muEffective, powerW, tyreModel, type AeroMode, type Evaluation } from "@/data/aero";
import { cellLength, type Track } from "./lap-track";

/** The pit-lane speed limit, m/s: where the lap starts from. */
export const START_SPEED = 80 / 3.6;
/** Below this curvature (1/m) the road counts as straight: a corner of 700 m radius or more is a bend the car does flat out. */
export const STRAIGHT_CURVATURE = 1 / 700;
/** A slowing harder than this, m/s squared, is a braking zone; drag alone at the top speed is well under it. */
export const BRAKING_DECEL = 3;

export interface Profile {
  track: Track;
  /** Speed at each sample and at the line again: `count + 1` values, m/s. */
  speed: Float64Array;
  /** Seconds from the start to each sample and to the line: `count + 1` values. */
  time: Float64Array;
  /** Along-track acceleration over the cell from each sample, m/s squared (negative braking). */
  accel: Float64Array;
  /** The road at each sample is straight (see STRAIGHT_CURVATURE). */
  straight: Uint8Array;
  /** The sample is on a straight of at least activeAero.minStraightM: the wings may open there. */
  openable: Uint8Array;
  /** The car is braking hard over the cell from each sample. */
  braking: Uint8Array;
  /** The lap, seconds. */
  lapSeconds: number;
  topKmh: number;
  minKmh: number;
}

/**
 * Marks each sample that lies on a straight run of at least `minLength` metres, runs that cross the line
 * counted whole. Returns the per-sample straight flag too.
 */
export function classifyStraights(track: Track, minLength: number = activeAero.minStraightM): { straight: Uint8Array; openable: Uint8Array } {
  const n = track.count;
  const straight = new Uint8Array(n);
  for (let i = 0; i < n; i++) straight[i] = Math.abs(track.curvature[i]) < STRAIGHT_CURVATURE ? 1 : 0;
  const openable = new Uint8Array(n);
  const start = straight.indexOf(0);
  if (start < 0) return { straight, openable };
  // Walk the loop from a corner, so a run never straddles the walk's own end.
  let run: number[] = [];
  let length = 0;
  const close = () => {
    if (length >= minLength) for (const i of run) openable[i] = 1;
    run = [];
    length = 0;
  };
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (straight[i]) {
      run.push(i);
      length += cellLength(track, i);
    } else close();
  }
  close();
  return { straight, openable };
}

/** The aero numbers of each mode for the baseline setup. */
const EV: Record<AeroMode, Evaluation> = {
  corner: evaluate({ ...baselineSetup, mode: "corner" }),
  straight: evaluate({ ...baselineSetup, mode: "straight" }),
};

/** How hard the car can accelerate at speed `v` (m/s) with `ev`'s aero: power or traction, less drag and rolling. */
function accelAt(ev: Evaluation, v: number): number {
  const fz = baseline.massKg * G + ev.downforceN(v);
  const traction = muEffective(fz) * fz * (1 - ev.frontShare);
  const drive = Math.min(powerW(v) / Math.max(v, 1), traction);
  return (drive - ev.dragN(v) - baseline.cRR * fz) / baseline.massKg;
}

/** How hard it can brake, m/s squared: Corner Mode aero always, since the wings close as the driver brakes. */
function brakeAt(v: number): number {
  const ev = EV.corner;
  const fz = baseline.massKg * G + ev.downforceN(v);
  return Math.min(tyreModel.maxBrakingG * G, (muEffective(fz) * fz + ev.dragN(v)) / baseline.massKg);
}

export function buildProfile(track: Track): Profile {
  const n = track.count;
  const { straight, openable } = classifyStraights(track);
  const limit = new Float64Array(n + 1);
  const aero: Evaluation[] = [];
  for (let i = 0; i <= n; i++) {
    const j = i % n;
    const ev = openable[j] ? EV.straight : EV.corner;
    aero.push(ev);
    const top = ev.topSpeedKmh / 3.6;
    const k = Math.abs(track.curvature[j]);
    limit[i] = straight[j] ? top : Math.min(top, EV.corner.cornerSpeedKmh(1 / k) / 3.6);
  }
  const speed = Float64Array.from(limit);
  speed[0] = Math.min(START_SPEED, limit[0]);
  for (let i = 0; i < n; i++) {
    const ds = cellLength(track, i);
    const next = Math.sqrt(Math.max(0, speed[i] * speed[i] + 2 * accelAt(aero[i], speed[i]) * ds));
    speed[i + 1] = Math.min(limit[i + 1], next);
  }
  for (let i = n - 1; i > 0; i--) {
    const ds = cellLength(track, i);
    speed[i] = Math.min(speed[i], Math.sqrt(speed[i + 1] * speed[i + 1] + 2 * brakeAt(speed[i + 1]) * ds));
  }
  const time = new Float64Array(n + 1);
  const accel = new Float64Array(n);
  const braking = new Uint8Array(n);
  let top = 0;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const ds = cellLength(track, i);
    time[i + 1] = time[i] + ds / (0.5 * (speed[i] + speed[i + 1]));
    accel[i] = (speed[i + 1] * speed[i + 1] - speed[i] * speed[i]) / (2 * ds);
    braking[i] = accel[i] < -BRAKING_DECEL ? 1 : 0;
    top = Math.max(top, speed[i]);
    min = Math.min(min, speed[i]);
  }
  return { track, speed, time, accel, straight, openable, braking, lapSeconds: time[n], topKmh: top * 3.6, minKmh: min * 3.6 };
}

/** The sample a distance `s` (metres, in one lap) falls in. */
function indexAt(profile: Profile, s: number): number {
  return Math.min(profile.track.count - 1, Math.max(0, Math.floor(s / profile.track.step)));
}

/** Speed at distance `s`, m/s, blended between samples. */
export function speedAt(profile: Profile, s: number): number {
  const i = indexAt(profile, s);
  const f = Math.min(1, Math.max(0, (s - i * profile.track.step) / cellLength(profile.track, i)));
  return profile.speed[i] + (profile.speed[i + 1] - profile.speed[i]) * f;
}

/** Seconds from the start to distance `s` in the lap. */
export function timeAt(profile: Profile, s: number): number {
  const i = indexAt(profile, s);
  const f = Math.min(1, Math.max(0, (s - i * profile.track.step) / cellLength(profile.track, i)));
  return profile.time[i] + (profile.time[i + 1] - profile.time[i]) * f;
}

/** Acceleration along the track at distance `s`, m/s squared. */
export function accelerationAt(profile: Profile, s: number): number {
  return profile.accel[indexAt(profile, s)];
}

/**
 * The wing mode the car runs at distance `s`: Straight Mode on a straight long enough to open on, Corner
 * Mode everywhere else and in every braking zone.
 */
export function aeroModeAt(profile: Profile, s: number): AeroMode {
  const i = indexAt(profile, s);
  return profile.openable[i] && !profile.braking[i] ? aeroModes.straight.id : aeroModes.corner.id;
}

/** The middle of the longest straight that wings may open on, metres from the line: the showroom frame of a still lap. */
export function showcaseDistance(profile: Profile): number {
  let best = { length: 0, mid: 0 };
  const n = profile.track.count;
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const open = i < n && profile.openable[i] === 1 && profile.braking[i] === 0;
    if (open && runStart < 0) runStart = i;
    if (!open && runStart >= 0) {
      const length = (i - runStart) * profile.track.step;
      if (length > best.length) best = { length, mid: (runStart + (i - runStart) / 2) * profile.track.step };
      runStart = -1;
    }
  }
  return best.mid;
}
