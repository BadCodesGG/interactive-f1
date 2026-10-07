/**
 * 4. Orange and blue (matte), docs/liveries.md. Orange on the top surfaces and the upper flank, blue on the
 * lower chassis, the sidepod undercut and the nose's underside, split on a line that rises from the nose tip
 * to the sidepod inlet and then runs flat to the rear. The split is a fraction of the flank wall's height,
 * not of the whole body's (the spec's 40 and 55 percent of body height sit above the entire sidepod on this
 * scan, which would paint the flank blue): 30 percent of the wall at the nose tip rising to 34 percent at
 * the inlet (t 0.35). The fin's trailing third is blue. Front wing: orange endplates and a black main plane;
 * rear wing: orange planes, black endplates with a blue top edge. Halo orange. Monograms and wordmark black.
 */
import { curveOf, standardDecals, wallW } from "./livery-kit";
import type { Livery } from "./livery-spec";

const PALETTE = { orange: "#ff8000", blue: "#2f6db5", black: "#141414" } as const;

/** Fraction of the wall's height, from the floor, that is blue: rising to the inlet, flat after. */
const blueFraction = (t: number): number => 0.3 + 0.04 * Math.min(1, t / 0.35);

export const ORANGE_BLUE: Livery = {
  id: "orange-blue",
  name: "Orange and blue",
  palette: PALETTE,
  parts: {
    body: {
      colour: "orange",
      finish: "matte",
      layers: [
        { colour: "blue", region: { kind: "swoosh", from: -0.02, to: 0.9, lo: [[0, -9], [1, -9]], hi: curveOf([0, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9], (t) => wallW(t, blueFraction(t))) } },
        // The fin's trailing third: the blade from x 1.29 back.
        { colour: "blue", region: { kind: "box", min: [1.29, 0.45, -1], max: [3, 2, 1] } },
      ],
    },
    frontEndplate: { colour: "orange", finish: "matte" },
    frontWing: { colour: "black", finish: "matte" },
    rearWing: { colour: "orange", finish: "matte" },
    rearEndplate: { colour: "black", finish: "matte", layers: [{ colour: "blue", region: { kind: "box", min: [1, 0.9, -1], max: [3, 2, 1] } }] },
  },
  decals: standardDecals({ mark: "black", word: "black", flankY: 0.35 }),
};
