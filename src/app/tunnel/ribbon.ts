/**
 * The smoke ribbons' geometry, as plain arrays (no three). Particle i belongs to nozzle i % N and is
 * number j = floor(i / N) in that nozzle's chain, so its neighbours along the streakline are i - N and
 * i + N: the position shader releases them in order, oldest last. The chain is a ring: the last
 * particle's next is the first. That matters, because particles keep their place in the ring for good
 * while the release point (the one break in the streakline, between the oldest and the newest) travels
 * round it; a chain that stopped at its last particle would leave a second, permanent break at the
 * material point where the ends meet, which drifts down the line as a notch.
 *
 * Each link (particle i to its next) is a quad of four vertices. Each vertex carries the texture
 * coordinates of the link's two ends (A, B) and of two particles a few places either side of its own
 * end (S0 before, S1 after), from which the vertex shader takes the line's direction there. The
 * particles are about a centimetre apart and the ribbon several centimetres wide, so a direction taken
 * from the immediate neighbours would follow every sub-millimetre wobble in their positions and fan the
 * ribbon out into ticks; a stencil of STENCIL places each way averages that away. Links are unshared,
 * so the shader can fade one out without touching its neighbours.
 */

/** How many places along the chain, each way, the line's direction is taken over. */
export const STENCIL = 8;

export interface RibbonGeometry {
  segments: number;
  /** Per vertex, texture coordinates (u, v) into the particle texture: the link's ends and the stencil round this vertex's end. */
  refA: Float32Array;
  refB: Float32Array;
  refS0: Float32Array;
  refS1: Float32Array;
  /** Per vertex: (0 at A or 1 at B, -1 or +1 across the ribbon). */
  corner: Float32Array;
  /** Per vertex: (position j along the chain, nozzle). */
  seed: Float32Array;
  /** Two triangles per segment. */
  index: Uint32Array;
}

/** How many particles chain k of `nozzles` has when the texture holds `n`: the ones at k, k + N, k + 2N, and so on. */
export const chainLength = (n: number, nozzles: number, k: number): number => Math.max(Math.ceil((n - k) / nozzles), 0);

/** The particle `steps` places along i's chain (negative: back), round the ring. */
export function stepInChain(i: number, n: number, nozzles: number, steps: number): number {
  const k = i % nozzles;
  const length = chainLength(n, nozzles, k);
  const j = (((Math.floor(i / nozzles) + steps) % length) + length) % length;
  return k + j * nozzles;
}

/** The particle after i in its chain's ring. */
export const nextInChain = (i: number, n: number, nozzles: number): number => stepInChain(i, n, nozzles, 1);

/** The particle before i in its chain's ring. */
export const prevInChain = (i: number, n: number, nozzles: number): number => stepInChain(i, n, nozzles, -1);

/**
 * A square texture `side` texels across holds `side * side` particles; texel i is at ((i % side + 0.5) / side, (floor(i / side) + 0.5) / side).
 * `count` is how many of them, from texel 0, belong to chains (the rest of the texture may hold something else).
 */
export function ribbonGeometry(side: number, nozzles: number, count = side * side): RibbonGeometry {
  const n = count;
  // Every chain needs two particles to have a link.
  const segments = n >= 2 * nozzles ? n : 0;
  const refs = [0, 1, 2, 3].map(() => new Float32Array(segments * 8));
  const corner = new Float32Array(segments * 8);
  const seed = new Float32Array(segments * 8);
  const index = new Uint32Array(segments * 6);
  const uv = (i: number): [number, number] => [((i % side) + 0.5) / side, (Math.floor(i / side) + 0.5) / side];
  for (let a = 0; a < segments; a++) {
    const b = nextInChain(a, n, nozzles);
    for (let v = 0; v < 4; v++) {
      const at = (a * 4 + v) * 2;
      const end = v >> 1 ? b : a;
      [a, b, stepInChain(end, n, nozzles, -STENCIL), stepInChain(end, n, nozzles, STENCIL)].forEach((p, k) => refs[k].set(uv(p), at));
      corner.set([v >> 1, v & 1 ? 1 : -1], at);
      seed.set([Math.floor(a / nozzles), a % nozzles], at);
    }
    index.set([0, 1, 2, 1, 3, 2].map((k) => a * 4 + k), a * 6);
  }
  return { segments, refA: refs[0], refB: refs[1], refS0: refs[2], refS1: refs[3], corner, seed, index };
}
