/**
 * The eight liveries of docs/liveries.md by id. Three-free, so a test can import it. The ids, the
 * `?livery=<id>` parser and the names and accents the page needs are in livery-meta.ts, which is small
 * enough for a route's initial JS; this file carries every livery's paint rules.
 */
import { BADCODES } from "./livery-badcodes";
import { GHOST } from "./livery-ghost";
import { POWDER_BLUE } from "./livery-powder-blue";
import { BLACK_GOLD } from "./livery-black-gold";
import { WHITE_STRIPES } from "./livery-white-stripes";
import { ORANGE_BLUE } from "./livery-orange-blue";
import { RACING_RED } from "./livery-racing-red";
import { SILVER } from "./livery-silver";
import { LIVERY_IDS, parseLiveryParam, type LiveryId } from "./livery-meta";
import type { Livery } from "./livery-spec";

export { LIVERY_IDS, parseLiveryParam, type LiveryId };

export const LIVERIES: Record<LiveryId, Livery> = {
  "powder-blue": POWDER_BLUE,
  "white-stripes": WHITE_STRIPES,
  "black-gold": BLACK_GOLD,
  "orange-blue": ORANGE_BLUE,
  silver: SILVER,
  "racing-red": RACING_RED,
  ghost: GHOST,
  badcodes: BADCODES,
};
