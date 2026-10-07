/**
 * The tunnel's two extra layers of air, as plain data (no three): hairline streaks and tumbling flakes.
 * Both ride the same velocity field as the smoke (field.ts) in one small particle texture, streaks
 * first, flakes after; air.ts runs and draws them. The smoke is the measured flow; these read as air
 * speed and dirt in it.
 *
 * A streak is a burst of `links` particles released a hair apart from one point, so it is a short
 * material line that follows the field round the car. Particle j of streak s is `j * spacing` behind
 * the burst's head in phase (phase: 0 at release, 1 at the end of the cycle), which is what makes
 * them a burst at all: they wrap, and so are released, one after another. Each streak then lies
 * idle for the rest of its cycle (`duty`), so a handful cross at any moment rather than all of them.
 * A streak's spawn point changes every cycle; the position shader derives it from the cycle number,
 * which it gets from a phase clock (the sum of dt / life) and the streak's fixed offset `streakBase`.
 * That is why nothing has to be stored per streak, and why a change of speed cannot split a burst.
 */
import { FLOW_BOX } from "./rake";

/** Golden ratio and plastic constants: `frac(n * c)` spreads offsets evenly however many there are. */
export const GOLDEN = 0.6180339887498949;
export const PLASTIC = 0.7548776662466927;

export const AIR = {
  streak: {
    /** How many times more turbulent than the smoke a streak is ahead of the car: a little, so it follows the field smoothly. */
    wander: 4,
    /** Particles in a burst, and how long the burst is at release in metres. */
    links: 40,
    length: 2,
    /** The share released in a thin shell hugging the body (|z| 0.3 to 0.8, so they pass the sidepods and go over the nose and cockpit); a few more from below, the rest wide. */
    near: 0.7,
    below: 0.08,
    /** The fraction of a cycle a streak is drawn for; the rest of it is spent beyond the outlet, unseen. */
    duty: 0.55,
    /** Visual speed against the freestream. */
    speedMul: 3,
    /** Where bursts are released along x, upstream of the rake. */
    spawnX: -3.7,
    /** Line width in CSS pixels and peak opacity. */
    hair: 1.8,
  },
  debris: {
    /** Flake edge in metres (each flake picks one size in this range). */
    size: [0.025, 0.05],
    /** How many times more turbulent than the smoke a flake is ahead of the car. */
    wander: 12,
    /** Motion blur: a flake stretches along its velocity by this much per metre per second, up to `maxStretch` times its length. */
    stretch: 0.35,
    maxStretch: 1.5,
    /** Flakes fade out above this height, metres: none in the sky. */
    ceiling: 1.5,
    /** Where they are released: x range upstream, y up to this, |z| up to this (within about 0.6 m of the car). */
    spawnY: 1.4,
    spawnZ: 1.5,
    /** Spin, radians per second. */
    spin: [3, 11],
    speedMul: 1,
    /** Flakes are released between these x, upstream of the car. */
    spawnX: [-4.2, -3.0],
  },
} as const;

export interface AirConfig {
  streaks: number;
  debris: number;
}

/** Phones get half of each. */
export const airConfig = (mobile: boolean): AirConfig => (mobile ? { streaks: 20, debris: 45 } : { streaks: 40, debris: 90 });

const frac = (x: number) => x - Math.floor(x);

/** Particles that belong to streaks: they come first in the texture. */
export const streakParticles = (cfg: AirConfig): number => cfg.streaks * AIR.streak.links;

export const airCount = (cfg: AirConfig): number => streakParticles(cfg) + cfg.debris;

/** The square texture's side. */
export const airSide = (cfg: AirConfig): number => Math.ceil(Math.sqrt(airCount(cfg)));

/** How far a streak travels, release to outlet, and a flake (from the middle of its release range). */
export const streakSpan = FLOW_BOX.max[0] - AIR.streak.spawnX;
export const debrisSpan = FLOW_BOX.max[0] - (AIR.debris.spawnX[0] + AIR.debris.spawnX[1]) / 2;

/** Phase between neighbours in a burst, chosen so a burst is `length` metres long whatever the speed. */
export const streakSpacing = (): number => (AIR.streak.length * AIR.streak.duty) / ((AIR.streak.links - 1) * streakSpan);

/**
 * A streak's fixed offset in its cycle (streaks are spread evenly in time), and a flake's. A streak's
 * is kept at least a burst's length of phase clear of 0, so no link of the burst starts the run on the
 * far side of a wrap and every link is released in the same cycle, under the same cycle number.
 */
export const streakBurst = (): number => (AIR.streak.links - 1) * streakSpacing();
export const streakBase = (s: number): number => {
  const burst = streakBurst();
  return burst + (1 - burst) * frac(s * GOLDEN);
};
export const debrisBase = (d: number): number => frac((d + 0.5) * PLASTIC);

/** Seconds a cycle lasts at freestream `u`: streaks cross the box in `duty` of it, flakes in all of it. */
export const streakLife = (u: number): number => streakSpan / (AIR.streak.speedMul * Math.max(u, 0.1)) / AIR.streak.duty;
export const debrisLife = (u: number): number => debrisSpan / (AIR.debris.speedMul * Math.max(u, 0.1));

/** Particle i's phase at the start. Streak s = i % streaks, link j = floor(i / streaks); a flake's is its own offset. */
export function initialPhase(cfg: AirConfig, i: number): number {
  const streaks = streakParticles(cfg);
  if (i < streaks) return streakBase(i % cfg.streaks) - Math.floor(i / cfg.streaks) * streakSpacing();
  return debrisBase(i - streaks);
}

/** A small deterministic generator (mulberry32) so the flakes look the same every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DebrisSeeds {
  /** Edge, metres. */
  size: Float32Array;
  /** Radians per second, signed. */
  spin: Float32Array;
  /** Starting angle. */
  angle: Float32Array;
  /** Unit tumble axes, three floats each. */
  axis: Float32Array;
}

export function debrisSeeds(count: number, seed = 7): DebrisSeeds {
  const rand = rng(seed);
  const out: DebrisSeeds = { size: new Float32Array(count), spin: new Float32Array(count), angle: new Float32Array(count), axis: new Float32Array(count * 3) };
  const [s0, s1] = AIR.debris.size;
  const [w0, w1] = AIR.debris.spin;
  for (let i = 0; i < count; i++) {
    out.size[i] = s0 + rand() * (s1 - s0);
    out.spin[i] = (w0 + rand() * (w1 - w0)) * (rand() < 0.5 ? -1 : 1);
    out.angle[i] = rand() * Math.PI * 2;
    // Uniform on the sphere: z uniform, azimuth uniform.
    const z = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    out.axis.set([r * Math.cos(phi), r * Math.sin(phi), z], i * 3);
  }
  return out;
}
