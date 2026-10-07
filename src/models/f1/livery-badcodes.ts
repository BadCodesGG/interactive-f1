/**
 * 8. BadCodes original (gloss), docs/liveries.md. A black car with a swoosh: the logo's gradient
 * (yellow, orange, red, front to back) as a band that starts narrow under the nose's shoulder, widens
 * along the chassis and down each sidepod flank (widest there, with black left above it on the sidepod
 * top and below it toward the floor), then sweeps over the sidepod's top edge and narrows up the side of
 * the engine cover to end in red at the fin. The cockpit surround, the top of the chassis and the cover's
 * spine stay black, so black is well over half of the painted body. A 0.015 m white line borders the
 * swoosh. Wing endplates in the gradient, planes and halo black. The bc monogram in its own colours on
 * the black chassis nose and on both faces of the fin; the wordmark white on both sidepod flanks (on the
 * black above the swoosh) and the rear wing.
 */
import { HALO, standardDecals, wallW } from "./livery-kit";
import type { Livery } from "./livery-spec";

const PALETTE = { yellow: "#ffd000", orange: "#ff7a00", red: "#e63312", white: "#f7f7f5", black: "#0b0b0c" } as const;

/** The logo's gradient along the car: yellow over the nose and chassis, orange at the sidepod, red across the rear third of the swoosh and on. */
const GRADIENT = { ramp: [[0.1, "yellow"], [0.38, "orange"], [0.6, "red"]] } as const;

export const BADCODES: Livery = {
  id: "badcodes",
  name: "BadCodes original",
  palette: PALETTE,
  parts: {
    body: {
      colour: "black",
      finish: "gloss",
      layers: [
        {
          colour: GRADIENT,
          edge: { width: 0.015, colour: "white" },
          region: {
            kind: "swoosh",
            from: 0.05,
            to: 0.77,
            // Wrap coordinate w (metres from the shoulder line: the flank is negative, the top positive). A thin line under the nose's
            // shoulder at t 0.05, growing along the chassis's shoulder, then down to the middle of the sidepod's flank (from 0.06 to about 0.34 of
            // the wall's height up from the floor at t 0.5 to 0.6: black above it for the wordmark and the sidepod top, black below it
            // toward the floor), and from behind the wordmark up over the sidepod's tail and the cover's side to a point at t 0.77, ahead of the fin.
            lo: [[0.05, -0.05], [0.2, -0.11], [0.34, -0.14], [0.4, -0.14], [0.45, wallW(0.45, 0.12)], [0.5, wallW(0.5, 0.06)], [0.6, wallW(0.6, 0.06)], [0.67, -0.28], [0.72, -0.02], [0.75, 0.3], [0.77, 0.5]],
            hi: [[0.05, -0.03], [0.2, -0.02], [0.34, -0.01], [0.4, 0.02], [0.45, wallW(0.45, 0.72)], [0.5, wallW(0.5, 0.34)], [0.6, wallW(0.6, 0.44)], [0.67, -0.16], [0.72, 0.2], [0.75, 0.5], [0.77, 0.52]],
          },
        },
        // The halo stays black over the swoosh.
        { colour: "black", region: HALO },
      ],
    },
    frontEndplate: { colour: GRADIENT, finish: "gloss" },
    frontWing: { colour: "black", finish: "gloss" },
    rearWing: { colour: "black", finish: "gloss" },
    rearEndplate: { colour: GRADIENT, finish: "gloss" },
  },
  // The wordmark sits on the black wall above the swoosh.
  decals: standardDecals({ word: "white", flankX: 0.12, flankY: 0.44 }),
};
