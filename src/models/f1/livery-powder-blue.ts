/**
 * 1. Powder blue and orange (gloss), docs/liveries.md. Powder blue body; a 0.32 m orange band on the top centreline from the
 * nose tip over the cockpit and down the engine cover to the end of the fin, with a 0.02 m navy pinline
 * either side, continued down each sidepod flank as a wide orange flash (t 0.35 to 0.6, the flank's lower
 * part). Endplates orange, planes and halo blue. Both monograms and the wordmark navy: the monogram's own
 * yellow-orange gradient would vanish on the orange band it sits on, so it is drawn in the pinline's navy.
 */
import { HALO, curveOf, standardDecals, wallW } from "./livery-kit";
import type { Livery } from "./livery-spec";

const PALETTE = { blue: "#8fc6e8", orange: "#f47b20", navy: "#1c2a44" } as const;
/** How far up the flank wall, from the belly, the flash reaches: a wedge that grows from nothing at t 0.35, holds under the wordmark and tapers out at t 0.6. */
const FLASH_HEIGHT = (t: number): number => (t <= 0.35 || t >= 0.6 ? 0.02 : t < 0.42 ? 0.02 + ((t - 0.35) / 0.07) * 0.36 : t <= 0.55 ? 0.38 : 0.38 - ((t - 0.55) / 0.05) * 0.36);
const PINLINE = { width: 0.02, colour: "navy" } as const;

export const POWDER_BLUE: Livery = {
  id: "powder-blue",
  name: "Powder blue and orange",
  palette: PALETTE,
  parts: {
    body: {
      colour: "blue",
      finish: "gloss",
      layers: [
        // The flash: below 0.38 of the flank wall's height, so it stays under the wordmark above it, tapering out at both ends.
        {
          colour: "orange",
          edge: PINLINE,
          region: { kind: "swoosh", from: 0.35, to: 0.6, lo: [[0.35, -9], [0.6, -9]], hi: curveOf([0.35, 0.42, 0.5, 0.55, 0.6], (t) => wallW(t, FLASH_HEIGHT(t))) },
        },
        { colour: "orange", edge: PINLINE, region: { kind: "centre", from: -0.01, to: 0.86, half: 0.16 } },
        { colour: "blue", region: HALO },
      ],
    },
    frontEndplate: { colour: "orange", finish: "gloss" },
    frontWing: { colour: "blue", finish: "gloss" },
    rearWing: { colour: "blue", finish: "gloss" },
    rearEndplate: { colour: "orange", finish: "gloss" },
  },
  decals: standardDecals({ mark: "navy", word: "navy", flankY: 0.42 }),
};
