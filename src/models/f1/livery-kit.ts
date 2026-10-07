/**
 * What the eight liveries share (docs/liveries.md): where the BadCodes marks go, the halo's box, and
 * the small curve helpers the stripes are drawn with. Every position is read off CAR_FRAME
 * (scripts/measure-car-frame.mjs), never guessed. Three-free.
 */
import { CAR_FRAME } from "./car-frame";
import { DECALS } from "./decals";
import { curveAt, SECTION_BOTTOM, SECTION_SHOULDER_Y } from "./livery-paint";
import type { Colour, Curve, DecalPlacement, FinishName, Region } from "./livery-spec";

export const CAR_LENGTH = CAR_FRAME.tail - CAR_FRAME.nose;
/** The position along the car (t) of a rest-pose x. */
export const tAt = (x: number): number => (x - CAR_FRAME.nose) / CAR_LENGTH;
/** The rest-pose x of a t. */
export const xAt = (t: number): number => CAR_FRAME.nose + t * CAR_LENGTH;

/** A monogram of a given height, its width following the texture's aspect. */
export const mark = (h: number): readonly [number, number] => [h * DECALS.mark.aspect, h];
/** A wordmark of a given length, its height following the texture's aspect. */
export const wordmark = (length: number): readonly [number, number] => [length, length / DECALS.wordmark.aspect];

/** The halo's box, as a region: a livery that paints the halo a colour of its own lays a layer over it. */
export const HALO: Region = { kind: "box", min: [CAR_FRAME.halo.min[0], CAR_FRAME.halo.min[1], 0], max: [CAR_FRAME.halo.max[0], 2, CAR_FRAME.halo.max[2]], mirror: true };

/** A curve sampled from a function of t, at the given ts. */
export const curveOf = (ts: readonly number[], f: (t: number) => number): Curve => ts.map((t) => [t, f(t)] as const);

/** Height of the sidepod's flank wall (shoulder to belly) at t, metres. */
export const wallHeight = (t: number): number => curveAt(SECTION_SHOULDER_Y, xAt(t)) - curveAt(SECTION_BOTTOM, xAt(t));

/** The wrap coordinate on the flank at a fraction of the wall's height measured up from the belly (0 belly, 1 shoulder). */
export const wallW = (t: number, fraction: number): number => -(1 - fraction) * wallHeight(t);

/** A band of the wrap coordinate around a centre line, `lo` and `hi` metres either side of it. */
export function band(centre: Curve, lo: number, hi: number): { lo: Curve; hi: Curve } {
  return { lo: centre.map(([t, w]) => [t, w + lo] as const), hi: centre.map(([t, w]) => [t, w + hi] as const) };
}

const { noseChassis, finBlade, flank, rearWingTop } = CAR_FRAME.anchors;

/** The flank is a wall that tapers toward the tail: z(x) between two measured points, and its slope. */
const flankSlope = (flank.z1 - flank.z0) / (flank.x1 - flank.x0);
export const flankZ = (x: number): number => flank.z0 + flankSlope * (x - flank.x0);

export interface DecalOptions {
  /** The monogram's fill on the nose and the fin; absent, it keeps its own colours (gradient). */
  mark?: Colour;
  /** Overrides `mark` on the nose, or on the fin, where the paint under it differs. */
  nose?: Colour;
  fin?: Colour;
  /** The wordmark's fill. */
  word: Colour;
  /** A finish for both marks over the body's own (Ghost's gloss over matte). */
  finish?: FinishName;
  /** Where the wordmark sits on the flank wall: x and the height of its centre. */
  flankX?: number;
  flankY?: number;
  /** The wing wordmark's fill if it differs from the flank's. */
  wingWord?: Colour;
}

const sides = [1, -1] as const;
const side = (s: 1 | -1) => (s > 0 ? "left" : "right");

/**
 * The placements every livery carries (docs/liveries.md), in the livery's colours:
 * - the monogram on the chassis nose ahead of the cockpit, 0.27 m tall, its top toward the cockpit so it
 *   reads from the front, where the hero angle looks;
 * - the monogram on both faces of the engine cover's blade (the fin behind the airbox), 0.22 m tall;
 * - the wordmark on both sidepod flanks, 0.9 m long, each side with its own outward normal;
 * - the wordmark on the rear wing's upper faces, 0.8 m long, reading from behind.
 */
export function standardDecals(o: DecalOptions): DecalPlacement[] {
  const { flankX = 0.2, flankY = 0.335 } = o;
  const fill = (colour: Colour | undefined) => (colour === undefined ? {} : { colour });
  const finish = o.finish === undefined ? {} : { finish: o.finish };
  return [
    { id: "nose-mark", texture: "mark", part: "body", centre: [noseChassis.x, noseChassis.y, 0], normal: [-noseChassis.slope, 1, 0], up: [1, noseChassis.slope, 0], size: mark(0.27), depth: 0.05, facing: 0.3, ...fill(o.nose ?? o.mark), ...finish },
    ...sides.map<DecalPlacement>((s) => ({ id: `fin-mark-${side(s)}`, texture: "mark", part: "body", centre: [finBlade.x, finBlade.y, s * finBlade.z], normal: [0, -finBlade.dzdy, s], up: [0, 1, 0], size: mark(0.22), depth: 0.05, facing: 0.5, ...fill(o.fin ?? o.mark), ...finish })),
    ...sides.map<DecalPlacement>((s) => ({ id: `flank-wordmark-${side(s)}`, texture: "wordmark", part: "body", centre: [flankX, flankY, s * flankZ(flankX)], normal: [-flankSlope, 0, s], up: [0, 1, 0], size: wordmark(0.9), depth: 0.09, colour: o.word, facing: 0.3, ...finish })),
    // No facing test on the wing: its elements are thin sheets whose stored normals do not point up, and the thin clip box already keeps it on the top.
    { id: "wing-wordmark", texture: "wordmark", part: "rearWing", centre: [rearWingTop.x, (rearWingTop.yMin + rearWingTop.yMax) / 2, 0], normal: [0, 1, 0], up: [-1, 0, 0], size: wordmark(0.8), depth: 0.08, colour: o.wingWord ?? o.word, ...finish },
  ];
}
