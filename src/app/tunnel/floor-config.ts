/**
 * The mirror floor's numbers, as plain data (no three). The floor is a big plane under the car that
 * reflects it (floor.ts). The reflection fades with distance from the car's footprint and blurs as it
 * does, so it reads as polished epoxy, not a perfect mirror; a pool of the floor's own colour lies
 * under it, so the car sits in a dark (or pale) glossy patch that dissolves into the tunnel's ground.
 */

export const FLOOR = {
  /** The plane's edge, metres (it discards everything the fades leave empty, so this only has to be big enough). */
  size: 26,
  /** The car's footprint on the floor: x from, x to, z from, z to. */
  footprint: [-2.9, 2.4, -0.95, 0.95],
  /** Metres from the footprint at which the reflection is gone, and the pool. */
  fade: 2.6,
  poolFade: 4.2,
  /** The blur is nil up to the first distance and full at the second (metres from the footprint): a low object like the underside or a tyre shows at the floor within a metre or so, and stays crisp. */
  blur: [0.5, 2.8],
  /** Mip level of the reflection at the footprint and at the far end of the fade: the roughness grows with distance. */
  lod: [0, 4.2],
  /** How far the taps spread, in reflection-texture units, near and far; the spread is stretched vertically (a floor smears reflections upwards). */
  radius: [0.0006, 0.03],
  /** Taps per pixel. */
  taps: { desktop: 10, mobile: 5 },
  /** The reflection texture's size against the canvas's drawing buffer, and its clamp in pixels. */
  scale: { desktop: 0.75, mobile: 0.35 },
  texture: { min: 256, max: 1280 },
  /** The grid fades out over these distances from the centre of the car (x, then radius from it), metres. */
  grid: { centreX: -0.3, from: 1.6, to: 6.4 },
} as const;

/** The reflection texture's size for a drawing buffer of w x h pixels. */
export function reflectionSize(w: number, h: number, mobile: boolean): [number, number] {
  const k = FLOOR.scale[mobile ? "mobile" : "desktop"];
  const { min, max } = FLOOR.texture;
  const fit = (n: number) => Math.round(Math.min(Math.max(n * k, min), max));
  return [fit(w), fit(h)];
}
