/**
 * The smoke rake, as plain data (no three): where the nozzles sit, how the tunnel box is bounded and
 * how the flow's turbulence ramps up behind the car. The flow shaders and the rake hardware read these
 * numbers (flow.ts splices them into the GLSL), so a rake that moves later is a change to this data,
 * never to a shader.
 *
 * The car spans x -2.91 to 2.41 m, 1.06 m tall, and the air moves along +x, so the rake stands a
 * little way upstream of the nose and the wake starts where the rear wing does.
 */

export interface Nozzle {
  x: number;
  y: number;
  z: number;
}

/** A vertical comb: one nozzle at each height in `ys`, all at one (x, z). */
export interface RakeSpec {
  x: number;
  z: number;
  ys: readonly number[];
}

/** The tunnel's working volume in metres. Particles leave it sideways or on the clock and are re-released at a nozzle. */
export const FLOW_BOX = { min: [-3.3, 0.01, -1.25], max: [4, 1.7, 1.25] } as const;

/** Where the nozzle tips stand, upstream of the nose (x = -2.91). */
export const RAKE_X = -3.2;

/** How far the nozzle stubs reach out of the rake's bar, upstream of the tips. */
export const NOZZLE_STUB = 0.07;

/**
 * One centreline comb, a hair off the centreline so a line that meets the nose head-on chooses the
 * near side of the car rather than splitting. Uneven on purpose, and crowded where the interesting
 * flow is: the nose (0.08 to 0.31), the sidepod (0.47, 0.6), then the engine cover, cockpit and halo
 * (0.71 to 1.01), with one line over the top of everything. Phones get six.
 */
export const RAKES = {
  desktop: [{ x: RAKE_X, z: 0.05, ys: [0.08, 0.2, 0.31, 0.47, 0.6, 0.71, 0.8, 0.9, 1.01, 1.17] }],
  mobile: [{ x: RAKE_X, z: 0.05, ys: [0.12, 0.34, 0.6, 0.8, 0.95, 1.14] }],
} as const satisfies Record<string, readonly RakeSpec[]>;

/** The most nozzles a layout may carry (the shader holds them in a uniform array). */
export const MAX_NOZZLES = 64;

export const rakeNozzles = (specs: readonly RakeSpec[]): Nozzle[] => specs.flatMap(({ x, z, ys }) => ys.map((y) => ({ x, y, z })));

export const nozzleLayout = (mobile: boolean): Nozzle[] => rakeNozzles(mobile ? RAKES.mobile : RAKES.desktop);

/**
 * Particles per nozzle. Each nozzle's particles form one chain that draws as a continuous ribbon, so
 * this sets how finely the ribbon follows the flow (about 1 cm apart on desktop), not how dense it is.
 */
export const PARTICLES_PER_NOZZLE = { desktop: 800, mobile: 500 } as const;

/** The whole texture's worth of particles for the rake and `extra` more chains (the smoke wand's), each as long as a rake nozzle's. */
export const particleCount = (mobile: boolean, extra = 0): number => (nozzleLayout(mobile).length + extra) * PARTICLES_PER_NOZZLE[mobile ? "mobile" : "desktop"];

/** Flow past x = start is disturbed, reaching full strength at x = full: the wake behind the rear wing. */
export const WAKE = { start: 2.0, full: 3.3 } as const;

/** Curl-noise strength as a fraction of freestream: near laminar ahead of the car, broken up behind it. */
export const TURBULENCE = { laminar: 0.004, wake: 0.2 } as const;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 0 upstream of the wake, 1 well into it. The shaders compute the same smoothstep. */
export const wakeRamp = (x: number): number => smoothstep(WAKE.start, WAKE.full, x);

export const turbulence = (x: number): number => TURBULENCE.laminar + (TURBULENCE.wake - TURBULENCE.laminar) * wakeRamp(x);
