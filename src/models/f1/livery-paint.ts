/**
 * The livery evaluator: what a livery paints at a rest-pose position on a part. Pure (no three, no
 * DOM), exact, and the single statement of the rules: the shader in livery-glsl.ts is generated from
 * the same data, and a bake to a texture for AR calls `paintAt` per texel.
 *
 * Colours mix in linear light (as the shader does) and come back as sRGB. Region edges are hard here;
 * the shader softens them over one pixel with `fwidth`. Decals are separate: `decalHit` says where a
 * placement's artwork lands, and the caller composites its texture.
 */
import { CAR_FRAME } from "./car-frame";
import { FINISHES, type Colour, type Curve, type DecalPlacement, type Finish, type FinishName, type Livery, type LiveryPart, type Region, type Vec3 } from "./livery-spec";

const LENGTH = CAR_FRAME.tail - CAR_FRAME.nose;
const BODY_LOW = CAR_FRAME.body.min[1];
const BODY_HIGH = CAR_FRAME.body.max[1];

/** Half the height, in metres, over which the wrap coordinate turns from the top half of a section to the bottom half. */
export const WRAP_BLEND = 0.08;

export type Rgb = readonly [number, number, number];

export interface Paint {
  /** sRGB, each channel 0 to 1. */
  colour: Rgb;
  finishName: FinishName;
  finish: Finish;
}

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** `#rrggbb` to linear-light channels. */
export function hexToLinear(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255)) as unknown as Rgb;
}

/** sRGB channels (0 to 1) to `#rrggbb`. */
export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** The value of a piecewise-linear curve at x, held flat beyond its ends. */
export function curveAt(curve: Curve, x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Position along the car: 0 at the nose tip, 1 at the rear wing's trailing edge. */
export const tOf = (x: number): number => (x - CAR_FRAME.nose) / LENGTH;

/** Fraction of the body's height: 0 at its lowest point, 1 at its highest. */
export const heightOf = (y: number): number => (y - BODY_LOW) / (BODY_HIGH - BODY_LOW);

const STATIONS = CAR_FRAME.sections;
const stationCurve = (column: 1 | 2 | 3): Curve => STATIONS.map((s) => [s[0], s[column]] as const);
/** Body section at x: bottom, shoulder height and shoulder half-width (the widest edge of the section's top). */
const BOTTOM = stationCurve(1);
const SHOULDER_Y = stationCurve(2);
const SHOULDER_Z = stationCurve(3);
export { BOTTOM as SECTION_BOTTOM, SHOULDER_Y as SECTION_SHOULDER_Y, SHOULDER_Z as SECTION_SHOULDER_Z };

/**
 * The wrap coordinate: metres around the body's section from its shoulder, so a stripe can run
 * across the top and down the flank as one shape and the rule needs no surface normal. Up a wall it
 * grows with height, across a top it grows toward the centreline, and around the belly it goes
 * negative again:  w = s * (zShoulder - |z|) + (y - yShoulder),  where s eases from +1 above the
 * section's mid height to -1 below it. Zero on the shoulder line, about -0.2 on a flank 0.2 m
 * below it, about +0.4 at 0.4 m in from the shoulder along the top.
 */
export function wrapCoord(p: Vec3): number {
  const x = p[0];
  const yS = curveAt(SHOULDER_Y, x);
  const zS = curveAt(SHOULDER_Z, x);
  const mid = (curveAt(BOTTOM, x) + yS) / 2;
  const s = Math.min(1, Math.max(-1, (p[1] - mid) / WRAP_BLEND));
  return s * (zS - Math.abs(p[2])) + (p[1] - yS);
}

/** Signed distance in metres from a region's edge, positive inside. */
export function regionDistance(region: Region, p: Vec3): number {
  const t = tOf(p[0]);
  switch (region.kind) {
    case "all":
      return 1e3;
    case "tBand":
      return Math.min(t - region.from, region.to - t) * LENGTH;
    case "heightBelow":
      return (curveAt(region.line, t) - heightOf(p[1])) * (BODY_HIGH - BODY_LOW);
    case "swoosh": {
      const w = wrapCoord(p);
      return Math.min((t - region.from) * LENGTH, (region.to - t) * LENGTH, w - curveAt(region.lo, t), curveAt(region.hi, t) - w);
    }
    case "centre":
      return Math.min((t - region.from) * LENGTH, (region.to - t) * LENGTH, region.half - Math.abs(p[2]));
    case "box": {
      const z = region.mirror ? Math.abs(p[2]) : p[2];
      return Math.min(p[0] - region.min[0], region.max[0] - p[0], p[1] - region.min[1], region.max[1] - p[1], z - region.min[2], region.max[2] - z);
    }
  }
}

/** A palette key or hex to linear-light channels. */
export function resolveColour(livery: Livery, colour: string): Rgb {
  return hexToLinear(livery.palette[colour] ?? colour);
}

/** A colour rule (flat or a ramp along `t`) at a position, linear light. */
export function colourAt(livery: Livery, colour: Colour, p: Vec3): Rgb {
  if (typeof colour === "string") return resolveColour(livery, colour);
  const t = tOf(p[0]);
  const ramp = colour.ramp;
  let out = resolveColour(livery, ramp[0][1]);
  for (let i = 1; i < ramp.length; i++) {
    const s = Math.min(1, Math.max(0, (t - ramp[i - 1][0]) / (ramp[i][0] - ramp[i - 1][0])));
    const next = resolveColour(livery, ramp[i][1]);
    out = out.map((v, k) => v + (next[k] - v) * s) as unknown as Rgb;
  }
  return out;
}

/**
 * What the livery paints on a part at a rest-pose position (metres, the frame of car-frame.ts): the
 * colour (sRGB) and the finish. A part the livery does not paint answers null.
 */
export function paintAt(livery: Livery, part: LiveryPart, p: Vec3): Paint | null {
  const spec = livery.parts[part];
  if (!spec) return null;
  let colour = colourAt(livery, spec.colour, p);
  let finishName = spec.finish;
  for (const layer of spec.layers ?? []) {
    const d = regionDistance(layer.region, p);
    if (d >= 0) {
      colour = colourAt(livery, layer.colour, p);
      finishName = layer.finish ?? finishName;
    } else if (layer.edge && d >= -layer.edge.width) {
      colour = colourAt(livery, layer.edge.colour, p);
    }
  }
  return { colour: colour.map(linearToSrgb) as unknown as Rgb, finishName, finish: FINISHES[finishName] };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The orthonormal frame of a decal: right, up (made perpendicular to the normal) and the normal. */
export function decalFrame(d: Pick<DecalPlacement, "normal" | "up">): { right: Vec3; up: Vec3; normal: Vec3 } {
  const normal = unit(d.normal);
  const k = dot(d.up, normal);
  const up = unit([d.up[0] - normal[0] * k, d.up[1] - normal[1] * k, d.up[2] - normal[2] * k]);
  return { right: cross(up, normal), up, normal };
}

/**
 * Where a decal's artwork is at a rest-pose position: texture coordinates (v up, so v = 1 is the
 * artwork's top), or null outside its clip box. With a surface normal, also null on a face turned
 * away from the decal (dot below `facing`).
 */
export function decalHit(d: DecalPlacement, p: Vec3, surfaceNormal?: Vec3): { u: number; v: number } | null {
  const f = decalFrame(d);
  const rel: Vec3 = [p[0] - d.centre[0], p[1] - d.centre[1], p[2] - d.centre[2]];
  const a = dot(rel, f.right);
  const b = dot(rel, f.up);
  if (Math.abs(a) > d.size[0] / 2 || Math.abs(b) > d.size[1] / 2 || Math.abs(dot(rel, f.normal)) > d.depth) return null;
  if (surfaceNormal && d.facing !== undefined && dot(unit(surfaceNormal), f.normal) < d.facing) return null;
  return { u: a / d.size[0] + 0.5, v: b / d.size[1] + 0.5 };
}
