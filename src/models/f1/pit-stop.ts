/**
 * The pit stop challenge as plain data (no three, no React, no DOM): the steps of a stop, a timed
 * round as a small state machine over an injected clock, the penalty for a wrong tap, the best time
 * in localStorage, and the pose each step leaves the car in. The panel (src/app/pit-stop-panel.tsx)
 * and the canvas layer (src/app/pit-stop-layer.tsx) are thin shells over it.
 *
 * A stop is ten steps: the jack lifts the car, the gun takes the four wheels off in turn, the gun puts
 * the four back, the jack drops the car. The clock starts with the round and stops on the last step.
 * A tap on the wrong part costs a penalty and moves nothing; a paused round counts no time and takes
 * no taps. Times are milliseconds on whatever monotonic clock the caller passes (performance.now()).
 */

export const WHEELS = ["front-left-wheel", "front-right-wheel", "rear-left-wheel", "rear-right-wheel"] as const;
export type WheelId = (typeof WHEELS)[number];
/** Anything the crew can be asked to press: a wheel part, or the jack. */
export type Target = WheelId | "jack";
export type Action = "up" | "down" | "off" | "on";

export interface Step {
  target: Target;
  action: Action;
}

/** Jack up, all four wheels off, all four on, jack down. */
export const STEPS: readonly Step[] = [
  { target: "jack", action: "up" },
  ...WHEELS.map((target): Step => ({ target, action: "off" })),
  ...WHEELS.map((target): Step => ({ target, action: "on" })),
  { target: "jack", action: "down" },
];

/** Added to the time for each tap on the wrong part. */
export const PENALTY_MS = 500;

export type Phase = "idle" | "running" | "paused" | "done";

export interface Round {
  phase: Phase;
  /** Steps completed. */
  step: number;
  /** Milliseconds counted before the clock last started, penalties included. */
  banked: number;
  /** When the clock last started, or null while it is stopped. */
  since: number | null;
  /** The elapsed time at the end of each completed step. */
  splits: readonly number[];
  mistakes: number;
  /** The final time once done. */
  final: number | null;
}

export const idle = (): Round => ({ phase: "idle", step: 0, banked: 0, since: null, splits: [], mistakes: 0, final: null });

/** A fresh round with the clock running from `now`. */
export const start = (now: number): Round => ({ ...idle(), phase: "running", since: now });

/** Milliseconds on the clock at `now`: nothing before a start, frozen while paused and once done. */
export function elapsed(round: Round, now: number): number {
  if (round.final !== null) return round.final;
  return round.banked + (round.since === null ? 0 : Math.max(now - round.since, 0));
}

/** The step the crew is on, or null when there are none left (or the round has not started). */
export const current = (round: Round): Step | null => (round.phase === "idle" || round.phase === "done" ? null : (STEPS[round.step] ?? null));

export function pause(round: Round, now: number): Round {
  if (round.phase !== "running") return round;
  return { ...round, phase: "paused", banked: elapsed(round, now), since: null };
}

export function resume(round: Round, now: number): Round {
  return round.phase === "paused" ? { ...round, phase: "running", since: now } : round;
}

/**
 * A tap on `target`. The right one completes the step (and the last one stops the clock); the wrong one
 * adds the penalty and a mistake. Ignored unless the round is running.
 */
export function tap(round: Round, target: Target, now: number): Round {
  if (round.phase !== "running") return round;
  const want = STEPS[round.step];
  if (!want) return round;
  if (target !== want.target) return { ...round, banked: round.banked + PENALTY_MS, mistakes: round.mistakes + 1 };
  const time = elapsed(round, now);
  const splits = [...round.splits, time];
  if (round.step + 1 < STEPS.length) return { ...round, step: round.step + 1, splits };
  return { ...round, phase: "done", step: STEPS.length, splits, since: null, banked: time, final: time };
}

/** What each step has done to the car so far. */
export interface Pose {
  lifted: boolean;
  /** The wheels that are off the car. */
  off: readonly WheelId[];
}

/** The car after `completed` steps. */
export function poseAfter(completed: number): Pose {
  let lifted = false;
  const off = new Set<WheelId>();
  for (const { target, action } of STEPS.slice(0, Math.max(completed, 0))) {
    if (target === "jack") lifted = action === "up";
    else if (action === "off") off.add(target);
    else off.delete(target);
  }
  return { lifted, off: WHEELS.filter((w) => off.has(w)) };
}

/** How far the jack raises the car, and how far a wheel goes out to the side when it comes off, metres. */
export const LIFT = 0.12;
export const WHEEL_OUT = 1.15;

/**
 * Where a part is, relative to where it sits now, in a pose: the lifted car rises as a whole, and a wheel
 * that is off goes out to its own side and stays on the ground. Metres, as [x, y, z].
 */
export function offsetOf(id: string, pose: Pose): readonly [number, number, number] {
  if ((WHEELS as readonly string[]).includes(id) && pose.off.includes(id as WheelId)) return [0, 0, id.includes("left") ? WHEEL_OUT : -WHEEL_OUT];
  return [0, pose.lifted ? LIFT : 0, 0];
}

/** "4.31 s", or "—" when there is no time. */
export const formatTime = (ms: number | null): string => (ms === null || !Number.isFinite(ms) ? "—" : `${(ms / 1000).toFixed(2)} s`);

/** What the crew is asked to do, in words. */
export function describeStep(step: Step): string {
  if (step.target === "jack") return step.action === "up" ? "Jack up" : "Jack down";
  const place = step.target.replace(/-wheel$/, "").replace("-", " ");
  return `Gun ${step.action}: ${place} wheel`;
}

/** The best time lives here, under this app's own namespace. The key keeps its original name (blowout-f1) so saved best times carry over from before the rename. */
export const BEST_KEY = "blowout-f1:pit-stop:best";
/** Nobody does a stop this slow on purpose: a stored value past it is taken to be damaged. */
const MAX_BEST_MS = 10 * 60 * 1000;

/** The part of Storage this module uses. */
export interface BestStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's storage, or null where touching it throws (a blocked or sandboxed page). */
function browserStorage(): BestStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** A stored best time, or null for anything that is not a sane one (the store is untrusted input). */
export function parseBest(raw: string | null): number | null {
  if (raw === null || !/^\d+(\.\d+)?$/.test(raw)) return null;
  const ms = Number(raw);
  return ms > 0 && ms <= MAX_BEST_MS ? ms : null;
}

/** The best time so far, or null if there is none or storage cannot be read. */
export function readBest(storage: BestStorage | null = browserStorage()): number | null {
  try {
    return parseBest(storage?.getItem(BEST_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Keeps `time` as the best if it beats `best`. Returns the best now, and whether this was it. Storage that throws still gives the right answer for this visit. */
export function recordBest(time: number, best: number | null, storage: BestStorage | null = browserStorage()): { best: number; isBest: boolean } {
  const ms = Math.round(time);
  if (best !== null && ms >= best) return { best, isBest: false };
  try {
    storage?.setItem(BEST_KEY, String(ms));
  } catch {
    // Storage is full or blocked: the record lasts until the page closes.
  }
  return { best: ms, isBest: true };
}
