/**
 * 2. White with blue and red stripes (gloss), docs/liveries.md. White body. Three parallel stripes (dark blue 0.07 m, light blue
 * 0.05 m, red 0.05 m, with 0.012 m white gaps) run from the nose along each side of the chassis, sweep up
 * over the sidepod's top edge at the inlet and along the engine cover's side to its tail, following the body
 * line. They cross the sidepod top rather than run the length of the flank, which leaves the flank white for
 * the wordmark. Wing planes and halo white, endplates dark blue. Both monograms and the wordmark dark blue:
 * the monogram's own yellow-orange gradient washes out on white under the key light (the nose one was
 * unreadable at the hero angle), so it is drawn in the stripes' dark blue.
 */
import { HALO, band, standardDecals } from "./livery-kit";
import type { Curve, Layer, Livery } from "./livery-spec";

const PALETTE = { white: "#f5f5f2", dark: "#0d2a5c", light: "#3f9fd8", red: "#d9272e" } as const;

/** Where the middle of the stripe pack runs, in the wrap coordinate: the chassis's side, over the sidepod's top edge, then the cover's side. */
const PACK: Curve = [[0.03, -0.06], [0.2, -0.14], [0.34, -0.2], [0.42, -0.2], [0.5, 0.02], [0.58, 0.2], [0.68, 0.3], [0.76, 0.22], [0.86, 0.12]];

/** Stripes top to bottom of the pack: offsets in metres from its middle. 0.07 + 0.012 + 0.05 + 0.012 + 0.05. */
const STRIPES = [
  ["dark", 0.027, 0.097],
  ["light", -0.035, 0.015],
  ["red", -0.097, -0.047],
] as const;

const stripe = ([colour, lo, hi]: (typeof STRIPES)[number]): Layer => ({
  colour,
  region: { kind: "swoosh", from: 0.03, to: 0.86, ...band(PACK, lo, hi) },
});

export const WHITE_STRIPES: Livery = {
  id: "white-stripes",
  name: "White with blue and red stripes",
  palette: PALETTE,
  parts: {
    body: { colour: "white", finish: "gloss", layers: [...STRIPES.map(stripe), { colour: "white", region: HALO }] },
    frontEndplate: { colour: "dark", finish: "gloss" },
    frontWing: { colour: "white", finish: "gloss" },
    rearWing: { colour: "white", finish: "gloss" },
    rearEndplate: { colour: "dark", finish: "gloss" },
  },
  decals: standardDecals({ mark: "dark", word: "dark", flankY: 0.335 }),
};
