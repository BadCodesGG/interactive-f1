/**
 * The wind tunnel's colours per theme, as plain data (no three): the canvas ground, the fill light,
 * the floor grid, the mirror floor, the smoke and the streaks and flakes riding it. The smoke is near-white on the dark tunnel; the light tunnel sits on
 * the page's --ground (globals.css), where white smoke would vanish, so it is drawn in graphite instead.
 */
import type { Theme } from "@/engine/explode";

export interface TunnelLook {
  background: string;
  hemisphere: { sky: string; ground: string; intensity: number };
  /** GridHelper colours: the minor grid's [centre line, lines] and the major grid's lines. */
  grid: { minor: [string, string]; major: string };
  /** Smoke colour, the ribbon's peak opacity (its middle; it falls off as a gaussian to the edges) and its full width in metres at the nozzle (it diffuses wider downstream). */
  flow: { smoke: string; opacity: number; width: number };
  /** The polished floor: the pool of colour it lays under the car, that pool's peak opacity, and how much of the car it mirrors at most (0 to 1). */
  floor: { base: string; pool: number; reflect: number };
  /** The hairline streaks and the flakes (colour and peak opacity of each). Streaks read against the ground like the smoke does. */
  air: { streak: string; streakOpacity: number; flake: string; flakeOpacity: number };
}

const LOOKS: Record<Theme, TunnelLook> = {
  dark: {
    background: "#0e1320",
    hemisphere: { sky: "#dfe6f5", ground: "#1a1f2b", intensity: 1.6 },
    grid: { minor: ["#26304a", "#1a2236"], major: "#34405e" },
    flow: { smoke: "#f3f6fc", opacity: 0.6, width: 0.06 },
    floor: { base: "#04060b", pool: 0.85, reflect: 0.85 },
    air: { streak: "#f3f6fc", streakOpacity: 1, flake: "#a6adb9", flakeOpacity: 0.9 },
  },
  light: {
    background: "#e1e5ea",
    hemisphere: { sky: "#ffffff", ground: "#c9cfda", intensity: 1.6 },
    grid: { minor: ["#b3bccb", "#c9d0dc"], major: "#9aa5b8" },
    flow: { smoke: "#232937", opacity: 0.72, width: 0.06 },
    floor: { base: "#fbfcfe", pool: 0.9, reflect: 1 },
    air: { streak: "#12161d", streakOpacity: 0.95, flake: "#8a919c", flakeOpacity: 0.95 },
  },
};

export const tunnelLook = (theme: Theme): TunnelLook => LOOKS[theme];
