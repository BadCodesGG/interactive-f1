/**
 * What the page needs to know about a livery without loading its paint rules: its id, its name, the
 * colours of its picker chip and the site accent it gives both themes (docs/liveries.md). Small and
 * three-free on purpose: the picker and the page copy live in a route's initial JS, and liveries.ts
 * drags in every livery's rules, the car frame and the evaluator. A test holds the names and the chip
 * colours to the liveries' own; globals.css carries the same accents as CSS, held to these by a test.
 */
export const LIVERY_IDS = ["powder-blue", "white-stripes", "black-gold", "orange-blue", "silver", "racing-red", "ghost", "badcodes"] as const;
export type LiveryId = (typeof LIVERY_IDS)[number];

/** A site accent for one theme: the colour, and the text colour on a fill of it. */
export interface Accent {
  accent: string;
  on: string;
}

export interface LiveryMeta {
  id: LiveryId;
  name: string;
  /** Two or three colours of the livery's palette, for the picker's chip. */
  chip: readonly string[];
  accents: { dark: Accent; light: Accent };
}

const DARK_ON = "#07080a";
const LIGHT_ON = "#ffffff";

const meta = (id: LiveryId, name: string, chip: readonly string[], dark: string, light: string): LiveryMeta => ({
  id,
  name,
  chip,
  accents: { dark: { accent: dark, on: DARK_ON }, light: { accent: light, on: LIGHT_ON } },
});

export const LIVERY_META: Record<LiveryId, LiveryMeta> = {
  "powder-blue": meta("powder-blue", "Powder blue and orange", ["#8fc6e8", "#f47b20", "#1c2a44"], "#f28a2e", "#9c4a0a"),
  "white-stripes": meta("white-stripes", "White with blue and red stripes", ["#f5f5f2", "#0d2a5c", "#3f9fd8"], "#5aa9e6", "#1b4f8a"),
  "black-gold": meta("black-gold", "Black and gold", ["#0b0b0c", "#c9a44c"], "#d4af37", "#7a5c10"),
  "orange-blue": meta("orange-blue", "Orange and blue", ["#ff8000", "#2f6db5", "#141414"], "#ff8000", "#a34d00"),
  silver: meta("silver", "Silver to black with teal", ["#c5c9ce", "#2a2d31", "#00a19b"], "#00d2be", "#006b61"),
  "racing-red": meta("racing-red", "Racing red", ["#c8102e", "#f2f2f2", "#101010"], "#ff3b3b", "#b3141c"),
  ghost: meta("ghost", "Ghost", ["#3a3d42", "#26282b", "#121314"], "#b8bec8", "#4a505a"),
  badcodes: meta("badcodes", "BadCodes original", ["#ffd000", "#ff7a00", "#e63312"], "#ffb000", "#b5360f"),
};

/**
 * The livery a query string asks for (with or without its leading `?`), or undefined for none. The
 * address bar is user input, so only the known ids count: anything else, an empty value, a repeat
 * with a bad first value or a look-alike is ignored.
 */
export function parseLiveryParam(search: string): LiveryId | undefined {
  return asLiveryId(new URLSearchParams(search).get("livery"));
}

/**
 * Ids the liveries went by before they were renamed to plain colour descriptions. Old share links
 * (`?livery=gulf`) and remembered choices still resolve, to the same colours under the new id.
 */
export const LEGACY_LIVERY_IDS: Readonly<Record<string, LiveryId>> = {
  gulf: "powder-blue",
  martini: "white-stripes",
  jps: "black-gold",
  papaya: "orange-blue",
  rosso: "racing-red",
};

/** A stored, address or attribute value as an id: a current id as it is, a legacy id as its new id, anything else undefined. */
export function asLiveryId(value: unknown): LiveryId | undefined {
  const current = LIVERY_IDS.find((id) => id === value);
  if (current) return current;
  return typeof value === "string" && Object.hasOwn(LEGACY_LIVERY_IDS, value) ? LEGACY_LIVERY_IDS[value] : undefined;
}
