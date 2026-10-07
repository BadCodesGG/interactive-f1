/**
 * What the car's parts do on the lap (lap-track.ts, lap-profile.ts): how far a wheel has turned for the
 * distance driven, how far the fronts steer for the bend, how far each corner of the car compresses under
 * braking, power, cornering and downforce, how far the active wings have opened. And `Run`, the clock that
 * drives them: distance and lap time advanced in steps, the suspension and the wings lagging the way real
 * ones do. Pure and three-free, so the tests can hold each rule and lap-scene.ts only has to apply a Pose.
 *
 * Conventions, all in the car's own frame as the GLB has it (nose towards -x, up +y, its left +z) and
 * already the signs three's `rotation` wants, so nothing downstream has to think about them:
 * - wheel spin is about z, and positive rolls the car forwards;
 * - steer is about y, and positive turns a wheel to the left;
 * - body pitch is about z, and positive dips the nose;
 * - body roll is about x, and positive lowers the car's left side.
 */
import { baseline, baselineSetup, G, type AeroMode } from "@/data/aero";
import { aeroModeAt, accelerationAt, speedAt, timeAt, type Profile } from "./lap-profile";
import { sampleAt } from "./lap-track";
import { tunnelPose } from "./tunnel-pose";

/** The tyre's radius, metres: the F226's tyre mesh, which also sits that high at its axle. */
export const WHEEL_RADIUS = 0.369;
/** Front axle to rear axle, metres. */
export const WHEELBASE = 3.4;
/** Across the tyres' centres, metres (the wheels sit at z = +/-0.772). */
export const TRACK_WIDTH = 1.544;

// ---------------------------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------------------------

/** How far a wheel has turned, radians (0 to 2 pi), for `distance` metres driven: it rolls without slipping. */
export const wheelSpinAngle = (distance: number): number => (((distance / WHEEL_RADIUS) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** How fast a wheel turns at `speed` m/s, radians per second. */
export const wheelSpinRate = (speed: number): number => speed / WHEEL_RADIUS;

/**
 * Steering is shown this many times what the geometry asks for: a real front wheel turns a few degrees round
 * even a hairpin, which at this size reads as not steering at all. The same kind of gain as the tunnel's
 * ride height (RIDE_HEIGHT_VISUAL_GAIN).
 */
export const STEER_VISUAL_GAIN = 3;
/** The most a wheel is shown turned, radians. */
export const MAX_STEER = 0.5;

/**
 * The angle of the left and right front wheels for a bend of curvature `k` (1/m, positive to the left):
 * the bicycle model's atan(wheelbase * k), split Ackermann-fashion so the inside wheel turns more.
 */
export function steerAngles(k: number): { left: number; right: number } {
  const half = 0.5 * TRACK_WIDTH * k;
  const angle = (side: number) => Math.max(-MAX_STEER, Math.min(MAX_STEER, STEER_VISUAL_GAIN * Math.atan((WHEELBASE * k) / (1 + side * half))));
  return { left: angle(-1), right: angle(1) };
}

// ---------------------------------------------------------------------------------------------
// Suspension
// ---------------------------------------------------------------------------------------------

/** Metres of travel each g of braking or acceleration adds at an axle. */
export const PITCH_PER_G = 0.008;
/** Metres of travel each g of cornering adds at the outer wheels, and takes off the inner ones. */
export const ROLL_PER_G = 0.006;
/** Metres every corner sinks at 92 m/s (330 km/h) from downforce alone, scaling with speed squared. */
export const SQUAT_AT_TOP = 0.02;
const TOP_SPEED = 92;
/** No corner compresses or extends more than this, metres. */
export const MAX_TRAVEL = 0.045;

/** Compression of each corner, metres: positive squeezes the spring (the body moves down over that wheel). */
export interface Corners {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

const travel = (v: number): number => Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, v));

/**
 * How far each corner is compressed for the car's accelerations: `aLong` along the track (positive
 * speeding up, negative braking) and `aLat` towards the left (positive through a left-hand bend), m/s
 * squared, at `speed` m/s. Braking loads the front axle and unloads the rear, power the other way,
 * cornering loads the outside wheels, and downforce loads all four by the share of it each axle carries.
 */
export function suspensionCorners(aLong: number, aLat: number, speed: number): Corners {
  const pitch = (-aLong / G) * PITCH_PER_G;
  // A left-hand bend throws the load to the right wheels.
  const roll = (aLat / G) * ROLL_PER_G;
  const aero = SQUAT_AT_TOP * (speed / TOP_SPEED) ** 2;
  const front = pitch + aero * 2 * baseline.frontShare;
  const rear = -pitch + aero * 2 * (1 - baseline.frontShare);
  return { fl: travel(front - roll), fr: travel(front + roll), rl: travel(rear - roll), rr: travel(rear + roll) };
}

/** The body's pose over its four corners. */
export interface Body {
  /** Metres the body has sunk. */
  heave: number;
  /** Radians, positive dips the nose. */
  pitch: number;
  /** Radians, positive lowers the left side. */
  roll: number;
}

export function bodyPose(c: Corners): Body {
  const front = 0.5 * (c.fl + c.fr);
  const rear = 0.5 * (c.rl + c.rr);
  const left = 0.5 * (c.fl + c.rl);
  const right = 0.5 * (c.fr + c.rr);
  return { heave: 0.5 * (front + rear), pitch: Math.atan2(front - rear, WHEELBASE), roll: Math.atan2(left - right, TRACK_WIDTH) };
}

// ---------------------------------------------------------------------------------------------
// Active aero
// ---------------------------------------------------------------------------------------------

/** Seconds the flaps take to go from shut to open, or back: inside the 0.6 s the rules allow. */
export const FLAP_SECONDS = 0.4;

/** The tunnel's two flap poses, which do not change: worked out once, not for every frame. */
const SHUT = tunnelPose({ ...baselineSetup, mode: "corner" });
const WIDE = tunnelPose({ ...baselineSetup, mode: "straight" });

/** Moves the flaps' opening (0 shut in Corner Mode, 1 open in Straight Mode) towards its target over `dt` seconds. */
export function stepFlap(open: number, mode: AeroMode, dt: number): number {
  const target = mode === "straight" ? 1 : 0;
  const move = dt / FLAP_SECONDS;
  return target > open ? Math.min(target, open + move) : Math.max(target, open - move);
}

/**
 * The angles of the front and rear flaps for an opening `open` (0 to 1), radians about the car's z axis: the
 * wind tunnel's own numbers (tunnel-pose.ts), eased so a flap starts and stops gently. Negative flattens the
 * flap: the rear's turns about its trailing edge, the front's about its leading edge.
 */
export function flapAngles(open: number): { front: number; rear: number } {
  const e = open * open * (3 - 2 * open);
  return { front: SHUT.frontFlap + (WIDE.frontFlap - SHUT.frontFlap) * e, rear: SHUT.rearFlap + (WIDE.rearFlap - SHUT.rearFlap) * e };
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/** Seconds the suspension takes to follow the loads (a first-order lag). */
export const SUSPENSION_LAG = 0.09;
/** How hard the car brakes after the line, m/s squared. */
export const COOLDOWN_DECEL = 30;

export type Phase = "running" | "cooldown" | "stopped";

export interface Run {
  profile: Profile;
  phase: Phase;
  /** Metres from the line; keeps counting past it while the car slows. */
  s: number;
  /** Seconds on the lap clock: stops at the line. */
  t: number;
  /** The lap's time once the line is crossed, else null. */
  lap: number | null;
  speed: number;
  /** Metres driven, which the wheels have rolled. */
  travelled: number;
  flap: number;
  corners: Corners;
  aLong: number;
}

/** A run that starts at distance `from` (the line by default) with the lap clock at what the profile says it was there. */
export function createRun(profile: Profile, from = 0): Run {
  const speed = speedAt(profile, from);
  const aLong = accelerationAt(profile, from);
  return {
    profile,
    phase: "running",
    s: from,
    t: timeAt(profile, from),
    lap: null,
    speed,
    travelled: from,
    flap: aeroModeAt(profile, from) === "straight" ? 1 : 0,
    corners: suspensionCorners(aLong, speed * speed * sampleAt(profile.track, from).curvature, speed),
    aLong,
  };
}

/** Everything the 3D side needs to pose the car, from one Run. */
export interface Pose {
  phase: Phase;
  /** Where the car is on the loop. */
  x: number;
  y: number;
  heading: number;
  curvature: number;
  speedKmh: number;
  mode: AeroMode;
  /** Seconds on the lap clock. */
  lapSeconds: number;
  /** Set once the car has crossed the line. */
  finished: boolean;
  spin: number;
  steer: { left: number; right: number };
  corners: Corners;
  body: Body;
  flap: number;
  flapAngles: { front: number; rear: number };
  /** Rate the car's heading turns at, radians per second, positive to the left. */
  yawRate: number;
}

export function poseOf(run: Run): Pose {
  const at = sampleAt(run.profile.track, run.s);
  return {
    phase: run.phase,
    x: at.x,
    y: at.y,
    heading: at.heading,
    curvature: at.curvature,
    speedKmh: run.speed * 3.6,
    mode: run.phase === "running" ? aeroModeAt(run.profile, run.s) : "corner",
    lapSeconds: run.lap ?? run.t,
    finished: run.lap !== null,
    spin: wheelSpinAngle(run.travelled),
    steer: steerAngles(at.curvature),
    corners: run.corners,
    body: bodyPose(run.corners),
    flap: run.flap,
    flapAngles: flapAngles(run.flap),
    yawRate: run.speed * at.curvature,
  };
}

/**
 * Advances the run by `dt` seconds (keep it small: a frame's worth). On the lap the car follows the speed
 * profile, found at the middle of the step so a step that straddles a braking point is not a frame late;
 * the step that crosses the line stops the lap clock at the instant it does, and the car brakes to a halt
 * from there. The lap time is the clock at that instant, so it does not depend on the step size.
 */
export function stepRun(run: Run, dt: number): Run {
  if (run.phase === "stopped" || dt <= 0) return run;
  const lapLength = run.profile.track.length;
  let left = dt;
  let aLong = run.aLong;
  if (run.phase === "running") {
    const v0 = speedAt(run.profile, run.s);
    const v = speedAt(run.profile, Math.min(lapLength, run.s + 0.5 * v0 * dt));
    const ds = v * dt;
    if (run.s + ds >= lapLength) {
      const used = (lapLength - run.s) / v;
      run.t += used;
      run.lap = run.t;
      run.travelled += lapLength - run.s;
      run.s = lapLength;
      run.phase = "cooldown";
      run.speed = speedAt(run.profile, lapLength);
      left = dt - used;
    } else {
      run.t += dt;
      run.s += ds;
      run.travelled += ds;
      run.speed = v;
      aLong = accelerationAt(run.profile, run.s);
    }
  }
  if (run.phase === "cooldown" && left > 0) {
    const stop = run.speed / COOLDOWN_DECEL;
    const used = Math.min(left, stop);
    const covered = run.speed * used - 0.5 * COOLDOWN_DECEL * used * used;
    run.s += covered;
    run.travelled += covered;
    run.speed = Math.max(0, run.speed - COOLDOWN_DECEL * used);
    aLong = -COOLDOWN_DECEL;
    if (run.speed === 0) {
      run.phase = "stopped";
      aLong = 0;
    }
  }
  const mode: AeroMode = run.phase === "running" ? aeroModeAt(run.profile, run.s) : "corner";
  run.flap = stepFlap(run.flap, mode, dt);
  const k = sampleAt(run.profile.track, run.s).curvature;
  const target = suspensionCorners(aLong, run.speed * run.speed * k, run.speed);
  const lag = 1 - Math.exp(-dt / SUSPENSION_LAG);
  const c = run.corners;
  run.corners = { fl: c.fl + (target.fl - c.fl) * lag, fr: c.fr + (target.fr - c.fr) * lag, rl: c.rl + (target.rl - c.rl) * lag, rr: c.rr + (target.rr - c.rr) * lag };
  run.aLong = aLong;
  return run;
}

/** Seconds of lap one press of Step moves the car by. */
export const STEP_SECONDS = 0.5;

/** A lap clock as a driver reads it: minutes, seconds and tenths, "0:44.5". */
export function formatLapTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}
