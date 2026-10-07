import type { CopyBook } from "@/engine/explode/copy";

/**
 * Copy for the fixture machine. An app built on the engine replaces this file with its own book; the shape is
 * PartCopy, and `npm run check:sidecar` fails if a sidecar part points at a key missing here.
 */
export const copyBook: CopyBook = {
  "fixture.base_plate": {
    id: "fixture.base_plate",
    label: "Base plate",
    group: "Structure",
    summary: "The flat deck every other part is measured from.",
    function: "Carries the columns and ties the frame into one rigid piece.",
    whyItMatters: "It sits exactly at the assembly centre, so it exercises the thinnest-axis push.",
    stats: [
      { label: "Size", value: "2.4 x 1.6 units" },
      { label: "Thickness", value: "0.1 units" },
    ],
  },
  "fixture.column_left": {
    id: "fixture.column_left",
    label: "Left column",
    group: "Structure",
    summary: "One of two uprights holding the head above the deck.",
    function: "Takes the head's weight down into the base plate.",
    whyItMatters: "A plain radial part: it moves straight out along the line from the centre.",
  },
  "fixture.column_right": {
    id: "fixture.column_right",
    label: "Right column",
    group: "Structure",
    summary: "The second upright, a mirror of the left one.",
    function: "Balances the load so the head stays level.",
    whyItMatters: "Its mirror image in the explode shows the radial directions are symmetric.",
  },
  "fixture.cover_top": {
    id: "fixture.cover_top",
    label: "Top cover",
    group: "Structure",
    summary: "A thin lid over the gear train.",
    function: "Keeps dust out of the mechanism.",
    whyItMatters: "It has an authored explode vector, so it lifts straight up rather than radially.",
  },
  "fixture.cover_front": {
    id: "fixture.cover_front",
    label: "Front cover",
    group: "Structure",
    summary: "The panel across the front of the lower frame.",
    function: "Closes the machine and carries the maker's plate.",
    whyItMatters: "Its node origin is at zero with the vertices baked in, so its centre must come from its bounds.",
    funFact: "Most exported models look like this, which is why position is never trusted as a centre.",
  },
  "fixture.head": {
    id: "fixture.head",
    label: "Head",
    group: "Mechanism",
    summary: "The beam across the top of the columns.",
    function: "Houses the output shaft driven by the gears.",
    whyItMatters: "It has an authored camera view, so focusing it uses setLookAt instead of fitToBox.",
  },
  "fixture.gear_a": {
    id: "fixture.gear_a",
    label: "Drive gear",
    group: "Mechanism",
    summary: "The larger of the two gears, with twelve teeth.",
    function: "Turns the driven gear at a lower speed and higher torque.",
    whyItMatters: "Its stage order starts it early in the mechanism window.",
    stats: [{ label: "Teeth", value: "12" }],
  },
  "fixture.gear_b": {
    id: "fixture.gear_b",
    label: "Driven gear",
    group: "Mechanism",
    summary: "The smaller gear, with eight teeth.",
    function: "Takes drive from the larger gear.",
    whyItMatters: "Its later order staggers it after the drive gear.",
    stats: [{ label: "Teeth", value: "8" }, { label: "Ratio", value: "1.5 : 1" }],
  },
  "fixture.core": {
    id: "fixture.core",
    label: "Core",
    group: "Mechanism",
    summary: "A small cube at the exact centre of the machine.",
    function: "Stands in for the part every exploded view hides in the middle.",
    whyItMatters: "Radial explode alone would leave it still; the thinnest-axis fallback moves it.",
  },
};
