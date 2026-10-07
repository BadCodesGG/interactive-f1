/**
 * 7. Ghost (matte, tone on tone), docs/liveries.md. Matte black everywhere; the engine cover and the sidepod
 * tops are satin black, so the split shows only as a change of sheen under the key light. A 0.01 m graphite
 * pinline along the chassis shoulder. Wings and halo matte black, endplates graphite. Both monograms and the
 * wordmarks are ghost grey in the gloss finish over the matte body, so they appear and vanish as the car turns
 * under the lights: the one car whose logos are about finish, not colour.
 */
import { HALO, standardDecals } from "./livery-kit";
import type { Livery } from "./livery-spec";

const PALETTE = { black: "#121314", graphite: "#26282b", ghost: "#3a3d42", satin: "#0c0d0e" } as const;

export const GHOST: Livery = {
  id: "ghost",
  name: "Ghost",
  palette: PALETTE,
  parts: {
    body: {
      colour: "black",
      finish: "matte",
      layers: [
        // Everything from the shoulder line up, from the sidepod inlet back: the sidepod tops and the cover.
        { colour: "satin", finish: "satin", region: { kind: "swoosh", from: 0.38, to: 0.9, lo: [[0.38, 0], [0.9, 0]], hi: [[0.38, 9], [0.9, 9]] } },
        { colour: "graphite", region: { kind: "swoosh", from: 0.05, to: 0.42, lo: [[0.05, -0.01], [0.42, -0.01]], hi: [[0.05, 0], [0.42, 0]] } },
        { colour: "black", finish: "matte", region: HALO },
      ],
    },
    frontEndplate: { colour: "graphite", finish: "matte" },
    frontWing: { colour: "black", finish: "matte" },
    rearWing: { colour: "black", finish: "matte" },
    rearEndplate: { colour: "graphite", finish: "matte" },
  },
  decals: standardDecals({ mark: "ghost", word: "ghost", finish: "gloss", flankY: 0.335 }),
};
