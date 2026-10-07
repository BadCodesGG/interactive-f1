/**
 * 5. Silver to black with teal (metallic front, matte rear), docs/liveries.md. The body fades along the car
 * only: silver from the nose to t 0.3, through graphite to black by t 0.6. Its finish follows the fade in
 * three steps (metallic, satin from t 0.34, matte from t 0.5), since a finish has no gradient. A 0.03 m teal
 * line traces the sidepod's top edge from the inlet to the cover; a teal band on the front endplates' top
 * edge and the rear wing's trailing edge. Halo black. The monogram is black on the nose (silver there) and
 * silver on the fin (black there); the wordmark teal on the black flank.
 */
import { CAR_FRAME } from "./car-frame";
import { HALO, band, standardDecals } from "./livery-kit";
import type { Livery } from "./livery-spec";

const PALETTE = { silver: "#c5c9ce", graphite: "#2a2d31", black: "#0e0f11", teal: "#00a19b" } as const;
const FADE = { ramp: [[0.3, "silver"], [0.45, "graphite"], [0.6, "black"]] } as const;
const { FrontEndplateLivery: frontPlate } = CAR_FRAME.parts["front-wing"];
const { RearWingLivery: rearWing } = CAR_FRAME.parts["rear-wing"];

export const SILVER: Livery = {
  id: "silver",
  name: "Silver to black with teal",
  palette: PALETTE,
  parts: {
    body: {
      colour: FADE,
      finish: "metallic",
      layers: [
        { colour: FADE, finish: "satin", region: { kind: "tBand", from: 0.34, to: 2 } },
        { colour: FADE, finish: "matte", region: { kind: "tBand", from: 0.5, to: 2 } },
        { colour: "teal", region: { kind: "swoosh", from: 0.4, to: 0.72, ...band([[0.4, -0.01], [0.5, 0], [0.58, 0.02], [0.66, 0.1], [0.72, 0.22]], -0.015, 0.015) } },
        { colour: "black", finish: "matte", region: HALO },
      ],
    },
    frontEndplate: { colour: "silver", finish: "metallic", layers: [{ colour: "teal", region: { kind: "box", min: [-9, frontPlate.max[1] - 0.05, -9], max: [9, 9, 9] } }] },
    frontWing: { colour: "silver", finish: "metallic" },
    rearWing: { colour: "black", finish: "matte", layers: [{ colour: "teal", region: { kind: "box", min: [rearWing.max[0] - 0.045, -9, -9], max: [9, 9, 9] } }] },
    rearEndplate: { colour: "black", finish: "matte" },
  },
  decals: standardDecals({ nose: "black", fin: "silver", word: "teal" }),
};
