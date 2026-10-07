/**
 * 6. Racing red (matte), docs/liveries.md. Red everywhere painted, with a white nose tip (t 0 to 0.06), a white
 * band 0.14 m wide wrapping the top of the car (cover and sidepod tops, to the shoulder lines) just ahead of the fin, and black on the sidepod's undercut below
 * 30 percent of the body's height. Front wing: black main plane, red endplates; rear wing: red upper
 * flap, black main plane, red endplates. Halo black. Monograms and wordmark white.
 */
import { HALO, standardDecals, tAt } from "./livery-kit";
import type { Livery } from "./livery-spec";

const PALETTE = { red: "#c8102e", white: "#f2f2f2", black: "#101010" } as const;

export const RACING_RED: Livery = {
  id: "racing-red",
  name: "Racing red",
  palette: PALETTE,
  parts: {
    body: {
      colour: "red",
      finish: "matte",
      layers: [
        { colour: "white", region: { kind: "tBand", from: -0.01, to: 0.06 } },
        // A band 0.14 m along the car (x 0.38 to 0.52), just ahead of the fin's blade, wrapped over the whole top from one shoulder
        // line to the other: the cover, the airbox and the sidepod tops, so it follows the surface down to the shoulder as a stripe.
        { colour: "white", region: { kind: "swoosh", from: tAt(0.38), to: tAt(0.52), lo: [[0, 0], [1, 0]], hi: [[0, 9], [1, 9]] } },
        // The undercut: the line is level from t 0.3, and below 0 (nothing) before it.
        { colour: "black", region: { kind: "heightBelow", line: [[0.28, -1], [0.3, 0.3], [1, 0.3]] } },
        { colour: "black", region: HALO },
      ],
    },
    frontEndplate: { colour: "red", finish: "matte" },
    frontWing: { colour: "black", finish: "matte" },
    rearWing: { colour: "black", finish: "matte", layers: [{ colour: "red", region: { kind: "box", min: [-9, 0.88, -9], max: [9, 9, 9] } }] },
    rearEndplate: { colour: "red", finish: "matte" },
  },
  decals: standardDecals({ mark: "white", word: "white", flankY: 0.335 }),
};
