/**
 * The colour maths behind the site accent: how a livery's accent gets its hover and strong shades, and
 * the WCAG contrast the accent tests measure. Three-free and DOM-free. The accents themselves are in
 * livery-meta.ts; globals.css carries the shades this produces, and a test holds the two together.
 */

export type Rgb = readonly [number, number, number];

/** `#rrggbb` to 0..255 channels. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** `hex` moved `amount` (0..1) of the way toward `toward`, channel by channel in sRGB. */
export function mixHex(hex: string, toward: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(toward);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount) as unknown as Rgb);
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The hover and strong shades of an accent. On the dark theme hover lifts toward white by 30 percent,
 * so it stays readable on the near-black ground and keeps the dark text on it; strong (a deeper fill)
 * is 40 percent toward black. On the light theme both deepen by 25 percent toward black, so a white
 * label keeps its contrast on the hover fill.
 */
export function accentShades(accent: string, theme: "dark" | "light"): { hover: string; strong: string } {
  return theme === "dark" ? { hover: mixHex(accent, "#ffffff", 0.3), strong: mixHex(accent, "#000000", 0.4) } : { hover: mixHex(accent, "#000000", 0.25), strong: mixHex(accent, "#000000", 0.25) };
}
