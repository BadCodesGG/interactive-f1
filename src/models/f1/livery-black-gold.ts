/**
 * 3. Black and gold (gloss), docs/liveries.md. Gloss black body with 0.012 m gold pinstripes: along
 * each shoulder from the nose back, wrapping the sidepod's inlet edge and its top edge, and outlining the
 * engine cover's spine, with a second line 0.02 m inside the first on the nose and on the cover (a double
 * line). Wings and halo black, a gold pinstripe just inside every endplate edge. Both monograms and the
 * wordmark in gold. The deeper gold the spec lists for large fills is not used: nothing here is a fill.
 */
import { CAR_FRAME } from "./car-frame";
import { HALO, band, standardDecals } from "./livery-kit";
import type { Curve, Layer, Livery, Region } from "./livery-spec";

const PALETTE = { black: "#0b0b0c", gold: "#c9a44c" } as const;
const LINE = 0.012;
const PIN = { width: LINE, colour: "gold" } as const;

/** A pinstripe along a curve of the wrap coordinate, `LINE` wide. */
const along = (from: number, to: number, centre: Curve): Layer => ({ colour: "gold", region: { kind: "swoosh", from, to, ...band(centre, -LINE / 2, LINE / 2) } });

/** A black panel whose edge carries a pinstripe just outside it: the line outlines the panel. */
const outline = (region: Region): Layer => ({ colour: "black", edge: PIN, region });

/** An endplate's pinstripe: a line 0.008 m in from the plate's edge, all round its bounds. */
const plate = (b: { readonly min: readonly number[]; readonly max: readonly number[] }): Layer =>
  outline({ kind: "box", min: [b.min[0] + 0.02, b.min[1] + 0.02, -1], max: [b.max[0] - 0.02, b.max[1] - 0.02, 1] });

const SHOULDER: Curve = [[0.02, -0.012], [0.4, -0.012]];
const TOP_EDGE: Curve = [[0.4, -0.012], [0.5, 0], [0.6, 0.02], [0.68, 0.1]];

export const BLACK_GOLD: Livery = {
  id: "black-gold",
  name: "Black and gold",
  palette: PALETTE,
  parts: {
    body: {
      colour: "black",
      finish: "gloss",
      layers: [
        along(0.02, 0.4, SHOULDER),
        // The double line on the nose: a second stripe 0.02 m inside the first.
        along(0.02, 0.2, [[0.02, 0.02], [0.2, 0.02]]),
        along(0.4, 0.68, TOP_EDGE),
        // The sidepod's inlet edge: a vertical line across the front of each sidepod.
        { colour: "gold", region: { kind: "box", min: [-0.73, 0.28, 0.27], max: [-0.718, 0.66, 0.76], mirror: true } },
        // The spine, twice: two panels of the body's own black, each outlined by a gold line.
        outline({ kind: "centre", from: 0.58, to: 0.86, half: 0.1 }),
        outline({ kind: "centre", from: 0.58, to: 0.86, half: 0.068 }),
        { colour: "black", region: HALO },
      ],
    },
    frontEndplate: { colour: "black", finish: "gloss", layers: [plate(CAR_FRAME.parts["front-wing"].FrontEndplateLivery)] },
    frontWing: { colour: "black", finish: "gloss" },
    rearWing: { colour: "black", finish: "gloss" },
    rearEndplate: { colour: "black", finish: "gloss", layers: [plate(CAR_FRAME.parts["rear-wing"].RearEndplateLivery)] },
  },
  decals: standardDecals({ mark: "gold", word: "gold" }),
};
