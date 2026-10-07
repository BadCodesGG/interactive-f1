/**
 * A livery as data. The car has no UVs, so every rule here is a function of a rest-pose position in
 * metres (see car-frame.ts for the frame): the same data is read by the pure evaluator in
 * livery-paint.ts (the bake for AR and every test) and compiled to GLSL by livery-glsl.ts (the
 * stage). Three-free, so a server page or a test can import it.
 */

export type Vec3 = readonly [number, number, number];

/** A piecewise-linear curve: (x, y) control points, x increasing, held flat beyond the ends. */
export type Curve = readonly (readonly [number, number])[];

/** The four finishes the spec names (docs/liveries.md), each a MeshPhysicalMaterial preset. */
export type FinishName = "gloss" | "matte" | "satin" | "metallic";

export interface Finish {
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export const FINISHES: Record<FinishName, Finish> = {
  gloss: { metalness: 0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 },
  matte: { metalness: 0, roughness: 0.62, clearcoat: 0, clearcoatRoughness: 0.5 },
  satin: { metalness: 0, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3 },
  metallic: { metalness: 0.75, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.1 },
};

/** The parts of the F226 a livery paints, each on one source material of the scan. */
export type LiveryPart = "body" | "frontEndplate" | "frontWing" | "rearWing" | "rearEndplate";

export const LIVERY_PARTS: readonly LiveryPart[] = ["body", "frontEndplate", "frontWing", "rearWing", "rearEndplate"];

/** The material of the built GLB each part is painted on (its livery material keeps the source's name). */
export const PART_MATERIAL: Record<LiveryPart, string> = {
  body: "BodyLivery",
  frontEndplate: "FrontEndplateLivery",
  frontWing: "FrontWingLivery",
  rearWing: "RearWingLivery",
  rearEndplate: "RearEndplateLivery",
};

/** A palette key or a `#rrggbb` hex, or a gradient along `t` (stops: t, colour; blended linearly). */
export type Colour = string | { ramp: readonly (readonly [number, string])[] };

/**
 * Where a rule applies. Every kind yields a signed distance in metres, positive inside, so its edge
 * can be antialiased by the shader and given a border of a real width.
 * - `all`: everywhere on the part.
 * - `tBand`: along the car, between two values of `t`.
 * - `heightBelow`: below a line of body-height fraction (0 the body's lowest point, 1 its highest) over `t`.
 * - `swoosh`: between two curves of the wrap coordinate `w` over `t` (see wrapCoord in livery-paint.ts:
 *   metres around the section from the shoulder, positive up over the top, negative down the flank).
 * - `centre`: a band about the centreline, |z| within `half`, between two values of `t`.
 * - `box`: an axis-aligned box in rest metres; `mirror` tests |z| so one box covers both sides.
 */
export type Region =
  | { kind: "all" }
  | { kind: "tBand"; from: number; to: number }
  | { kind: "heightBelow"; line: Curve }
  | { kind: "swoosh"; from: number; to: number; lo: Curve; hi: Curve }
  | { kind: "centre"; from: number; to: number; half: number }
  | { kind: "box"; min: Vec3; max: Vec3; mirror?: boolean };

export interface Layer {
  colour: Colour;
  region: Region;
  /** Overrides the part's finish inside the region. */
  finish?: FinishName;
  /** A line of this width (metres) just outside the region's edge. */
  edge?: { width: number; colour: Colour };
}

export interface PartPaint {
  colour: Colour;
  finish: FinishName;
  /** Painted over the base in order: later layers win. */
  layers?: readonly Layer[];
}

export type DecalTexture = "mark" | "wordmark";

/**
 * A logo projected onto a part along `normal`, in rest metres. `up` (made perpendicular to `normal`)
 * is the direction the artwork's top points; its right is `up x normal`, which is what a viewer
 * looking at the surface sees as right, so a mirrored side reads correctly by passing its own
 * outward normal, never a flipped texture. Clipped to a box: `size` across and along `up`, `depth`
 * either side of the plane.
 */
export interface DecalPlacement {
  id: string;
  texture: DecalTexture;
  part: LiveryPart;
  centre: Vec3;
  normal: Vec3;
  up: Vec3;
  /** Width (along right) and height (along up), metres. */
  size: readonly [number, number];
  /** Half thickness of the clip box along `normal`, metres. */
  depth: number;
  /** A single colour the artwork's alpha is filled with; absent, the texture keeps its own colours. */
  colour?: Colour;
  /** Overrides the finish where the artwork is. */
  finish?: FinishName;
  /** Least dot of the surface normal with `normal` to take the artwork (the shader only; it keeps a decal off the back faces of thin parts). */
  facing?: number;
}

export interface Livery {
  id: string;
  name: string;
  /** Named colours for the rules below; a colour that is not a key is read as hex. */
  palette: Readonly<Record<string, string>>;
  parts: Partial<Record<LiveryPart, PartPaint>>;
  decals: readonly DecalPlacement[];
}
