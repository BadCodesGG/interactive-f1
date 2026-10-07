/**
 * The lap's circuit: a closed ribbon built from curvature, and the speed a 2026 car can carry around it.
 * Pure and three-free, so the page can import it and the tests can check it. The car itself is lap-car.ts;
 * the 3D side is lap-scene.ts.
 *
 * The curve is drawn the way a circuit is: straights and corners, each corner a clothoid ramp into a
 * constant radius and out again, so the curvature (and with it the steering) never jumps. Two of the
 * straights have no fixed length: they are solved so the loop closes, which is what makes it a lap.
 * Everything is in metres on a plane, x east and y north, the heading counted anticlockwise from east, so
 * a left turn is positive curvature.
 *
 * How fast the car goes round it is lap-profile.ts.
 */
/** A straight, or a corner: `angle` radians (positive to the left) at `radius` metres, entered and left over `ramp` metres. */
export type Piece = { kind: "straight"; length: number; free?: boolean } | { kind: "turn"; angle: number; radius: number; ramp: number };

const DEG = Math.PI / 180;
const straight = (length: number, free = false): Piece => ({ kind: "straight", length, free });
const turn = (deg: number, radius: number, ramp = 28): Piece => ({ kind: "turn", angle: deg * DEG, radius, ramp });

/**
 * The circuit, from the start line: a long straight (flat out, wings open), a medium left, a short
 * straight, a right flick, a long fast left, a second and longer straight, a tight left, a straight, a
 * medium left and a right kink back onto the line. The turns add to one full left-hand turn; the two
 * `free` straights are the ones solved for closure, so their lengths here are only a start.
 */
export const LAYOUT: readonly Piece[] = [
  straight(500, true),
  turn(100, 86),
  straight(136),
  turn(-30, 50),
  turn(135, 150),
  straight(860, true),
  turn(120, 45),
  straight(180),
  turn(100, 106),
  turn(-65, 62),
];

export interface Track {
  /** Metres between samples; the last one is as far from the start as the lap has left, never more. */
  step: number;
  /** Samples round the loop. */
  count: number;
  /** Lap length, metres. */
  length: number;
  x: Float64Array;
  y: Float64Array;
  /** Heading, radians, unwrapped: it rises by 2 pi over the lap. */
  heading: Float64Array;
  /** Signed curvature, 1/m: positive to the left. */
  curvature: Float64Array;
}

/** The road's width, metres. The game's own number: the real ones are 12 to 15. */
export const ROAD_WIDTH = 13;
/** Sample spacing, metres. */
export const STEP = 2;

/** A piece placed on the lap: where it starts, how long it is and what it does to the heading. */
interface Shape {
  from: number;
  len: number;
  /** Curvature of a turn's constant part, signed; 0 on a straight. */
  k: number;
  /** The ramp actually used: a short turn cannot hold a full one. */
  ramp: number;
  /** Heading gained before this piece starts. */
  before: number;
  /** Heading gained over the piece. */
  turn: number;
}

function shapesOf(pieces: readonly Piece[], freeLengths: Map<number, number>): Shape[] {
  let from = 0;
  let before = 0;
  return pieces.map((p, i) => {
    if (p.kind === "straight") {
      const len = freeLengths.get(i) ?? p.length;
      const shape = { from, len, k: 0, ramp: 0, before, turn: 0 };
      from += len;
      return shape;
    }
    // Ramp up, hold, ramp down: the area under the curvature is the angle, which fixes the length.
    const ramp = Math.min(p.ramp, Math.abs(p.angle) * p.radius);
    const len = Math.abs(p.angle) * p.radius + ramp;
    const shape = { from, len, k: Math.sign(p.angle) / p.radius, ramp, before, turn: p.angle };
    from += len;
    before += p.angle;
    return shape;
  });
}

/** The shape that holds arc length `s` (the last one takes anything past the end). */
const shapeAt = (shapes: readonly Shape[], s: number): Shape => shapes.find((sh) => s < sh.from + sh.len) ?? shapes[shapes.length - 1];

/** Curvature at arc length `s`: linear ramps, so it is continuous. */
function curvatureAt(shapes: readonly Shape[], s: number): number {
  const sh = shapeAt(shapes, s);
  if (sh.k === 0) return 0;
  const local = s - sh.from;
  return sh.k * Math.min(1, local / sh.ramp, (sh.len - local) / sh.ramp);
}

/** Heading at arc length `s`: the integral of the curvature, worked out exactly. */
function headingAt(shapes: readonly Shape[], s: number): number {
  const sh = shapeAt(shapes, s);
  if (sh.k === 0) return sh.before;
  const local = Math.min(s - sh.from, sh.len);
  const { k, ramp, len } = sh;
  if (local < ramp) return sh.before + (k * local * local) / (2 * ramp);
  if (local < len - ramp) return sh.before + (k * ramp) / 2 + k * (local - ramp);
  const left = len - local;
  return sh.before + sh.turn - (k * left * left) / (2 * ramp);
}

interface Built {
  track: Track;
  shapes: Shape[];
  /** End minus start, metres: what the free straights close. */
  gap: [number, number];
}

function build(pieces: readonly Piece[], freeLengths: Map<number, number>, step: number): Built {
  const shapes = shapesOf(pieces, freeLengths);
  const last = shapes[shapes.length - 1];
  const length = last.from + last.len;
  // Cells of `step` metres from the line, the last one shorter: no resampling, so the geometry is exact.
  const count = Math.ceil(length / step);
  const cell = (i: number) => Math.min((i + 1) * step, length) - i * step;
  const heading = new Float64Array(count);
  const curvature = new Float64Array(count);
  const x = new Float64Array(count + 1);
  const y = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) {
    heading[i] = headingAt(shapes, i * step);
    curvature[i] = curvatureAt(shapes, i * step);
    const ds = cell(i);
    const mid = headingAt(shapes, i * step + ds / 2);
    x[i + 1] = x[i] + Math.cos(mid) * ds;
    y[i + 1] = y[i] + Math.sin(mid) * ds;
  }
  return { track: { step, count, length, x: x.slice(0, count), y: y.slice(0, count), heading, curvature }, shapes, gap: [x[count], y[count]] };
}

/**
 * Builds the loop: the straights marked `free` take whatever length closes it. Two free straights in
 * different directions are enough to cancel any gap; each pass moves them along their own headings.
 */
export function buildTrack(pieces: readonly Piece[] = LAYOUT, step = STEP): Track {
  const free = pieces.flatMap((p, i) => (p.kind === "straight" && p.free ? [i] : []));
  if (free.length !== 2) throw new Error("A track needs exactly two free straights to close");
  const lengths = new Map<number, number>(free.map((i) => [i, (pieces[i] as Extract<Piece, { kind: "straight" }>).length]));
  let built = build(pieces, lengths, step);
  for (let pass = 0; pass < 20 && Math.hypot(...built.gap) > 1e-9; pass++) {
    const [a, b] = free;
    const ha = built.shapes[a].before;
    const hb = built.shapes[b].before;
    // Solve da * (cos ha, sin ha) + db * (cos hb, sin hb) = -gap.
    const det = Math.cos(ha) * Math.sin(hb) - Math.sin(ha) * Math.cos(hb);
    if (Math.abs(det) < 1e-3) throw new Error("The two free straights run the same way");
    const [gx, gy] = built.gap;
    lengths.set(a, lengths.get(a)! + (-gx * Math.sin(hb) + gy * Math.cos(hb)) / det);
    lengths.set(b, lengths.get(b)! + (-Math.cos(ha) * gy + Math.sin(ha) * gx) / det);
    if (lengths.get(a)! < 50 || lengths.get(b)! < 50) throw new Error("The loop does not close with these corners");
    built = build(pieces, lengths, step);
  }
  if (Math.hypot(...built.gap) > 1e-3) throw new Error("The loop does not close with these corners");
  return built.track;
}

export interface TrackPoint {
  x: number;
  y: number;
  heading: number;
  curvature: number;
}

/** Metres from sample `i` to the next: `step`, except the last cell, which closes the lap. */
export const cellLength = (track: Track, i: number): number => Math.min((i + 1) * track.step, track.length) - i * track.step;

/** The loop at arc length `s` from the start line, in metres: any distance, it wraps. */
export function sampleAt(track: Track, s: number): TrackPoint {
  const wrapped = ((s % track.length) + track.length) % track.length;
  const i = Math.min(track.count - 1, Math.floor(wrapped / track.step));
  const f = (wrapped - i * track.step) / cellLength(track, i);
  const j = (i + 1) % track.count;
  const hj = j === 0 ? track.heading[0] + 2 * Math.PI : track.heading[j];
  return {
    x: track.x[i] + (track.x[j] - track.x[i]) * f,
    y: track.y[i] + (track.y[j] - track.y[i]) * f,
    heading: track.heading[i] + (hj - track.heading[i]) * f,
    curvature: track.curvature[i] + (track.curvature[j] - track.curvature[i]) * f,
  };
}

/** Curvature (1/m) at which the inside kerb starts to grow, and at which it is full: a radius of 450 m, and of 170 m. */
const KERB_FROM = 1 / 450;
const KERB_FULL = 1 / 170;
/** How far ahead, metres, the exit kerb looks for the curvature falling away. */
const EXIT_LOOK = 24;
/** The fall in curvature over EXIT_LOOK at which the exit kerb starts to grow, and at which it is full. */
const EXIT_FROM = 1 / 900;
const EXIT_FULL = 1 / 260;

const ramp = (from: number, to: number, v: number): number => Math.min(1, Math.max(0, (v - from) / (to - from)));

/**
 * How much kerb each sample has on each side of the road, 0 to 1 (the kerb's width as a share of its full
 * width, so a kerb tapers in and out). The inside of a bend has one, growing with the curvature; the outside
 * has one where the bend is easing off (the exit, where a car runs wide), growing with how fast it eases.
 * A straight has none.
 */
export function kerbAmounts(track: Track): { left: Float32Array; right: Float32Array } {
  const left = new Float32Array(track.count);
  const right = new Float32Array(track.count);
  const look = Math.max(1, Math.round(EXIT_LOOK / track.step));
  for (let i = 0; i < track.count; i++) {
    const k = track.curvature[i];
    const inside = ramp(KERB_FROM, KERB_FULL, Math.abs(k));
    const fall = Math.abs(k) - Math.abs(track.curvature[(i + look) % track.count]);
    const outside = Math.abs(k) > KERB_FROM ? ramp(EXIT_FROM, EXIT_FULL, fall) : 0;
    left[i] = k > 0 ? inside : outside;
    right[i] = k > 0 ? outside : inside;
  }
  return { left, right };
}
